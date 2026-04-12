const pool = require('../utils/db');
const valkey = require('../utils/valkey');
const { haversineKm } = require('../utils/geo');
const { ok, error, notFound } = require('../utils/response');

/**
 * Validate checkout data — shared by both /checkout/validate and /payments/initiate.
 * Returns { valid, errors, zone, cartData } 
 */
async function runValidation({ cart_token, full_name, phone, email, address_line, pincode, lat, lng }) {
  const errors = [];

  // 1. Required fields
  if (!cart_token) errors.push({ field: 'cart_token', message: 'Cart token is required' });
  if (!full_name || full_name.trim().length < 2) errors.push({ field: 'full_name', message: 'Full name is required (min 2 chars)' });
  if (!phone || !/^\+91\d{10}$/.test(phone)) errors.push({ field: 'phone', message: 'Phone must be in +91XXXXXXXXXX format' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ field: 'email', message: 'Valid email is required' });
  if (!address_line || address_line.trim().length < 5) errors.push({ field: 'address_line', message: 'Delivery address is required (min 5 chars)' });
  if (lat == null || lng == null) errors.push({ field: 'lat/lng', message: 'GPS coordinates are required' });

  if (errors.length > 0) {
    return { valid: false, errors, zone: null, cartData: null };
  }

  // 2. Cart exists and has items
  const raw = await valkey.get(`cart:${cart_token}`);
  if (!raw) {
    errors.push({ field: 'cart_token', message: 'Cart not found or expired' });
    return { valid: false, errors, zone: null, cartData: null };
  }

  const cartData = JSON.parse(raw);
  if (!cartData.items || cartData.items.length === 0) {
    errors.push({ field: 'cart', message: 'Cart is empty' });
    return { valid: false, errors, zone: null, cartData: null };
  }

  // 3. Zone validation — check GPS is in a delivery zone
  const { rows: zones } = await pool.query(
    `SELECT id, label, city_id, center_lat, center_lng, radius_km
     FROM delivery_zones WHERE is_active = TRUE`
  );

  let matchedZone = null;
  for (const zone of zones) {
    const dist = haversineKm(
      parseFloat(lat), parseFloat(lng),
      parseFloat(zone.center_lat), parseFloat(zone.center_lng)
    );
    if (dist <= parseFloat(zone.radius_km)) {
      matchedZone = zone;
      break;
    }
  }

  if (!matchedZone) {
    errors.push({ field: 'location', message: 'Your location is not within any delivery zone' });
    return { valid: false, errors, zone: null, cartData };
  }

  // 4. Inventory check — ensure all items are still available
  for (const item of cartData.items) {
    const { rows } = await pool.query(
      `SELECT (quantity - reserved) AS available FROM inventory WHERE variant_id = $1`,
      [item.variant_id]
    );
    if (rows.length === 0 || rows[0].available < item.qty) {
      errors.push({
        field: 'inventory',
        message: `Variant ${item.variant_id} has insufficient stock`,
        variant_id: item.variant_id
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, zone: matchedZone, cartData };
  }

  return { valid: true, errors: [], zone: matchedZone, cartData };
}


/**
 * POST /checkout/validate
 * Run zone + inventory + form validation, return errors[].
 */
exports.validateCheckout = async (req, res) => {
  try {
    const result = await runValidation(req.body);

    if (!result.valid) {
      return error(res, 'Validation failed', result.errors, 422);
    }

    return ok(res, {
      valid: true,
      zone_id: result.zone.id,
      zone_label: result.zone.label,
      item_count: result.cartData.items.length,
      cart_total_paise: result.cartData.items.reduce((sum, i) => sum + i.price_paise * i.qty, 0)
    }, 'Checkout validation passed');
  } catch (err) {
    console.error('validateCheckout error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


/**
 * POST /payments/initiate
 * The most complex endpoint — creates customer, address, order, order_items, payment_event.
 * ALL inside a single DB transaction.
 */
exports.initiatePayment = async (req, res) => {
  const {
    cart_token, full_name, phone, email,
    address_line, pincode, lat, lng, notes
  } = req.body;

  // Step 1: Run checkout validation
  const validation = await runValidation(req.body);
  if (!validation.valid) {
    return error(res, 'Validation failed', validation.errors, 422);
  }

  const { zone, cartData } = validation;
  const total_paise = cartData.items.reduce((sum, i) => sum + i.price_paise * i.qty, 0);

  // Steps 2–9 inside a TRANSACTION
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Step 2: Upsert customer
    const { rows: [customer] } = await client.query(
      `INSERT INTO customers (phone_number, full_name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone_number) DO UPDATE SET full_name = $2, email = $3
       RETURNING id, phone_number`,
      [phone, full_name.trim(), email]
    );

    // Step 3: Insert delivery address
    const { rows: [address] } = await client.query(
      `INSERT INTO delivery_addresses (customer_id, address_line, city_id, pincode, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [customer.id, address_line, zone.city_id, pincode || null, lat, lng]
    );

    // Step 4 + 5: Insert order (order_number auto-generated by trigger)
    const { rows: [order] } = await client.query(
      `INSERT INTO orders (customer_id, address_id, zone_id, customer_display_id, status, total_paise, payment_status, payment_gateway, notes)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, 'INITIATED', 'PHONEPE', $6)
       RETURNING id, order_number`,
      [customer.id, address.id, zone.id, 'TEMP', total_paise, notes || null]
    );

    // Step 6: Insert order_items (inventory decrement trigger fires on each insert)
    for (const item of cartData.items) {
      await client.query(
        `INSERT INTO order_items (order_id, variant_id, quantity, unit_price_paise)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.variant_id, item.qty, item.price_paise]
      );
    }

    // Step 7 + 8: Generate customer_display_id and update order
    const firstName = full_name.trim().split(' ')[0];
    const last4 = phone.slice(-4);
    const displayId = `${firstName}-${last4}-${order.order_number}`;

    await client.query(
      `UPDATE orders SET customer_display_id = $1 WHERE id = $2`,
      [displayId, order.id]
    );

    // Step 9: Create payment_event (INITIATED)
    const gatewayRef = `PP-${order.order_number}-${Date.now()}`;
    await client.query(
      `INSERT INTO payment_events (order_id, gateway_ref, event_type, status, amount_paise, raw_payload)
       VALUES ($1, $2, 'PAYMENT_INITIATED', 'INITIATED', $3, $4)`,
      [order.id, gatewayRef, total_paise, JSON.stringify({
        order_id: order.id,
        order_number: order.order_number,
        amount_paise: total_paise,
        initiated_at: new Date().toISOString()
      })]
    );

    await client.query('COMMIT');

    // Step 10: Generate PhonePe payment URL
    // In production, this would call the PhonePe SDK/API
    // For now, generate a mock URL (will be replaced with real PhonePe integration)
    const payment_url = `https://phonepe.com/pay/${gatewayRef}?amount=${total_paise}&order=${order.order_number}`;

    // Clean up: delete the Valkey cart (items already committed to order)
    // Release reserved inventory since the decrement_inventory trigger already reduced quantity
    for (const item of cartData.items) {
      await pool.query(
        `UPDATE inventory SET reserved = GREATEST(reserved - $1, 0) WHERE variant_id = $2`,
        [item.qty, item.variant_id]
      );
    }
    await valkey.del(`cart:${cart_token}`);

    // Step 11: Return payment URL + order info
    return ok(res, {
      order_id: order.id,
      order_number: order.order_number,
      customer_display_id: displayId,
      total_paise,
      payment_url,
      gateway_ref: gatewayRef
    }, 'Payment initiated');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('initiatePayment transaction error:', err);

    // Check if it's an inventory error from the DB trigger
    if (err.message && err.message.includes('Insufficient stock')) {
      return error(res, 'Insufficient stock — order rolled back', [], 409);
    }

    res.status(500).json({ success: false, message: 'Payment initiation failed', error: err.message });
  } finally {
    client.release();
  }
};
