require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./src/utils/db');

async function seedAdmin() {
  try {
    const hash = await bcrypt.hash('admin_test', 10);
    await pool.query(
      `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      ['admin_test', hash]
    );
    console.log('✅ admin_test created/updated successfully.');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    process.exit(0);
  }
}

seedAdmin();
