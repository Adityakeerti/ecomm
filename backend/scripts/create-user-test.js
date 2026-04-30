/* eslint-disable no-console */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/utils/db');

async function createUserTest() {
  const username = 'user_test';
  const password = 'user_test';

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO admins (username, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash`,
      [username, passwordHash]
    );

    console.log('User created/updated successfully.');
    console.log(`- username: ${username}`);
    console.log(`- password: ${password}`);
    console.log('- table: admins');
  } catch (err) {
    console.error('Failed to create user_test:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createUserTest();
