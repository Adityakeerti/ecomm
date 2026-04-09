const { v4: uuidv4 } = require('uuid');
const pool = require('../utils/db');
const { uploadImage } = require('../utils/imageStorage');

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
};

const parseOptionalJson = (value) => {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return typeof value === 'string' ? JSON.parse(value) : value;
};

/**
 * POST /admin/products
 * Body (multipart/form-data or JSON):
 *   name, slug, description, base_price_paise, category_id,
 *   instagram_post_url, meta (JSON string), image (file)
 */
exports.createProduct = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name, slug, description, base_price_paise,
      category_id, instagram_post_url, meta,
    } = req.body;

    // Validation
    if (!name || !slug || !base_price_paise || !category_id) {
      return res.status(400).json({
        success: false,
        message: 'name, slug, base_price_paise, and category_id are required',
      });
    }

    const parsedBasePrice = parsePositiveInt(base_price_paise);
    const parsedCategoryId = parsePositiveInt(category_id);
    if (!parsedBasePrice || !parsedCategoryId) {
      return res.status(400).json({
        success: false,
        message: 'base_price_paise and category_id must be positive integers',
      });
    }

    await client.query('BEGIN');

    let imageUrl = null;

    // Handle image upload if file is present
    if (req.file) {
      const originalName = req.file.originalname || '';
      const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
      const filename = `products/${uuidv4()}.${ext}`;
      imageUrl = await uploadImage(req.file.buffer, filename, req.file.mimetype);
    }

    let parsedMeta;
    try {
      parsedMeta = parseOptionalJson(meta);
    } catch (metaErr) {
      return res.status(400).json({ success: false, message: 'meta must be valid JSON' });
    }

    const { rows } = await client.query(
      `INSERT INTO products
        (name, slug, description, base_price_paise, category_id, instagram_post_url, meta, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name, slug, description || null,
        parsedBasePrice, parsedCategoryId,
        instagram_post_url || null, parsedMeta, imageUrl,
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create product error:', err);

    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Product with this slug already exists' });
    }

    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
};

/**
 * PUT /admin/products/:id
 * Body: only fields present will be updated
 *   name, slug, description, base_price_paise, category_id,
 *   instagram_post_url, meta (JSON string), image (file)
 */
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Build dynamic SET clause from provided fields
    const allowedFields = [
      'name', 'slug', 'description', 'base_price_paise',
      'category_id', 'instagram_post_url', 'meta',
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        let value = req.body[field];

        if (field === 'base_price_paise' || field === 'category_id') {
          value = parsePositiveInt(value);
          if (!value) {
            return res.status(400).json({
              success: false,
              message: `${field} must be a positive integer`,
            });
          }
        }

        if (field === 'meta') {
          try {
            value = parseOptionalJson(value);
          } catch (metaErr) {
            return res.status(400).json({ success: false, message: 'meta must be valid JSON' });
          }
        }

        setClauses.push(`${field} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    // Handle image upload if file is present
    if (req.file) {
      const originalName = req.file.originalname || '';
      const ext = originalName.includes('.') ? originalName.split('.').pop() : 'bin';
      const filename = `products/${uuidv4()}.${ext}`;
      const imageUrl = await uploadImage(req.file.buffer, filename, req.file.mimetype);

      setClauses.push(`image_url = $${paramIndex}`);
      values.push(imageUrl);
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }

    values.push(id);

    const { rows, rowCount } = await pool.query(
      `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Update product error:', err);

    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Product with this slug already exists' });
    }

    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * PATCH /admin/products/:id/toggle
 * Flip the is_active boolean
 */
exports.toggleActive = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows, rowCount } = await pool.query(
      `UPDATE products SET is_active = NOT is_active WHERE id = $1 RETURNING *`,
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Toggle product error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * POST /admin/products/:id/variants
 * Body: { size, colour, sku, price_paise }
 * Also creates an inventory row with quantity = 0
 */
exports.addVariant = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id: product_id } = req.params;
    const { size, colour, sku, price_paise } = req.body;

    if (!sku || price_paise === undefined) {
      return res.status(400).json({
        success: false,
        message: 'sku and price_paise are required',
      });
    }

    const parsedPrice = parsePositiveInt(price_paise);
    if (!parsedPrice) {
      return res.status(400).json({
        success: false,
        message: 'price_paise must be a positive integer',
      });
    }

    // Verify product exists
    const productCheck = await client.query('SELECT id FROM products WHERE id = $1', [product_id]);
    if (productCheck.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    await client.query('BEGIN');

    // Insert variant
    const { rows: variantRows } = await client.query(
      `INSERT INTO product_variants (product_id, size, colour, sku, price_paise)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [product_id, size || null, colour || null, sku, parsedPrice]
    );

    const variant = variantRows[0];

    // Insert inventory row with quantity = 0
    await client.query(
      `INSERT INTO inventory (variant_id, quantity, reserved)
       VALUES ($1, 0, 0)`,
      [variant.id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: {
        ...variant,
        inventory: { quantity: 0, reserved: 0 },
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add variant error:', err);

    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Variant with this SKU or size/colour combo already exists' });
    }

    res.status(500).json({ success: false, message: 'Internal server error' });
  } finally {
    client.release();
  }
};

/**
 * PATCH /admin/inventory/:variantId/restock
 * Body: { quantity_to_add }
 */
exports.restockInventory = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { quantity_to_add } = req.body;

    const quantityToAdd = parsePositiveInt(quantity_to_add);
    if (!quantityToAdd) {
      return res.status(400).json({
        success: false,
        message: 'quantity_to_add must be a positive number',
      });
    }

    const { rows, rowCount } = await pool.query(
      `UPDATE inventory
       SET quantity = quantity + $1, last_restocked = NOW()
       WHERE variant_id = $2
       RETURNING *`,
      [quantityToAdd, variantId]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Inventory record not found for this variant' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Restock error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
