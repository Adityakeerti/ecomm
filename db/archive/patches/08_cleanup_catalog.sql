-- =============================================================================
-- 08_cleanup_catalog.sql
-- Hard cleanup for stale catalog rows in dev/test.
-- Deletes inactive categories and all linked products/variants/inventory rows
-- when they are not referenced by order_items.
-- =============================================================================

BEGIN;

-- Delete inventory rows for variants under inactive categories that are not referenced in order_items
DELETE FROM inventory i
WHERE i.variant_id IN (
  SELECT pv.id
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN order_items oi ON oi.variant_id = pv.id
  WHERE c.is_active = FALSE
    AND oi.id IS NULL
);

-- Delete variants under inactive categories that are not referenced in order_items
DELETE FROM product_variants pv
WHERE pv.id IN (
  SELECT pv2.id
  FROM product_variants pv2
  JOIN products p ON p.id = pv2.product_id
  JOIN categories c ON c.id = p.category_id
  LEFT JOIN order_items oi ON oi.variant_id = pv2.id
  WHERE c.is_active = FALSE
    AND oi.id IS NULL
);

-- Delete products under inactive categories with no remaining variants
DELETE FROM products p
USING categories c
WHERE p.category_id = c.id
  AND c.is_active = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id
  );

-- Finally remove inactive categories with no remaining products
DELETE FROM categories c
WHERE c.is_active = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM products p WHERE p.category_id = c.id
  );

COMMIT;
