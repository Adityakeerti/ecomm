-- =============================================================================
-- 07_category_product_consistency.sql
-- Keep category/product visibility consistent after category deactivation.
-- =============================================================================

-- 1) Backfill existing inconsistencies:
-- If a category is inactive, its products and variants must be inactive too.
UPDATE products p
SET is_active = FALSE
FROM categories c
WHERE p.category_id = c.id
  AND c.is_active = FALSE
  AND p.is_active = TRUE;

UPDATE product_variants pv
SET is_active = FALSE
FROM products p
JOIN categories c ON c.id = p.category_id
WHERE pv.product_id = p.id
  AND c.is_active = FALSE
  AND pv.is_active = TRUE;

-- 2) Ensure storefront listing view does not expose products under inactive categories.
CREATE OR REPLACE VIEW v_product_listing AS
SELECT
    p.id,
    p.name,
    p.slug,
    p.description,
    p.base_price_paise,
    p.instagram_post_url,
    cat.name             AS category,
    JSON_AGG(
        JSON_BUILD_OBJECT(
            'variant_id',   pv.id,
            'size',         pv.size,
            'colour',       pv.colour,
            'sku',          pv.sku,
            'price_paise',  pv.price_paise,
            'in_stock',     (inv.quantity - inv.reserved) > 0,
            'available_qty', GREATEST(inv.quantity - inv.reserved, 0)
        ) ORDER BY pv.size, pv.colour
    ) AS variants
FROM products p
JOIN categories cat          ON cat.id = p.category_id AND cat.is_active = TRUE
JOIN product_variants pv     ON pv.product_id = p.id AND pv.is_active = TRUE
JOIN inventory inv           ON inv.variant_id = pv.id
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.slug, p.description, p.base_price_paise,
         p.instagram_post_url, cat.name;
