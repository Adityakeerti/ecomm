-- =============================================================================
-- 06_customers_auth.sql  — Add email/password auth fields to customers
-- Run once after 01_schema.sql.
-- =============================================================================

-- Allow email-only account creation for storefront auth.
ALTER TABLE customers
  ALTER COLUMN phone_number DROP NOT NULL;

-- Add password hash for account-based login.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Case-insensitive unique email for authenticated customers.
-- Multiple NULL emails remain allowed (for phone-only order records).
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_email_ci
  ON customers (LOWER(email))
  WHERE email IS NOT NULL;

COMMENT ON COLUMN customers.password_hash IS
  'bcrypt hash for storefront login; NULL for guest/phone-only customer records';
