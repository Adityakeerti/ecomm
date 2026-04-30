-- =============================================================================
-- APPLY THIS MIGRATION TO YOUR DATABASE
-- =============================================================================
-- This adds landmark support and updates views for the delivery portal
-- Run this in your PostgreSQL database (curator_ecom)

-- Step 1: Add landmark column to delivery_addresses
ALTER TABLE delivery_addresses ADD COLUMN IF NOT EXISTS landmark VARCHAR(255);

COMMENT ON COLUMN delivery_addresses.landmark IS 'Nearby landmark for easy navigation by delivery staff';

-- Step 2: Update the v_batch_stops_detail view to include landmark
DROP VIEW IF EXISTS v_batch_stops_detail;

CREATE VIEW v_batch_stops_detail AS
SELECT
    bs.id                AS stop_id,
    bs.batch_id,
    bs.stop_number,
    bs.status            AS stop_status,
    o.order_number,
    o.customer_display_id,
    c.full_name          AS customer_name,
    c.phone_number       AS customer_phone,
    da.address_line,
    da.landmark,
    da.lat,
    da.lng,
    o.total_paise,
    JSON_AGG(
        JSON_BUILD_OBJECT(
            'product', p.name,
            'variant', CONCAT(pv.size, ' / ', pv.colour),
            'qty', oi.quantity
        )
    ) AS items
FROM batch_stops bs
JOIN orders o               ON o.id = bs.order_id
JOIN customers c            ON c.id = o.customer_id
JOIN delivery_addresses da  ON da.id = o.address_id
JOIN order_items oi         ON oi.order_id = o.id
JOIN product_variants pv    ON pv.id = oi.variant_id
JOIN products p             ON p.id = pv.product_id
GROUP BY bs.id, bs.batch_id, bs.stop_number, bs.status,
         o.order_number, o.customer_display_id, c.full_name,
         c.phone_number, da.address_line, da.landmark, da.lat, da.lng, o.total_paise;

-- Verification queries (optional - run these to confirm changes)
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'delivery_addresses' AND column_name = 'landmark';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'v_batch_stops_detail' AND column_name = 'landmark';

-- Migration complete!
