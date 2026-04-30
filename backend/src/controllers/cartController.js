const { v4: uuidv4 } = require('uuid');
const valkey = require('../utils/valkey');
const pool = require('../utils/db');
const { ok, notFound, error } = require('../utils/response');

const CART_TTL = 3600; // 60 minutes in seconds

/**
 * POST /cart/session
 * Create a new cart session — empty cart in Valkey with 15-min TTL.
 */
exports.createSession = async (req, res) => {
  try {
    const token = uuidv4();
    const cart = { phone: null, items: [] };

    await valkey.set(`cart:${token}`, JSON.stringify(cart), 'EX', CART_TTL);

    return ok(res, { token, cart }, 'Cart session created');
  } catch (err) {
    console.error('createSession error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /cart/:token
 * Fetch cart from Valkey, parse JSON, calculate total.
 */
exports.getCart = async (req, res) => {
  try {
    const { token } = req.params;
    const raw = await valkey.get(`cart:${token}`);

    if (!raw) {
      return notFound(res, 'Cart not found or expired');
    }

    const cart = JSON.parse(raw);
    const cart_total_paise = cart.items.reduce((sum, i) => sum + i.price_paise * i.qty, 0);

    return ok(res, { ...cart, cart_total_paise });
  } catch (err) {
    console.error('getCart error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /cart/:token/items
 * Body: { variant_id, qty }
 * Check inventory, reserve stock, add item to cart.
 */
exports.addItem = async (req, res) => {
  try {
    const { token } = req.params;
    const { variant_id, qty } = req.body;

    if (!variant_id || !qty || qty < 1) {
      return error(res, 'variant_id and qty (>= 1) are required');
    }

    // Fetch cart
    const raw = await valkey.get(`cart:${token}`);
    if (!raw) {
      return notFound(res, 'Cart not found or expired');
    }

    const cart = JSON.parse(raw);

    // Check if item already in cart
    const existing = cart.items.find(i => i.variant_id === variant_id);
    if (existing) {
      return error(res, 'Item already in cart. Use PUT to update quantity.');
    }

    // Get variant price
    const { rows: variants } = await pool.query(
      `SELECT pv.id, pv.price_paise, pv.size, pv.colour, p.name AS product_name
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.id = $1 AND pv.is_active = TRUE`,
      [variant_id]
    );

    if (variants.length === 0) {
      return notFound(res, 'Variant not found or inactive');
    }

    // Reserve inventory — atomic check-and-update
    const { rowCount } = await pool.query(
      `UPDATE inventory SET reserved = reserved + $1
       WHERE variant_id = $2 AND (quantity - reserved) >= $1`,
      [qty, variant_id]
    );

    if (rowCount === 0) {
      return error(res, 'Insufficient stock', [], 409);
    }

    // Add item to cart
    cart.items.push({
      variant_id,
      qty,
      price_paise: parseInt(variants[0].price_paise),
      product_name: variants[0].product_name,
      size: variants[0].size,
      colour: variants[0].colour
    });

    // Save cart and refresh TTL
    await valkey.set(`cart:${token}`, JSON.stringify(cart), 'EX', CART_TTL);

    const cart_total_paise = cart.items.reduce((sum, i) => sum + i.price_paise * i.qty, 0);
    return ok(res, { ...cart, cart_total_paise }, 'Item added to cart');
  } catch (err) {
    console.error('addItem error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PUT /cart/:token/items/:variantId
 * Body: { qty }
 * Update quantity for an item already in cart.
 */
exports.updateItem = async (req, res) => {
  try {
    const { token, variantId } = req.params;
    const { qty } = req.body;

    if (!qty || qty < 1) {
      return error(res, 'qty (>= 1) is required');
    }

    const raw = await valkey.get(`cart:${token}`);
    if (!raw) {
      return notFound(res, 'Cart not found or expired');
    }

    const cart = JSON.parse(raw);
    const item = cart.items.find(i => i.variant_id === variantId);

    if (!item) {
      return notFound(res, 'Item not found in cart');
    }

    const qtyDiff = qty - item.qty;

    if (qtyDiff > 0) {
      // Need more stock — try to reserve the difference
      const { rowCount } = await pool.query(
        `UPDATE inventory SET reserved = reserved + $1
         WHERE variant_id = $2 AND (quantity - reserved) >= $1`,
        [qtyDiff, variantId]
      );
      if (rowCount === 0) {
        return error(res, 'Insufficient stock for requested quantity', [], 409);
      }
    } else if (qtyDiff < 0) {
      // Releasing stock — unreserve the difference
      await pool.query(
        `UPDATE inventory SET reserved = GREATEST(reserved + $1, 0) WHERE variant_id = $2`,
        [qtyDiff, variantId]
      );
    }

    item.qty = qty;
    await valkey.set(`cart:${token}`, JSON.stringify(cart), 'EX', CART_TTL);

    const cart_total_paise = cart.items.reduce((sum, i) => sum + i.price_paise * i.qty, 0);
    return ok(res, { ...cart, cart_total_paise }, 'Cart updated');
  } catch (err) {
    console.error('updateItem error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * DELETE /cart/:token/items/:variantId
 * Remove a single item from cart, release reserved stock.
 */
exports.removeItem = async (req, res) => {
  try {
    const { token, variantId } = req.params;

    const raw = await valkey.get(`cart:${token}`);
    if (!raw) {
      return notFound(res, 'Cart not found or expired');
    }

    const cart = JSON.parse(raw);
    const itemIndex = cart.items.findIndex(i => i.variant_id === variantId);

    if (itemIndex === -1) {
      return notFound(res, 'Item not found in cart');
    }

    const removed = cart.items[itemIndex];

    // Release reserved stock
    await pool.query(
      `UPDATE inventory SET reserved = GREATEST(reserved - $1, 0) WHERE variant_id = $2`,
      [removed.qty, variantId]
    );

    cart.items.splice(itemIndex, 1);
    await valkey.set(`cart:${token}`, JSON.stringify(cart), 'EX', CART_TTL);

    const cart_total_paise = cart.items.reduce((sum, i) => sum + i.price_paise * i.qty, 0);
    return ok(res, { ...cart, cart_total_paise }, 'Item removed from cart');
  } catch (err) {
    console.error('removeItem error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * DELETE /cart/:token
 * Delete entire cart, release all reserved inventory.
 */
exports.deleteCart = async (req, res) => {
  try {
    const { token } = req.params;

    const raw = await valkey.get(`cart:${token}`);
    if (!raw) {
      return notFound(res, 'Cart not found or expired');
    }

    const cart = JSON.parse(raw);

    // Release all reserved inventory
    for (const item of cart.items) {
      await pool.query(
        `UPDATE inventory SET reserved = GREATEST(reserved - $1, 0) WHERE variant_id = $2`,
        [item.qty, item.variant_id]
      );
    }

    // Delete the Valkey key
    await valkey.del(`cart:${token}`);

    return ok(res, null, 'Cart deleted and inventory released');
  } catch (err) {
    console.error('deleteCart error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
