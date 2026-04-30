-- =============================================================================
-- Zone Mismatch Diagnostic
-- =============================================================================
-- Run this to find why orders aren't showing in dispatch

-- 1. Check ALL zones
SELECT id, label, is_active, cutoff_time, min_order_count 
FROM delivery_zones;

-- 2. Check which zone your orders are assigned to
SELECT 
    o.order_number,
    o.zone_id,
    dz.label AS zone_label,
    dz.is_active AS zone_active,
    o.status,
    o.payment_status
FROM orders o
LEFT JOIN delivery_zones dz ON dz.id = o.zone_id
WHERE o.customer_id = 'e2c753a1-52b1-49d7-932c-ecb77638cd19'
ORDER BY o.created_at DESC;

-- 3. Check dispatch readiness for EACH zone
SELECT 
    dz.label,
    dz.is_active,
    COUNT(o.id) AS pending_orders,
    dz.min_order_count AS required,
    CURRENT_TIME,
    dz.cutoff_time,
    CASE 
        WHEN dz.is_active = FALSE THEN '❌ Zone Inactive'
        WHEN CURRENT_TIME < dz.cutoff_time THEN '❌ Before Cutoff'
        WHEN COUNT(o.id) < dz.min_order_count THEN '❌ Not Enough Orders'
        ELSE '✅ Should Show in Dispatch'
    END AS status
FROM delivery_zones dz
LEFT JOIN orders o ON o.zone_id = dz.id 
    AND o.status IN ('PENDING', 'PROCESSING')
    AND o.payment_status IN ('SUCCESS', 'INITIATED')
GROUP BY dz.id
ORDER BY pending_orders DESC;

-- 4. Find the ACTIVE Dehradun zone
SELECT id, label, is_active FROM delivery_zones WHERE label ILIKE '%dehradun%';

-- 5. FIX: Reassign orders to active zone (uncomment to run)
-- UPDATE orders 
-- SET zone_id = '<PASTE_ACTIVE_ZONE_ID_HERE>'
-- WHERE customer_id = 'e2c753a1-52b1-49d7-932c-ecb77638cd19';
