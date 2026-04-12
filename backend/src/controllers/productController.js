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
