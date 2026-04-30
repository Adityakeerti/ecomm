-- =============================================================================
-- HYPERLOCAL INSTAGRAM-FIRST E-COMMERCE PLATFORM
-- PostgreSQL 16 Database Schema — v1.0
-- =============================================================================
-- Design principles:
--   • BCNF throughout — no transitive dependencies
--   • customers support both phone-first checkout and optional account auth
--   • JSONB used only for truly schemaless/flexible data
--   • Enums for all finite state machines
--   • Indexes designed for the actual query patterns of this platform
--   • Soft deletes on products/variants (is_active flag, never hard delete)
--   • All monetary values stored in PAISE (integer) — never floats for money
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "postgis";       -- GPS / zone geometry (optional but recommended)
-- If PostGIS is unavailable, the schema falls back to lat/lng + Haversine in app layer

-- ---------------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------------

CREATE TYPE order_status AS ENUM (
    'PENDING',           -- payment confirmed, not yet dispatched
    'DISPATCHED',        -- assigned to a batch, batch sent out
    'OUT_FOR_DELIVERY',  -- delivery person is on the way
    'DELIVERED',         -- marked delivered by EMP
    'FAILED',            -- delivery attempt failed
    'CANCELLED',         -- cancelled by customer before dispatch
    'REFUNDED'           -- refund processed
);

CREATE TYPE return_status AS ENUM (
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'REFUNDED'
);

CREATE TYPE batch_status AS ENUM (
    'OPEN',              -- accumulating orders, conditions not yet met
    'READY',             -- both conditions met, waiting for admin dispatch
    'DISPATCHED',        -- admin triggered dispatch, EMP has it
    'COMPLETED',         -- all stops resolved (delivered or failed)
    'CANCELLED'
);

CREATE TYPE stop_status AS ENUM (
    'PENDING',           -- not yet reached
    'DELIVERED',
    'FAILED'
);

CREATE TYPE receipt_channel AS ENUM (
    'EMAIL',
    'WHATSAPP_WA_ME'
);

CREATE TYPE payment_status AS ENUM (
    'INITIATED',
    'SUCCESS',
    'FAILED',
    'REFUNDED'
);

-- ---------------------------------------------------------------------------
-- 1. CITIES
-- Extracted to satisfy BCNF — city name does not depend on zone
-- ---------------------------------------------------------------------------
CREATE TABLE cities (
    id          SMALLSERIAL     PRIMARY KEY,
    name        VARCHAR(100)    NOT NULL UNIQUE,
    state       VARCHAR(100)    NOT NULL,
    country     CHAR(2)         NOT NULL DEFAULT 'IN',
    is_active   BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cities IS 'Master list of cities the platform operates in';

-- ---------------------------------------------------------------------------
-- 2. DELIVERY ZONES
-- One city can have multiple zones (e.g. North Delhi, South Delhi)
-- ---------------------------------------------------------------------------
CREATE TABLE delivery_zones (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id             SMALLINT        NOT NULL REFERENCES cities(id),
    label               VARCHAR(100)    NOT NULL,          -- "City A - Zone 1"
    center_lat          NUMERIC(10, 7)  NOT NULL,
    center_lng          NUMERIC(10, 7)  NOT NULL,
    radius_km           NUMERIC(5, 2)   NOT NULL,          -- delivery radius
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    -- Dispatch thresholds (both must be met to trigger READY)
    min_order_count     SMALLINT        NOT NULL DEFAULT 5,
    cutoff_time         TIME            NOT NULL DEFAULT '08:00:00', -- daily time window cutoff
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT zone_radius_positive CHECK (radius_km > 0),
    CONSTRAINT zone_min_orders_positive CHECK (min_order_count > 0)
);

COMMENT ON COLUMN delivery_zones.cutoff_time IS 'All orders before this time daily are grouped into one batch';
COMMENT ON COLUMN delivery_zones.min_order_count IS 'Minimum PENDING orders needed before batch is flagged READY';

CREATE INDEX idx_zones_city    ON delivery_zones(city_id);
CREATE INDEX idx_zones_active  ON delivery_zones(is_active) WHERE is_active = TRUE;

-- ---------------------------------------------------------------------------
-- 3. CATEGORIES
-- Simple flat category list for products
-- ---------------------------------------------------------------------------
CREATE TABLE categories (
    id          SMALLSERIAL     PRIMARY KEY,
    name        VARCHAR(100)    NOT NULL UNIQUE,    -- "Hoodies", "T-Shirts"
    slug        VARCHAR(100)    NOT NULL UNIQUE,
    is_active   BOOLEAN         NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------------
-- 4. PRODUCTS
-- One product = one SKU family (e.g. "Oversized Hoodie")
-- ---------------------------------------------------------------------------
CREATE TABLE products (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id     SMALLINT        NOT NULL REFERENCES categories(id),
    name            VARCHAR(200)    NOT NULL,
    slug            VARCHAR(200)    NOT NULL UNIQUE,   -- used in Instagram link URL
    description     TEXT,
    base_price_paise BIGINT         NOT NULL,          -- price in paise (₹899 = 89900)
    image_url       VARCHAR(500),
    instagram_post_url VARCHAR(500),                   -- reference link
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    meta            JSONB,                             -- flexible: tags, material, care instructions etc.
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT product_price_positive CHECK (base_price_paise > 0)
);

COMMENT ON COLUMN products.base_price_paise IS 'All monetary values in paise. ₹899 = 89900 paise. Never use floats for money.';
COMMENT ON COLUMN products.meta IS 'JSONB for schemaless attributes: tags, fabric, wash-care, etc.';
COMMENT ON COLUMN products.slug IS 'Used in the Instagram link: yourstore.com/p/{slug}';

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active   ON products(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_products_meta     ON products USING GIN(meta);

-- ---------------------------------------------------------------------------
-- 5. PRODUCT VARIANTS
-- Each variant = one purchasable unit (size + colour combination)
-- ---------------------------------------------------------------------------
CREATE TABLE product_variants (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      UUID            NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    size            VARCHAR(20),                        -- S, M, L, XL, XXL, Free Size
    colour          VARCHAR(50),
    sku             VARCHAR(100)    NOT NULL UNIQUE,    -- internal stock-keeping code
    price_paise     BIGINT          NOT NULL,           -- can differ from base_price (e.g. XL costs more)
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT variant_price_positive CHECK (price_paise > 0),
    UNIQUE (product_id, size, colour)                   -- no duplicate size+colour per product
);

CREATE INDEX idx_variants_product ON product_variants(product_id);
CREATE INDEX idx_variants_active  ON product_variants(product_id, is_active);

-- ---------------------------------------------------------------------------
-- 6. INVENTORY
-- Separated from variants — single source of truth for stock
-- Allows future warehouse/location-based stock if needed
-- ---------------------------------------------------------------------------
CREATE TABLE inventory (
    variant_id      UUID            PRIMARY KEY REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity        INT             NOT NULL DEFAULT 0,
    reserved        INT             NOT NULL DEFAULT 0, -- held in active cart sessions
    last_restocked  TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT inventory_quantity_non_negative CHECK (quantity >= 0),
    CONSTRAINT inventory_reserved_non_negative CHECK (reserved >= 0),
    CONSTRAINT inventory_reserved_lte_quantity CHECK (reserved <= quantity)
);

COMMENT ON COLUMN inventory.reserved IS 'Units held by active cart sessions (within 15-min window). available = quantity - reserved';
COMMENT ON COLUMN inventory.quantity IS 'Total physical stock on hand';

-- ---------------------------------------------------------------------------
-- 7. CART SESSIONS
-- Temporary holds — 15-minute expiry on payment failure/abandonment
-- Valkey (Redis) is the primary store; this table is a fallback/audit log
-- ---------------------------------------------------------------------------
CREATE TABLE cart_sessions (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token   VARCHAR(255)    NOT NULL UNIQUE,    -- stored in browser sessionStorage
    phone_number    VARCHAR(15),                        -- may be null if not yet entered
    items           JSONB           NOT NULL,           -- [{variant_id, qty, price_paise}]
    expires_at      TIMESTAMPTZ     NOT NULL,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cart_sessions IS 'Short-lived cart. Primary store is Valkey. This is fallback + audit.';
COMMENT ON COLUMN cart_sessions.items IS 'Snapshot of cart: [{variant_id: uuid, qty: int, price_paise: int}]';

CREATE INDEX idx_cart_token   ON cart_sessions(session_token);
CREATE INDEX idx_cart_expiry  ON cart_sessions(expires_at);  -- for cleanup job

-- ---------------------------------------------------------------------------
-- 8. CUSTOMERS
-- Supports guest checkout (phone) and optional email/password login.
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number    VARCHAR(15)     UNIQUE,             -- E.164 format: +919876543210 (nullable for email-only accounts)
    full_name       VARCHAR(200)    NOT NULL,           -- from last order (updated on each order)
    email           VARCHAR(255),
    password_hash   TEXT,                               -- bcrypt hash for account login
    saved_addresses JSONB           NOT NULL DEFAULT '[]'::jsonb,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE customers IS 'Unified customer table for checkout identities and optional storefront account auth.';
COMMENT ON COLUMN customers.full_name IS 'Taken from most recent order — always kept current';
COMMENT ON COLUMN customers.password_hash IS 'bcrypt hash; NULL for guest/phone-only customer records';
COMMENT ON COLUMN customers.saved_addresses IS 'Array of saved delivery addresses for storefront checkout autofill. Max 20 entries.';

CREATE INDEX idx_customers_phone ON customers(phone_number);
CREATE INDEX idx_customers_email ON customers(email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX uq_customers_email_ci ON customers(LOWER(email)) WHERE email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 9. DELIVERY ADDRESSES
-- Extracted from orders — BCNF compliance
-- Same customer may order to multiple addresses
-- ---------------------------------------------------------------------------
CREATE TABLE delivery_addresses (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID            NOT NULL REFERENCES customers(id),
    address_line    TEXT            NOT NULL,
    landmark        VARCHAR(255),
    city_id         SMALLINT        REFERENCES cities(id),
    pincode         VARCHAR(10),
    lat             NUMERIC(10, 7),                     -- from browser GPS at checkout
    lng             NUMERIC(10, 7),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_addresses_customer ON delivery_addresses(customer_id);
COMMENT ON COLUMN delivery_addresses.landmark IS 'Nearby landmark for easy navigation by delivery staff';

-- ---------------------------------------------------------------------------
-- 10. ORDERS
-- Core table. Everything links here.
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number        VARCHAR(20)     NOT NULL UNIQUE, -- ORD00142 — human-readable
    customer_id         UUID            NOT NULL REFERENCES customers(id),
    address_id          UUID            NOT NULL REFERENCES delivery_addresses(id),
    zone_id             UUID            NOT NULL REFERENCES delivery_zones(id),

    -- Customer ID shown on receipts: FirstName-Last4Phone-OrderNumber
    customer_display_id VARCHAR(100)    NOT NULL,        -- e.g. Aditya-7823-ORD00142

    status              order_status    NOT NULL DEFAULT 'PENDING',
    total_paise         BIGINT          NOT NULL,
    notes               TEXT,                            -- customer notes at checkout

    -- Payment
    payment_status      payment_status  NOT NULL DEFAULT 'INITIATED',
    payment_ref         VARCHAR(255),                    -- PhonePe transaction ID
    payment_gateway     VARCHAR(50)     NOT NULL DEFAULT 'PHONEPE',
    paid_at             TIMESTAMPTZ,

    -- Batch assignment (set when dispatched)
    batch_id            UUID,

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT order_total_positive CHECK (total_paise > 0)
);

COMMENT ON COLUMN orders.order_number IS 'Human-readable sequential: ORD00001, ORD00002...';
COMMENT ON COLUMN orders.customer_display_id IS 'Shown on receipts. Format: FirstName-Last4Phone-OrderNumber';
COMMENT ON COLUMN orders.total_paise IS 'Sum of all order_items.subtotal_paise at time of order';

CREATE INDEX idx_orders_customer    ON orders(customer_id);
CREATE INDEX idx_orders_zone        ON orders(zone_id);
CREATE INDEX idx_orders_status      ON orders(status);
CREATE INDEX idx_orders_batch       ON orders(batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_orders_created     ON orders(created_at DESC);
CREATE INDEX idx_orders_payment_ref ON orders(payment_ref) WHERE payment_ref IS NOT NULL;
-- Composite: admin dashboard filter (zone + status + date)
CREATE INDEX idx_orders_zone_status ON orders(zone_id, status, created_at DESC);

-- Order number sequence function
CREATE SEQUENCE order_number_seq START 1;
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'ORD' || LPAD(nextval('order_number_seq')::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 11. ORDER ITEMS
-- Line items for each order
-- ---------------------------------------------------------------------------
CREATE TABLE order_items (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID            NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    variant_id      UUID            NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    quantity        SMALLINT        NOT NULL DEFAULT 1,
    unit_price_paise BIGINT         NOT NULL,            -- price at time of purchase (snapshot)
    subtotal_paise  BIGINT          GENERATED ALWAYS AS (quantity * unit_price_paise) STORED,

    CONSTRAINT order_item_qty_positive CHECK (quantity > 0),
    CONSTRAINT order_item_price_positive CHECK (unit_price_paise > 0)
);

COMMENT ON COLUMN order_items.unit_price_paise IS 'Snapshot of price at purchase time — variant price may change later';
COMMENT ON COLUMN order_items.subtotal_paise IS 'Computed column: quantity × unit_price_paise';

CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_order_items_variant ON order_items(variant_id);

-- ---------------------------------------------------------------------------
-- 12. DELIVERY STAFF (EMP)
-- ---------------------------------------------------------------------------
CREATE TABLE delivery_staff (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    emp_id          VARCHAR(20)     NOT NULL UNIQUE,     -- issued by admin, portal login token
    full_name       VARCHAR(200)    NOT NULL,
    phone_number    VARCHAR(15)     NOT NULL,
    zone_id         UUID            NOT NULL REFERENCES delivery_zones(id),
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN delivery_staff.emp_id IS 'This IS the login credential for the delivery portal. No password.';

CREATE INDEX idx_staff_zone   ON delivery_staff(zone_id);
CREATE INDEX idx_staff_emp_id ON delivery_staff(emp_id);
CREATE INDEX idx_staff_active ON delivery_staff(is_active, zone_id);

-- ---------------------------------------------------------------------------
-- 13. DISPATCH BATCHES
-- Groups of orders dispatched together to one EMP
-- ---------------------------------------------------------------------------
CREATE TABLE dispatch_batches (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id         UUID            NOT NULL REFERENCES delivery_zones(id),
    emp_id          UUID            REFERENCES delivery_staff(id), -- set when admin assigns
    status          batch_status    NOT NULL DEFAULT 'OPEN',
    batch_date      DATE            NOT NULL DEFAULT CURRENT_DATE,
    -- Route optimisation result
    stop_sequence   JSONB,          -- [{order_id, stop_number, lat, lng, address}] — computed on dispatch
    dispatched_at   TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN dispatch_batches.stop_sequence IS 'Route-optimised stop order computed at dispatch time. Stored as snapshot.';
COMMENT ON COLUMN dispatch_batches.batch_date IS 'Date this batch covers — used for the daily time-window grouping';

CREATE INDEX idx_batches_zone        ON dispatch_batches(zone_id);
CREATE INDEX idx_batches_emp         ON dispatch_batches(emp_id) WHERE emp_id IS NOT NULL;
CREATE INDEX idx_batches_status      ON dispatch_batches(status);
CREATE INDEX idx_batches_zone_date   ON dispatch_batches(zone_id, batch_date, status);

-- Add foreign key constraint to orders now that dispatch_batches exists
ALTER TABLE orders ADD CONSTRAINT fk_orders_batch_id FOREIGN KEY (batch_id) REFERENCES dispatch_batches(id);

-- ---------------------------------------------------------------------------
-- 14. BATCH STOPS
-- Individual delivery stops within a batch — one row per order in the batch
-- ---------------------------------------------------------------------------
CREATE TABLE batch_stops (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID            NOT NULL REFERENCES dispatch_batches(id),
    order_id        UUID            NOT NULL REFERENCES orders(id),
    stop_number     SMALLINT        NOT NULL,            -- optimised sequence position
    status          stop_status     NOT NULL DEFAULT 'PENDING',
    failure_reason  VARCHAR(255),                        -- if status = FAILED
    delivered_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    UNIQUE (batch_id, order_id),
    UNIQUE (batch_id, stop_number)
);

COMMENT ON COLUMN batch_stops.stop_number IS 'Position in route-optimised sequence. Stop 1 unlocks first.';

CREATE INDEX idx_stops_batch  ON batch_stops(batch_id, stop_number);
CREATE INDEX idx_stops_order  ON batch_stops(order_id);
CREATE INDEX idx_stops_status ON batch_stops(batch_id, status);

-- ---------------------------------------------------------------------------
-- 15. RETURNS
-- ---------------------------------------------------------------------------
CREATE TABLE returns (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    return_id       VARCHAR(30)     NOT NULL UNIQUE,     -- RET-ORD00142-X7K (human-readable)
    order_id        UUID            NOT NULL REFERENCES orders(id),
    customer_id     UUID            NOT NULL REFERENCES customers(id),
    reason          TEXT            NOT NULL,
    status          return_status   NOT NULL DEFAULT 'REQUESTED',
    admin_notes     TEXT,
    refund_ref      VARCHAR(255),                        -- PhonePe refund transaction ID
    requested_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ,

    -- One return per order max
    UNIQUE (order_id)
);

COMMENT ON COLUMN returns.return_id IS 'Format: RET-{OrderNumber}-{3RandomChars}. Sent to customer via WhatsApp.';

CREATE INDEX idx_returns_order    ON returns(order_id);
CREATE INDEX idx_returns_customer ON returns(customer_id);
CREATE INDEX idx_returns_status   ON returns(status);

-- ---------------------------------------------------------------------------
-- 16. RECEIPT LOG
-- Audit trail for every receipt/notification sent
-- ---------------------------------------------------------------------------
CREATE TABLE receipt_log (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID            NOT NULL REFERENCES orders(id),
    channel         receipt_channel NOT NULL,
    recipient       VARCHAR(255)    NOT NULL,            -- email address or phone number
    status          VARCHAR(20)     NOT NULL DEFAULT 'SENT',  -- SENT, FAILED, OPENED
    payload         JSONB,                               -- what was sent (for debugging)
    sent_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    error           TEXT                                 -- if failed
);

COMMENT ON TABLE receipt_log IS 'Audit log for all email and WhatsApp wa.me receipt events';

CREATE INDEX idx_receipt_order   ON receipt_log(order_id);
CREATE INDEX idx_receipt_channel ON receipt_log(channel, sent_at DESC);

-- ---------------------------------------------------------------------------
-- 17. PAYMENT EVENTS
-- Webhook log from PhonePe — immutable audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE payment_events (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID            REFERENCES orders(id),   -- null if order not yet created
    gateway_ref     VARCHAR(255)    NOT NULL,
    event_type      VARCHAR(50)     NOT NULL,            -- PAYMENT_SUCCESS, PAYMENT_FAILED, REFUND_SUCCESS
    status          payment_status  NOT NULL,
    amount_paise    BIGINT,
    raw_payload     JSONB           NOT NULL,            -- full webhook body from PhonePe
    received_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payment_events IS 'Immutable log of every PhonePe webhook. Never update, only insert.';

CREATE INDEX idx_payment_events_order   ON payment_events(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_payment_events_ref     ON payment_events(gateway_ref);
CREATE INDEX idx_payment_events_type    ON payment_events(event_type, received_at DESC);

-- ---------------------------------------------------------------------------
-- TRIGGERS
-- ---------------------------------------------------------------------------

-- Auto-update updated_at on relevant tables
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_zones_updated    BEFORE UPDATE ON delivery_zones    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products          FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_orders_updated   BEFORE UPDATE ON orders            FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_batches_updated  BEFORE UPDATE ON dispatch_batches  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_staff_updated    BEFORE UPDATE ON delivery_staff    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_inventory_updated BEFORE UPDATE ON inventory        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_stops_updated    BEFORE UPDATE ON batch_stops       FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Auto-decrement inventory on order item insert
CREATE OR REPLACE FUNCTION decrement_inventory()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE inventory
    SET quantity = quantity - NEW.quantity
    WHERE variant_id = NEW.variant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory record not found for variant %', NEW.variant_id;
    END IF;

    -- Sanity check — should not go negative (app layer checks first, this is a safety net)
    IF (SELECT quantity FROM inventory WHERE variant_id = NEW.variant_id) < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for variant %', NEW.variant_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_decrement_inventory
AFTER INSERT ON order_items
FOR EACH ROW EXECUTE FUNCTION decrement_inventory();

-- Auto-generate order_number on order insert
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number = generate_order_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_order_number
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- ---------------------------------------------------------------------------
-- VIEWS
-- ---------------------------------------------------------------------------

-- Admin dashboard: orders with full context (avoid repeated joins in API)
CREATE VIEW v_order_summary AS
SELECT
    o.id,
    o.order_number,
    o.customer_display_id,
    o.status,
    o.payment_status,
    o.total_paise,
    o.created_at,
    c.full_name          AS customer_name,
    c.phone_number       AS customer_phone,
    c.email              AS customer_email,
    da.address_line      AS delivery_address,
    da.lat,
    da.lng,
    dz.label             AS zone_label,
    ct.name              AS city_name,
    ds.full_name         AS emp_name,
    ds.emp_id,
    db.id                AS batch_id,
    db.status            AS batch_status
FROM orders o
JOIN customers c            ON c.id = o.customer_id
JOIN delivery_addresses da  ON da.id = o.address_id
JOIN delivery_zones dz      ON dz.id = o.zone_id
JOIN cities ct              ON ct.id = dz.city_id
LEFT JOIN dispatch_batches db ON db.id = o.batch_id
LEFT JOIN delivery_staff ds  ON ds.id = db.emp_id;

-- Delivery portal: stops for an active batch with all info EMP needs
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

-- Storefront: product listing with stock status
CREATE VIEW v_product_listing AS
SELECT
    p.id,
    p.name,
    p.slug,
    p.description,
    p.base_price_paise,
    p.image_url,
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
JOIN categories cat          ON cat.id = p.category_id
JOIN product_variants pv     ON pv.product_id = p.id AND pv.is_active = TRUE
JOIN inventory inv           ON inv.variant_id = pv.id
WHERE p.is_active = TRUE
GROUP BY p.id, p.name, p.slug, p.description, p.base_price_paise,
         p.image_url, p.instagram_post_url, cat.name;

-- Admin: dispatch readiness — zones where batch conditions are both met
CREATE VIEW v_dispatch_ready AS
SELECT
    dz.id                AS zone_id,
    dz.label             AS zone_label,
    ct.name              AS city,
    COUNT(o.id)          AS pending_order_count,
    dz.min_order_count,
    dz.cutoff_time,
    MIN(o.created_at)    AS oldest_order_at,
    db.id                AS batch_id
FROM delivery_zones dz
JOIN cities ct              ON ct.id = dz.city_id
JOIN orders o               ON o.zone_id = dz.id AND o.status = 'PENDING'
LEFT JOIN dispatch_batches db ON db.zone_id = dz.id
                             AND db.batch_date = CURRENT_DATE
                             AND db.status IN ('OPEN', 'READY')
WHERE dz.is_active = TRUE
  AND CURRENT_TIME >= dz.cutoff_time
GROUP BY dz.id, dz.label, ct.name, dz.min_order_count, dz.cutoff_time, db.id
HAVING COUNT(o.id) >= dz.min_order_count;

-- ---------------------------------------------------------------------------
-- SEED DATA — Minimal bootstrap
-- ---------------------------------------------------------------------------

INSERT INTO cities (name, state) VALUES
    ('Agra',    'Uttar Pradesh'),
    ('Mathura',  'Uttar Pradesh'),
    ('Aligarh',  'Uttar Pradesh');

INSERT INTO categories (name, slug) VALUES
    ('Hoodies',    'hoodies'),
    ('T-Shirts',   't-shirts'),
    ('Oversized',  'oversized');

-- =============================================================================
-- TABLE SUMMARY
-- =============================================================================
-- 01. cities                — master city list (BCNF extracted)
-- 02. delivery_zones        — geo zone per city, dispatch thresholds
-- 03. categories            — product categories
-- 04. products              — product master, slug = Instagram link
-- 05. product_variants      — size/colour variants per product
-- 06. inventory             — stock per variant (quantity + reserved)
-- 07. cart_sessions         — 15-min payment hold, Valkey-backed
-- 08. customers             — checkout identity + optional account auth
-- 09. delivery_addresses    — extracted address (BCNF), includes GPS coords
-- 10. orders                — core order table
-- 11. order_items           — line items with price snapshot
-- 12. delivery_staff        — EMP records, emp_id = portal login
-- 13. dispatch_batches      — grouped delivery runs per zone per day
-- 14. batch_stops           — individual stops within a batch, sequential unlock
-- 15. returns               — one return per order
-- 16. receipt_log           — audit trail for email + WhatsApp receipts
-- 17. payment_events        — immutable PhonePe webhook log
-- =============================================================================
