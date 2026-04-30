-- =============================================================================
-- TEST DATA for Dispatch Engine (Step 7)
-- Run this ENTIRE script in DBeaver as one execution.
-- It is fully self-contained — no manual UUID replacement needed.
-- =============================================================================

-- Step 1: Create a delivery zone for Agra (city_id = 1 from seed data)
--         cutoff_time set to 00:01:00 so it's always "past cutoff"
INSERT INTO delivery_zones (id, city_id, label, center_lat, center_lng, radius_km, min_order_count, cutoff_time)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  1,
  'Agra Central Zone',
  27.1767,
  78.0081,
  15.00,
  5,
  '00:01:00'
)
ON CONFLICT (id) DO UPDATE SET cutoff_time = '00:01:00', min_order_count = 5;

-- Step 2: Create a delivery staff member assigned to this zone
INSERT INTO delivery_staff (id, emp_id, full_name, phone_number, zone_id)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'EMP001',
  'Test Delivery Guy',
  '+919876543210',
  'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT (emp_id) DO NOTHING;

-- Step 3: Create 5 test customers
INSERT INTO customers (id, phone_number, full_name, email) VALUES
  ('c0000000-0000-0000-0000-000000000001', '+911111100001', 'Alice Test',   'alice@test.com'),
  ('c0000000-0000-0000-0000-000000000002', '+911111100002', 'Bob Test',     'bob@test.com'),
  ('c0000000-0000-0000-0000-000000000003', '+911111100003', 'Charlie Test', 'charlie@test.com'),
  ('c0000000-0000-0000-0000-000000000004', '+911111100004', 'Diana Test',   'diana@test.com'),
  ('c0000000-0000-0000-0000-000000000005', '+911111100005', 'Eve Test',     'eve@test.com')
ON CONFLICT (phone_number) DO NOTHING;

-- Step 4: Create 5 delivery addresses with REAL spread-out Agra coordinates
INSERT INTO delivery_addresses (id, customer_id, address_line, city_id, pincode, lat, lng) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Taj Mahal Area, Tajganj, Agra',        1, '282001', 27.1751, 78.0421),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'Agra Fort, Rakabganj, Agra',           1, '282003', 27.1795, 78.0211),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'Akbar Tomb, Sikandra, Agra',           1, '282007', 27.2186, 78.0040),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000004', 'Kamla Nagar Market, Agra',             1, '282005', 27.1969, 78.0188),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', 'Dayal Bagh Mandir Road, Agra',         1, '282005', 27.2406, 78.0020)
ON CONFLICT (id) DO NOTHING;

-- Step 5: Create 5 PENDING orders with payment_status = SUCCESS
--         All in the same zone, each linked to a different customer + address
INSERT INTO orders (customer_id, address_id, zone_id, customer_display_id, status, total_paise, payment_status, payment_gateway) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Alice-0001-ORD',   'PENDING', 129900, 'SUCCESS', 'PHONEPE'),
  ('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bob-0002-ORD',     'PENDING', 89900,  'SUCCESS', 'PHONEPE'),
  ('c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Charlie-0003-ORD', 'PENDING', 199900, 'SUCCESS', 'PHONEPE'),
  ('c0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Diana-0004-ORD',   'PENDING', 149900, 'SUCCESS', 'PHONEPE'),
  ('c0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'Eve-0005-ORD',     'PENDING', 79900,  'SUCCESS', 'PHONEPE');

-- =============================================================================
-- VERIFY: Run these after the inserts to confirm everything is set up
-- =============================================================================

-- Check zone
SELECT id, label, min_order_count, cutoff_time FROM delivery_zones
WHERE id = 'a0000000-0000-0000-0000-000000000001';

-- Check delivery staff (COPY this id for test.html Employee ID field)
SELECT id, emp_id, full_name, zone_id FROM delivery_staff
WHERE id = 'b0000000-0000-0000-0000-000000000001';

-- Check pending orders (should be 5)
SELECT o.id, o.order_number, o.status, o.payment_status, da.lat, da.lng, da.address_line
FROM orders o
JOIN delivery_addresses da ON da.id = o.address_id
WHERE o.zone_id = 'a0000000-0000-0000-0000-000000000001'
  AND o.status = 'PENDING'
ORDER BY o.created_at;

-- =============================================================================
-- QUICK REFERENCE for test.html
-- =============================================================================
-- Zone ID:     a0000000-0000-0000-0000-000000000001
-- Employee ID: b0000000-0000-0000-0000-000000000001  ← paste into "Employee ID" field
-- =============================================================================
