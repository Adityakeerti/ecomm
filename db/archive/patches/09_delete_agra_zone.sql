-- =============================================================================
-- Delete Agra Central Zone
-- =============================================================================
-- This script safely removes the Agra zone from the system

-- First, check if the zone has any orders/batches/staff
SELECT 
    'Orders' AS type, 
    COUNT(*) AS count 
FROM orders 
WHERE zone_id = (SELECT id FROM delivery_zones WHERE label = 'Agra Central Zone')
UNION ALL
SELECT 
    'Batches' AS type, 
    COUNT(*) AS count 
FROM dispatch_batches 
WHERE zone_id = (SELECT id FROM delivery_zones WHERE label = 'Agra Central Zone')
UNION ALL
SELECT 
    'Staff' AS type, 
    COUNT(*) AS count 
FROM delivery_staff 
WHERE zone_id = (SELECT id FROM delivery_zones WHERE label = 'Agra Central Zone');

-- If all counts are 0, you can safely hard delete:
DELETE FROM delivery_zones WHERE label = 'Agra Central Zone';

-- If any count > 0, the zone is referenced and will be deactivated instead:
-- UPDATE delivery_zones SET is_active = FALSE WHERE label = 'Agra Central Zone';

-- Verify deletion
SELECT * FROM delivery_zones ORDER BY created_at DESC;
