const pool = require('../utils/db');
const valkey = require('../utils/valkey');
const { haversineKm } = require('../utils/geo');
const { ok, error, notFound } = require('../utils/response');

const COD_CHARGE_PAISE = 1000;

function normalizeIndianPhone(rawPhone) {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return null;
}

/**
 * Validate checkout data — shared by both /checkout/validate and /payments/initiate.
 * Returns { valid, errors, zone, cartData } 
 */
async function runValidation({ cart_token, full_name, phone, email, address_line, landmark, pincode, lat, lng }) {
  const errors = [];

  // 1. Required fields
  if (!cart_token) errors.push({ field: 'cart_token', message: 'Cart token is required' });
  if (!full_name || full_name.trim().length < 2) errors.push({ field: 'full_name', message: 'Full name is required (min 2 chars)' });
  const normalizedPhone = normalizeIndianPhone(phone);
  if (!normalizedPhone) errors.push({ field: 'phone', message: 'Phone must be a valid Indian mobile number' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push({ field: 'email', message: 'Valid email is required' });
  if (!address_line || address_line.trim().length < 5) errors.push({ field: 'address_line', message: 'Delivery address is required (min 5 chars)' });
  if (lat == null || lng == null) errors.push({ field: 'lat/lng', message: 'GPS coordinates are required' });

  if (errors.length > 0) {
    return { valid: false, errors, zone: null, cartData: null, normalizedPhone: null };
  }

  // 2. Cart exists and has items
  const raw = await valkey.get(`cart:${cart_token}`);
  if (!raw) {
    errors.push({ field: 'cart_token', message: 'Cart not found or expired' });
    return { valid: false, errors, zone: null, cartData: null, normalizedPhone };
  }

  const cartData = JSON.parse(raw);
  if (!cartData.items || cartData.items.length === 0) {
    errors.push({ field: 'cart', message: 'Cart is empty' });
    return { valid: false, errors, zone: null, cartData: null, normalizedPhone };
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
    return { valid: false, errors, zone: null, cartData, normalizedPhone };
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
    return { valid: false, errors, zone: matchedZone, cartData, normalizedPhone };
  }

  return { valid: true, errors: [], zone: matchedZone, cartData, normalizedPhone };
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
  let client;
  try {
    const {
      cart_token, full_name, phone, email,
      address_line, landmark, pincode, lat, lng, notes, payment_method, save_address, address_label, is_dev_bypass
    } = req.body;

    // Step 1: Run checkout validation
    const validation = await runValidation(req.body);
    if (!validation.valid) {
      return error(res, 'Validation failed', validation.errors, 422);
    }

    const { zone, cartData, normalizedPhone } = validation;

    // Always recalculate line prices from DB at payment time.
    const variantIds = cartData.items.map((item) => item.variant_id);
    const { rows: priceRows } = await pool.query(
      `SELECT id AS variant_id, price_paise
       FROM product_variants
       WHERE id = ANY($1::uuid[]) AND is_active = TRUE`,
      [variantIds]
    );

    const priceMap = new Map(priceRows.map((row) => [row.variant_id, parseInt(row.price_paise, 10)]));
    const pricedItems = [];
    const changedItems = [];
    for (const item of cartData.items) {
      const livePrice = priceMap.get(item.variant_id);
      if (!livePrice) {
        return error(res, `Variant ${item.variant_id} is unavailable`, [], 409);
      }
      const snapshotPrice = parseInt(item.price_paise, 10);
      if (snapshotPrice !== livePrice) {
        changedItems.push({
          variant_id: item.variant_id,
          previous_price_paise: snapshotPrice,
          updated_price_paise: livePrice,
        });
      }
      pricedItems.push({ ...item, live_price_paise: livePrice });
    }
    const subtotal_paise = pricedItems.reduce((sum, i) => sum + i.live_price_paise * i.qty, 0);
    const normalizedPaymentMethod = String(payment_method || 'ONLINE').toUpperCase();
    const isCod = normalizedPaymentMethod === 'COD';
    const cod_charge_paise = isCod ? COD_CHARGE_PAISE : 0;
    const total_paise = subtotal_paise + cod_charge_paise;

    // Steps 2–9 inside a TRANSACTION
    client = await pool.connect();
    await client.query('BEGIN');

    // Step 2: Resolve customer by phone/email, then update-or-create.
    // We have unique constraints on both phone_number and lower(email),
    // so relying on ON CONFLICT(phone_number) alone can fail when email already exists.
    const { rows: phoneMatches } = await client.query(
      `SELECT id, phone_number, email
       FROM customers
       WHERE phone_number = $1
       LIMIT 1`,
      [normalizedPhone]
    );
    const { rows: emailMatches } = await client.query(
      `SELECT id, phone_number, email
       FROM customers
       WHERE email IS NOT NULL AND LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    const phoneCustomer = phoneMatches[0] || null;
    const emailCustomer = emailMatches[0] || null;
    const mergedConflict =
      phoneCustomer && emailCustomer && phoneCustomer.id !== emailCustomer.id;

    // If phone and email point to different customers, prefer the email owner.
    const existing = mergedConflict ? emailCustomer : (phoneCustomer || emailCustomer);

    let customer;
    if (existing) {
      // Only write phone_number when it won't collide with a different row.
      const canWritePhone = !phoneCustomer || phoneCustomer.id === existing.id;
      const { rows: [updated] } = await client.query(
        `UPDATE customers
         SET full_name = $2,
             email = COALESCE($3, email),
             phone_number = CASE
               WHEN $4 THEN COALESCE(phone_number, $1)
               ELSE phone_number
             END
         WHERE id = $5
         RETURNING id, phone_number`,
        [normalizedPhone, full_name.trim(), email, canWritePhone, existing.id]
      );
      customer = updated;
    } else {
      const { rows: [createdCustomer] } = await client.query(
        `INSERT INTO customers (phone_number, full_name, email)
         VALUES ($1, $2, $3)
         RETURNING id, phone_number`,
        [normalizedPhone, full_name.trim(), email]
      );
      customer = createdCustomer;
    }

    // Step 3: Insert delivery address
    const { rows: [address] } = await client.query(
      `INSERT INTO delivery_addresses (customer_id, address_line, landmark, city_id, pincode, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [customer.id, address_line, landmark || null, zone.city_id, pincode || null, lat, lng]
    );

    if (save_address !== false) {
      const { rows: savedRows } = await client.query(
        `SELECT saved_addresses FROM customers WHERE id = $1`,
        [customer.id]
      );
      const existing = Array.isArray(savedRows[0]?.saved_addresses) ? savedRows[0].saved_addresses : [];
      const candidate = {
        label: address_label || 'Checkout Address',
        full_name: full_name.trim(),
        phone: normalizedPhone,
        email: String(email || '').trim(),
        address_line: String(address_line || '').trim(),
        landmark: String(landmark || '').trim() || null,
        pincode: String(pincode || '').trim(),
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
      };
      const exists = existing.some(
        (a) =>
          String(a.address_line || '').trim().toLowerCase() === candidate.address_line.toLowerCase() &&
          String(a.pincode || '').trim() === candidate.pincode
      );
      if (!exists && candidate.address_line) {
        const next = [candidate, ...existing].slice(0, 20);
        await client.query(
          `UPDATE customers SET saved_addresses = $1::jsonb WHERE id = $2`,
          [JSON.stringify(next), customer.id]
        );
      }
    }

    // Step 4 + 5: Insert order (order_number auto-generated by trigger)
    const firstName = full_name.trim().split(' ')[0];
    const last4 = normalizedPhone.slice(-4);
    const customerDisplayId = `${firstName}-${last4}-${Date.now().toString().slice(-6)}`;

    const initialPaymentStatus = is_dev_bypass ? 'SUCCESS' : 'INITIATED';

    const { rows: [order] } = await client.query(
      `INSERT INTO orders (customer_id, address_id, zone_id, customer_display_id, status, total_paise, payment_status, payment_gateway, notes)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, $8, $6, $7)
       RETURNING id, order_number`,
      [
        customer.id,
        address.id,
        zone.id,
        customerDisplayId,
        total_paise,
        isCod ? 'COD' : (process.env.PAYMENT_GATEWAY || 'PHONEPE'),
        notes || null,
        initialPaymentStatus
      ]
    );

    // Step 6: Insert order_items (inventory decrement trigger fires on each insert)
    for (const item of pricedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, variant_id, quantity, unit_price_paise)
         VALUES ($1, $2, $3, $4)`,
        [order.id, item.variant_id, item.qty, item.live_price_paise]
      );
    }

    // Step 9: Create payment_event
    const gatewayRef = `PP-${order.order_number}-${Date.now()}`;
    await client.query(
      `INSERT INTO payment_events (order_id, gateway_ref, event_type, status, amount_paise, raw_payload)
       VALUES ($1, $2, $5, $6, $3, $4)`,
      [order.id, gatewayRef, total_paise, JSON.stringify({
        order_id: order.id,
        order_number: order.order_number,
        amount_paise: total_paise,
        initiated_at: new Date().toISOString()
      }), is_dev_bypass ? 'PAYMENT_SUCCESS' : 'PAYMENT_INITIATED', initialPaymentStatus]
    );

    await client.query('COMMIT');

    // Step 10: Generate PhonePe payment URL
    // In production, this would call the PhonePe SDK/API
    // For now, generate a mock URL (will be replaced with real PhonePe integration)
    const payment_url = isCod
      ? null
      : `https://phonepe.com/pay/${gatewayRef}?amount=${total_paise}&order=${order.order_number}`;

    // Clean up: delete the Valkey cart (items already committed to order)
    // Release reserved inventory since the decrement_inventory trigger already reduced quantity
    for (const item of pricedItems) {
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
      customer_display_id: customerDisplayId,
      payment_method: isCod ? 'COD' : 'ONLINE',
      cod_charge_paise,
      subtotal_paise,
      total_paise,
      payment_url,
      gateway_ref: gatewayRef,
      price_updates: changedItems
    }, 'Payment initiated');

  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('initiatePayment transaction error:', err);

    // Check if it's an inventory error from the DB trigger
    if (err.message && err.message.includes('Insufficient stock')) {
      return error(res, 'Insufficient stock — order rolled back', [], 409);
    }

    res.status(500).json({ success: false, message: 'Payment initiation failed', error: err.message });
  } finally {
    if (client) client.release();
  }
};

/**
 * POST /payments/dev-initiate
 * Dev-only helper: creates an order with fallback values to unblock local testing.
 */
exports.devInitiatePayment = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }

  try {
    const { cart_token } = req.body || {};
    if (!cart_token) {
      return error(res, 'cart_token is required for dev initiate', [], 400);
    }

    const { rows: zones } = await pool.query(
      `SELECT center_lat, center_lng
       FROM delivery_zones
       WHERE is_active = TRUE
       ORDER BY id ASC
       LIMIT 1`
    );
    if (zones.length === 0) {
      return error(res, 'No active delivery zones configured', [], 400);
    }

    req.body = {
      cart_token,
      full_name: req.body?.full_name?.trim() || 'Dev User',
      phone: req.body?.phone?.trim() || '9999999999',
      email: req.body?.email?.trim() || 'dev@curator.local',
      address_line: req.body?.address_line?.trim() || 'Dev Address, Test Lane',
      pincode: req.body?.pincode?.trim() || '000000',
      notes: req.body?.notes?.trim() || 'Dev quick order',
      lat: req.body?.lat ?? Number(zones[0].center_lat),
      lng: req.body?.lng ?? Number(zones[0].center_lng),
      is_dev_bypass: true,
      payment_method: req.body?.payment_method || 'ONLINE',
    };

    return exports.initiatePayment(req, res);
  } catch (err) {
    console.error('devInitiatePayment error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
