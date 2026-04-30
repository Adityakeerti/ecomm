-- =============================================================================
-- 09_saved_addresses.sql — Add saved_addresses JSONB column to customers
-- Run once after 06_customers_auth.sql.
-- =============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS saved_addresses JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN customers.saved_addresses IS
  'Array of saved delivery addresses for storefront checkout autofill. Max 20 entries.';
