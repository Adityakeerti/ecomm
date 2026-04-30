const crypto = require('crypto');
const pool = require('../utils/db');
const valkey = require('../utils/valkey');
const emailService = require('../services/emailService');

/**
 * Verify PhonePe's HMAC-SHA256 signature.
 * PhonePe sends: base64(payload) + saltKey → SHA256 → hex + "###" + saltIndex
 */
function verifyPhonePeSignature(rawPayload, signature) {
  const saltKey = process.env.PHONEPE_SALT_KEY;
  const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';

  const hash = crypto
    .createHash('sha256')
    .update(rawPayload + saltKey)
    .digest('hex');

  const expected = `${hash}###${saltIndex}`;
  return expected === signature;
}

/**
 * POST /payments/webhook
 * PhonePe calls this after every payment event.
 * ALWAYS return HTTP 200 — PhonePe retries on non-200.
 */
exports.handleWebhook = async (req, res) => {
  try {
    // PhonePe sends: { response: "<base64-encoded-payload>", ... }
    // and X-VERIFY header with the signature
    const signature = req.headers['x-verify'];
    const { response: encodedPayload } = req.body;

    // --- 1. Signature Verification ---
    if (!signature || !encodedPayload) {
      console.warn('Webhook: missing signature or payload');
      // Return 200 so PhonePe doesn't retry spam, but log it
      return res.status(200).json({ success: false, message: 'Invalid request' });
    }

    const isValid = verifyPhonePeSignature(encodedPayload, signature);
    if (!isValid) {
      console.warn('Webhook: signature verification FAILED');
      return res.status(200).json({ success: false, message: 'Signature mismatch' });
    }

    // --- 2. Decode payload ---
    let payload;
    try {
      const decoded = Buffer.from(encodedPayload, 'base64').toString('utf8');
      payload = JSON.parse(decoded);
    } catch (err) {
      console.error('Webhook: failed to decode payload', err);
      return res.status(200).json({ success: false, message: 'Payload decode error' });
    }

    const { merchantTransactionId: gatewayRef, amount: payloadAmountPaise, code } = payload?.data || {};
    const isSuccess = code === 'PAYMENT_SUCCESS';

    console.log(`Webhook received: ${code} | ref=${gatewayRef}`);

    // --- 3. Fetch order from DB using gateway_ref (NEVER trust payload amounts) ---
    const { rows: orders } = await pool.query(
      `SELECT o.id, o.order_number, o.total_paise, o.payment_status, o.customer_id
       FROM orders o
       JOIN payment_events pe ON pe.order_id = o.id
       WHERE pe.gateway_ref = $1
       LIMIT 1`,
      [gatewayRef]
    );

    if (orders.length === 0) {
      console.warn(`Webhook: no order found for gateway_ref=${gatewayRef}`);
      return res.status(200).json({ success: false, message: 'Order not found' });
    }

    const order = orders[0];

    // Idempotency: already processed → skip
    if (order.payment_status === 'SUCCESS' || order.payment_status === 'FAILED') {
      console.log(`Webhook: order ${order.order_number} already processed (${order.payment_status})`);
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    // --- 4. Verify amount matches DB (tamper protection) ---
    if (payloadAmountPaise && parseInt(payloadAmountPaise) !== parseInt(order.total_paise)) {
      console.error(`Webhook: AMOUNT MISMATCH! DB=${order.total_paise}, payload=${payloadAmountPaise}`);
      // Log but do NOT process — potential fraud
      await pool.query(
        `INSERT INTO payment_events (order_id, gateway_ref, event_type, status, amount_paise, raw_payload)
         VALUES ($1, $2, 'AMOUNT_MISMATCH', 'FAILED', $3, $4)`,
        [order.id, gatewayRef, payloadAmountPaise, JSON.stringify(payload)]
      );
      return res.status(200).json({ success: false, message: 'Amount mismatch — flagged' });
    }

    // --- 5. Process based on success/failure ---
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (isSuccess) {
        // Update order: payment_status = SUCCESS, status = PENDING (awaiting dispatch)
        await client.query(
          `UPDATE orders SET payment_status = 'SUCCESS', payment_ref = $1, paid_at = NOW()
           WHERE id = $2`,
          [gatewayRef, order.id]
        );

        // Fetch order_items to release reserved inventory
        const { rows: items } = await client.query(
          `SELECT variant_id, quantity FROM order_items WHERE order_id = $1`,
          [order.id]
        );

        // Release reserved inventory (inventory.quantity already decremented by trigger at order creation)
        for (const item of items) {
          await client.query(
            `UPDATE inventory SET reserved = GREATEST(reserved - $1, 0) WHERE variant_id = $2`,
            [item.quantity, item.variant_id]
          );
        }

        // Log payment_event SUCCESS
        await client.query(
          `INSERT INTO payment_events (order_id, gateway_ref, event_type, status, amount_paise, raw_payload)
           VALUES ($1, $2, 'PAYMENT_SUCCESS', 'SUCCESS', $3, $4)`,
          [order.id, gatewayRef, order.total_paise, JSON.stringify(payload)]
        );

        // Log receipt (WhatsApp channel)
        await client.query(
          `INSERT INTO receipt_log (order_id, channel, recipient, status, payload, sent_at)
           VALUES ($1, 'WHATSAPP_WA_ME', $2, 'SENT', $3, NOW())`,
          [
            order.id,
            `order_${order.order_number}`,
            JSON.stringify({ event: 'payment_success', order_number: order.order_number })
          ]
        );

        await client.query('COMMIT');
        console.log(`Webhook: ORDER ${order.order_number} → SUCCESS ✅`);

        // Send email receipt OUTSIDE the transaction (email failure must not roll back payment)
        // Fetch full order detail + items for the email
        setImmediate(async () => {
          try {
            const { rows: [fullOrder] } = await pool.query(
              `SELECT v.*, c.email AS customer_email
               FROM v_order_summary v
               JOIN orders o ON o.order_number = v.order_number
               JOIN customers c ON c.id = o.customer_id
               WHERE v.order_number = $1`,
              [order.order_number]
            );
            const { rows: emailItems } = await pool.query(
              `SELECT p.name AS product_name, pv.size, pv.colour, oi.quantity, oi.unit_price_paise, oi.subtotal_paise
               FROM order_items oi
               JOIN product_variants pv ON pv.id = oi.variant_id
               JOIN products p ON p.id = pv.product_id
               WHERE oi.order_id = $1`,
              [order.id]
            );
            if (fullOrder?.customer_email) {
              await emailService.sendOrderReceipt(fullOrder, fullOrder.customer_email, emailItems);
            }
          } catch (emailErr) {
            console.error('Email: post-webhook send failed:', emailErr.message);
          }
        });

      } else {
        // PAYMENT FAILED
        // Update order payment_status = FAILED
        await client.query(
          `UPDATE orders SET payment_status = 'FAILED' WHERE id = $1`,
          [order.id]
        );

        // Restore inventory: quantity was decremented by trigger, now add it back
        const { rows: items } = await client.query(
          `SELECT variant_id, quantity FROM order_items WHERE order_id = $1`,
          [order.id]
        );

        for (const item of items) {
          await client.query(
            `UPDATE inventory
             SET quantity = quantity + $1, reserved = GREATEST(reserved - $1, 0)
             WHERE variant_id = $2`,
            [item.quantity, item.variant_id]
          );
        }

        // Log payment_event FAILED
        await client.query(
          `INSERT INTO payment_events (order_id, gateway_ref, event_type, status, amount_paise, raw_payload)
           VALUES ($1, $2, 'PAYMENT_FAILED', 'FAILED', $3, $4)`,
          [order.id, gatewayRef, order.total_paise, JSON.stringify(payload)]
        );

        await client.query('COMMIT');
        console.log(`Webhook: ORDER ${order.order_number} → FAILED ❌`);
      }

      return res.status(200).json({ success: true, message: `Processed: ${code}` });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Webhook: transaction error', err);
      // Return 200 so PhonePe doesn't retry — log the error internally
      return res.status(200).json({ success: false, message: 'Internal processing error' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Webhook: unexpected handler error', err);
    return res.status(200).json({ success: false, message: 'Internal processing error' });
  }
};

/**
 * Helper: generate a valid PhonePe-style signed payload for testing.
 * ONLY for test environments — never expose this in production routes.
 */
exports.generateTestSignature = (payloadObj) => {
  const saltKey = process.env.PHONEPE_SALT_KEY;
  const saltIndex = process.env.PHONEPE_SALT_INDEX || '1';
  const encodedPayload = Buffer.from(JSON.stringify(payloadObj)).toString('base64');
  const hash = crypto.createHash('sha256').update(encodedPayload + saltKey).digest('hex');
  const signature = `${hash}###${saltIndex}`;
  return { encodedPayload, signature };
};
