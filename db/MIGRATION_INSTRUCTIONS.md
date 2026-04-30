# Database Migration Instructions

## Apply these migrations to add location pinpointing and landmark support

### Step 1: Add landmark column to delivery_addresses table

Run this SQL in your PostgreSQL database:

```sql
-- Add landmark column to delivery_addresses table
ALTER TABLE delivery_addresses ADD COLUMN IF NOT EXISTS landmark VARCHAR(255);

COMMENT ON COLUMN delivery_addresses.landmark IS 'Nearby landmark for easy navigation by delivery staff';
```

### Step 2: Update the v_batch_stops_detail view

```sql
-- Drop and recreate the view to include landmark
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
```

### How to apply:

**Option 1: Using psql command line**
```bash
psql -U postgres -d curator_ecom -f db/11_add_landmark_to_delivery_addresses.sql
```

**Option 2: Using pgAdmin or any PostgreSQL client**
1. Connect to your `curator_ecom` database
2. Open a new query window
3. Copy and paste the SQL from `db/11_add_landmark_to_delivery_addresses.sql`
4. Execute the query

**Option 3: Using Docker (if running PostgreSQL in Docker)**
```bash
docker exec -i <postgres_container_name> psql -U postgres -d curator_ecom < db/11_add_landmark_to_delivery_addresses.sql
```

### Verify the migration:

```sql
-- Check if landmark column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'delivery_addresses' AND column_name = 'landmark';

-- Check if view includes landmark
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'v_batch_stops_detail' AND column_name = 'landmark';
```

## What changed:

1. **Database Schema:**
   - Added `landmark` column to `delivery_addresses` table
   - Updated `v_batch_stops_detail` view to include landmark

2. **Saved Addresses (customers.saved_addresses JSONB):**
   - Now includes `landmark` field in the JSONB structure
   - Example structure:
   ```json
   {
     "label": "Home",
     "full_name": "John Doe",
     "phone": "+919876543210",
     "email": "john@example.com",
     "address_line": "Flat 4B, Sunrise Apartments, 12 MG Road",
     "landmark": "Near City Mall",
     "pincode": "282001",
     "lat": 27.1767,
     "lng": 78.0081
   }
   ```

3. **Frontend Changes:**
   - Checkout page: One-click location pinpointing, landmark field, button-style labels (Home/Work/Custom)
   - Account page: Same improvements for saved addresses with geolocation support
   - Delivery portal: Google Maps navigation links with coordinate-based or address-based fallback

4. **Backend Changes:**
   - `userAuthController.js`: Handles landmark in saved addresses
   - `checkoutController.js`: Saves landmark to delivery_addresses table and saved addresses
   - `deliveryBatchController.js`: Returns landmark in batch stops API

## Testing:

1. Create a new order with landmark
2. Check delivery portal to see landmark displayed
3. Click "Navigate" button to test Google Maps integration
4. Save an address with landmark in account page
5. Use saved address in checkout to verify landmark is preserved
