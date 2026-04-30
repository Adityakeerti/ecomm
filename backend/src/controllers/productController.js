const pool = require('../utils/db');
const { ok, notFound } = require('../utils/response');

/**
 * GET /v1/products
 * Optionally filter by ?category=Hoodies
 */
exports.getProducts = async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM v_product_listing';
    const params = [];

    if (category) {
      query += ' WHERE category = $1';
      params.push(category);
    }

    const result = await pool.query(query, params);
    return ok(res, result.rows);
  } catch (err) {
    console.error('getProducts error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /v1/products/:slug
 * Single product by slug
 */
exports.getProductBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const result = await pool.query(
      'SELECT * FROM v_product_listing WHERE slug = $1',
      [slug]
    );

    if (result.rows.length === 0) {
      return notFound(res, 'Product not found');
    }

    return ok(res, result.rows[0]);
  } catch (err) {
    console.error('getProductBySlug error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /v1/products/categories
 * Public category list for storefront filters.
 */
exports.getCategories = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, slug
       FROM categories
       WHERE is_active = TRUE
       ORDER BY name ASC`
    );
    return ok(res, rows);
  } catch (err) {
    console.error('getCategories error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
/**
 * GET /v1/products/:slug/variants
 * Returns all active variants + available stock for a product.
 */
exports.getVariantsBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    // First confirm product exists
    const prodResult = await pool.query(
      'SELECT id FROM products WHERE slug = $1 AND is_active = TRUE',
      [slug]
    );
    if (prodResult.rows.length === 0) {
      return notFound(res, 'Product not found');
    }
    const productId = prodResult.rows[0].id;

    const { rows } = await pool.query(
      `SELECT pv.id, pv.size, pv.colour, pv.sku, pv.price_paise,
              COALESCE(inv.quantity - inv.reserved, 0) AS available_stock
       FROM product_variants pv
       LEFT JOIN inventory inv ON inv.variant_id = pv.id
       WHERE pv.product_id = $1 AND pv.is_active = TRUE
       ORDER BY pv.price_paise ASC, pv.size ASC, pv.colour ASC`,
      [productId]
    );

    return ok(res, rows);
  } catch (err) {
    console.error('getVariantsBySlug error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
