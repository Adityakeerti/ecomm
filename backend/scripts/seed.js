/* eslint-disable no-console */
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function queryOne(client, text, params) {
  const res = await client.query(text, params);
  return res.rows[0] || null;
}

async function ensureCity(client, { name, state, country = 'IN' }) {
  const inserted = await queryOne(
    client,
    `INSERT INTO cities (name, state, country)
     VALUES ($1, $2, $3)
     ON CONFLICT (name) DO UPDATE SET state = EXCLUDED.state
     RETURNING *`,
    [name, state, country]
  );
  if (inserted) return inserted;
  return queryOne(client, `SELECT * FROM cities WHERE name = $1`, [name]);
}

async function ensureCategory(client, { name, slug }) {
  const inserted = await queryOne(
    client,
    `INSERT INTO categories (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [name, slug]
  );
  if (inserted) return inserted;
  return queryOne(client, `SELECT * FROM categories WHERE slug = $1`, [slug]);
}

async function ensureZone(client, { city_id, label, center_lat, center_lng, radius_km }) {
  // No known unique constraint from code, so do a soft "find then insert".
  const existing = await queryOne(
    client,
    `SELECT * FROM delivery_zones
     WHERE city_id = $1 AND label = $2
     ORDER BY id DESC
     LIMIT 1`,
    [city_id, label]
  );
  if (existing) return existing;

  return queryOne(
    client,
    `INSERT INTO delivery_zones
      (city_id, label, center_lat, center_lng, radius_km, min_order_count, cutoff_time, is_active)
     VALUES
      ($1, $2, $3::numeric, $4::numeric, $5::numeric, 5, '14:00:00', TRUE)
     RETURNING *`,
    [city_id, label, center_lat, center_lng, radius_km]
  );
}

async function ensureProductWithDefaultVariant(client, { category_id, name, slug, description, base_price_paise }) {
  const product = await queryOne(
    client,
    `INSERT INTO products
      (name, slug, description, base_price_paise, category_id, instagram_post_url, meta, image_url, is_active)
     VALUES
      ($1, $2, $3, $4, $5, NULL, NULL, NULL, TRUE)
     ON CONFLICT (slug) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       base_price_paise = EXCLUDED.base_price_paise,
       category_id = EXCLUDED.category_id
     RETURNING *`,
    [name, slug, description || null, base_price_paise, category_id]
  );

  // Default variant: sku unique; use a deterministic seed SKU.
  const sku = `${slug.toUpperCase().replace(/[^A-Z0-9]+/g, '-')}-DEFAULT`;

  const variant = await queryOne(
    client,
    `INSERT INTO product_variants (product_id, size, colour, sku, price_paise)
     VALUES ($1, NULL, NULL, $2, $3)
     ON CONFLICT (sku) DO UPDATE SET price_paise = EXCLUDED.price_paise
     RETURNING *`,
    [product.id, sku, base_price_paise]
  );

  // Inventory: ensure row exists, then bump quantity to at least N.
  await client.query(
    `INSERT INTO inventory (variant_id, quantity, reserved)
     VALUES ($1, $2, 0)
     ON CONFLICT (variant_id) DO NOTHING`,
    [variant.id, 50]
  );

  await client.query(
    `UPDATE inventory
     SET quantity = GREATEST(quantity, $2)
     WHERE variant_id = $1`,
    [variant.id, 50]
  );

  const inventory = await queryOne(client, `SELECT * FROM inventory WHERE variant_id = $1`, [variant.id]);
  return { product, variant, inventory };
}

async function getAnyCustomer(client) {
  return queryOne(
    client,
    `SELECT id, phone_number, full_name, email
     FROM customers
     ORDER BY id DESC
     LIMIT 1`
  );
}

async function ensureCustomerUser(client) {
  const existing = await getAnyCustomer(client);
  if (existing) {
    return { customer: existing, created: false };
  }

  const phone = '+919999990001';
  const fullName = 'Demo User';
  const email = 'demo.user@example.com';

  const customer = await queryOne(
    client,
    `INSERT INTO customers (phone_number, full_name, email)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_number) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email
     RETURNING id, phone_number, full_name, email`,
    [phone, fullName, email]
  );

  return { customer, created: true };
}

async function ensureAddress(client, { customer_id, city_id, address_line, pincode, lat, lng }) {
  // Keep it simple: always insert a new address (history).
  return queryOne(
    client,
    `INSERT INTO delivery_addresses (customer_id, address_line, city_id, pincode, lat, lng)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [customer_id, address_line, city_id, pincode || null, lat, lng]
  );
}

async function createOrder(client, { customer_id, address_id, zone_id, items, notes }) {
  const total_paise = items.reduce((sum, i) => sum + i.price_paise * i.qty, 0);
  const order = await queryOne(
    client,
    `INSERT INTO orders
      (customer_id, address_id, zone_id, customer_display_id, status, total_paise, payment_status, payment_gateway, notes)
     VALUES
      ($1, $2, $3, 'TEMP', 'PENDING', $4, 'INITIATED', 'PHONEPE', $5)
     RETURNING id, order_number`,
    [customer_id, address_id, zone_id, total_paise, notes || null]
  );

  for (const item of items) {
    await client.query(
      `INSERT INTO order_items (order_id, variant_id, quantity, unit_price_paise)
       VALUES ($1, $2, $3, $4)`,
      [order.id, item.variant_id, item.qty, item.price_paise]
    );
  }

  // Match checkout behavior for customer_display_id
  const displayId = `Demo-${order.order_number}`;
  await client.query(`UPDATE orders SET customer_display_id = $1 WHERE id = $2`, [displayId, order.id]);

  return order;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Set it in backend/.env (or environment variables).');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const city = await ensureCity(client, { name: 'Bengaluru', state: 'KA', country: 'IN' });
    const zone = await ensureZone(client, {
      city_id: city.id,
      label: 'Central Bengaluru',
      center_lat: 12.9716,
      center_lng: 77.5946,
      radius_km: 15,
    });

    const categories = [];
    categories.push(await ensureCategory(client, { name: "Men's Clothing", slug: 'mens-clothing' }));
    categories.push(await ensureCategory(client, { name: "Women's Clothing", slug: 'womens-clothing' }));
    categories.push(await ensureCategory(client, { name: 'Accessories', slug: 'accessories' }));

    const seededProducts = [];
    seededProducts.push(await ensureProductWithDefaultVariant(client, {
      category_id: categories[0].id,
      name: 'Classic White T-Shirt',
      slug: 'classic-white-tshirt',
      description: 'Premium quality 100% cotton basic crewneck t-shirt. Breathable and comfortable for everyday wear.',
      base_price_paise: 129900,
    }));
    seededProducts.push(await ensureProductWithDefaultVariant(client, {
      category_id: categories[1].id,
      name: 'Slim Fit Denim Jeans',
      slug: 'slim-fit-denim-jeans',
      description: 'Classic high-waisted slim fit stretch denim jeans. Durable fabric with a modern silhouette.',
      base_price_paise: 249900,
    }));
    seededProducts.push(await ensureProductWithDefaultVariant(client, {
      category_id: categories[2].id,
      name: 'Leather Bi-fold Wallet',
      slug: 'leather-bifold-wallet',
      description: 'Genuine full-grain leather wallet with multiple card slots and cash compartments.',
      base_price_paise: 99900,
    }));

    const { customer, created } = await ensureCustomerUser(client);
    const address = await ensureAddress(client, {
      customer_id: customer.id,
      city_id: city.id,
      address_line: '12, MG Road, Near Metro Station',
      pincode: '560001',
      lat: 12.975,
      lng: 77.606,
    });

    // Create one sample order only if the customer has no orders yet.
    const existingOrder = await queryOne(
      client,
      `SELECT id FROM orders WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
      [customer.id]
    );

    let order = null;
    if (!existingOrder) {
      order = await createOrder(client, {
        customer_id: customer.id,
        address_id: address.id,
        zone_id: zone.id,
        items: [
          { variant_id: seededProducts[0].variant.id, qty: 1, price_paise: seededProducts[0].variant.price_paise },
          { variant_id: seededProducts[1].variant.id, qty: 2, price_paise: seededProducts[1].variant.price_paise },
        ],
        notes: 'Seed order',
      });
    }

    await client.query('COMMIT');

    console.log('Seed complete.');
    console.log('');
    console.log('Customer user credentials (storefront):');
    console.log(`- phone: ${customer.phone_number}`);
    console.log(`- email: ${customer.email}`);
    console.log(`- full_name: ${customer.full_name}`);
    console.log(`- status: ${created ? 'created' : 'already existed'}`);
    if (order) console.log(`- sample_order_number: ${order.order_number}`);
    console.log('');
    console.log('Notes: admin + delivery creds were not modified by this script.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch(async () => {
    try { await pool.end(); } catch { /* ignore */ }
    process.exitCode = 1;
  });
