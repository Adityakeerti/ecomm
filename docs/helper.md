# Developer Guide & Setup Instructions 🛠️

Welcome to the development team! This guide acts as your master checklist to help you spin up the whole project stack locally from scratch in just a couple of minutes.

## 1. Prerequisites

Before you do anything, ensure you have the following installed on your machine:
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)**: Mandatory for running our database and cache isolated from your machine. Ensure the Docker desktop app is actually running in the background.
- **[Node.js (LTS)](https://nodejs.org/)**: To run the backend Express server.
- **Git**: For pulling/pushing code.
- **A Database Viewer**: E.g., [DBeaver](https://dbeaver.io/) (or simply use the VS Code database extension) to easily browse and view our PostgreSQL tables.

---

## 2. Booting the Database 🐳

We use Docker to avoid messy local PostgreSQL installations. Our setup will automatically read the `.sql` files in the directory and initialize all tables.

1. Open your terminal at the root of the project.
2. Run the following command:
   ```bash
   docker compose up -d
   ```
3. Docker will pull PostgreSQL and Valkey. The first time it runs, it executes `db/01_schema.sql` and generates all our tables for you in the background.

### 🔍 Connecting to the Database
To view the raw tables safely, use your DB Viewer to connect using these details:
- **Host:** `localhost`
- **Port:** `5433` *(Note: We use 5433 locally to prevent conflicts with standard local Postgres installations!)*
- **Database:** `hyperlocal`
- **Username:** `admin`
- **Password:** `localpass123`

---

## 3. Starting the Backend Server 🟢

The main API runs on Express.js. 

1. Open your terminal and change into the backend folder:
   ```bash
   cd backend
   ```
2. Install all the necessary packages:
   ```bash
   npm install
   ```
3. Set up environment variables. Create a `.env` file exactly inside the `backend/` folder and paste the following baseline config:
   ```env
   PORT=4000
   DATABASE_URL=postgresql://admin:localpass123@localhost:5433/hyperlocal
   VALKEY_URL=redis://localhost:6379
   JWT_SECRET=change_this_to_a_random_string_in_production
   NODE_ENV=development
   ```
4. Start the development server (which uses `nodemon`, so it auto-restarts on code changes):
   ```bash
   npm run dev
   ```
5. Verify it's working! Open your browser and go to `http://localhost:4000/health`. You should see `{"status":"ok"}`.

---

## 4. Useful Commands Cheatsheet 📄

### Docker / Database Commands (Run in project root)
| Command | Action |
| --- | --- |
| `docker compose up -d` | Start the DB/Cache containers in the background |
| `docker compose down` | Stop the containers safely |
| `docker compose down -v` | **HARD RESET:** Stops and deletes the database volume entirely. Extremely useful if you tweaked schema logic and want a completely fresh start! |
| `docker compose ps` | Check if your containers are physically running |
| `docker compose logs postgres` | View database logs, specifically if you encounter startup schema errors |

### Node Commands (Run in `/backend`)
| Command | Action |
| --- | --- |
| `npm install` | Install new packages whenever package.json updates |
| `npm run dev` | Start the Express server for local development |
| `npm start` | Start the Express server for production |

Enjoy, and happy coding! 🚀

---

## 5. 🧹 Testing Artifacts — REMOVE BEFORE PRODUCTION

> **⚠️ CAUTION: Remove ALL items listed below before deploying to production.**
> Update this section after every testing session.

### Files to Delete

| File | Purpose | Added In |
|------|---------|----------|
| `test.html` | Browser-based one-click API test suite (Steps 2–9) | Steps 8-9 |
| `p2d1_test.html` | Phase 2 Dev1 test suite (Products & Storefront) | P2 Dev1 |
| `p2d2_test.html` | Phase 2 Dev2 test suite (Steps 2–9 repack) | P2 Dev2 |
| `db/04_test_dispatch_data.sql` | Manual test data seeding for dispatch engine | Step 7 |

### Code to Remove from `backend/src/app.js`

| Lines (approx) | Code | Risk Level |
|-----------------|------|------------|
| ~20–22 | `app.get('/test', ...)` | Low — serves test page |
| ~24–32 | `app.post('/test/sql', ...)` | **🔴 CRITICAL** — executes arbitrary SQL via HTTP |
| ~47–50 | `app.get('/p2d1', ...)` and `app.get('/p2d2', ...)` | Low — serves P2 test pages |
| In payments.js | `router.post('/test-signature', ...)` | **🔴 CRITICAL** — generates valid PhonePe signatures |

```diff
  // REMOVE THIS BLOCK ↓↓↓
- // Serve test.html at /test
- app.get('/test', (req, res) => {
-   res.sendFile(path.join(__dirname, '..', '..', 'test.html'));
- });
-
- // Dev-only: execute SQL from test.html
- app.post('/test/sql', async (req, res) => {
-   const pool = require('./utils/db');
-   try {
-     const result = await pool.query(req.body.sql, req.body.params || []);
-     res.json({ success: true, data: result.rows, rowCount: result.rowCount });
-   } catch (err) {
-     res.status(400).json({ success: false, error: err.message });
-   }
- });
  // REMOVE THIS BLOCK ↑↑↑
```

### Test Data Cleanup SQL

Run in DBeaver/psql before production:

```sql
-- 1. Remove test returns
DELETE FROM returns WHERE reason LIKE '%auto test%';

-- 2. Remove test batch_stops + dispatch_batches
DELETE FROM batch_stops WHERE batch_id IN (
  SELECT id FROM dispatch_batches WHERE zone_id IN (
    SELECT id FROM delivery_zones WHERE label LIKE 'Auto Zone%'
  )
);
DELETE FROM dispatch_batches WHERE zone_id IN (
  SELECT id FROM delivery_zones WHERE label LIKE 'Auto Zone%'
);

-- 3. Remove test orders
DELETE FROM orders WHERE customer_display_id LIKE 'Auto-%';

-- 4. Remove test addresses
DELETE FROM delivery_addresses WHERE address_line IN (
  'Belanganj, NH2, Agra','Shahganj, MG Road, Agra',
  'Fatehabad Road, Agra','Sadar Bazaar, Agra Cantt','Mehtab Bagh, Agra'
);

-- 5. Remove test customers
DELETE FROM customers WHERE full_name LIKE 'Auto%' OR email LIKE '%@t.com';

-- 6. Remove test staff, zones, products
DELETE FROM delivery_staff WHERE full_name LIKE 'AutoStaff%';
DELETE FROM delivery_zones WHERE label LIKE 'Auto Zone%' OR label LIKE 'AutoZone%';
DELETE FROM products WHERE name LIKE 'Test Product%' OR slug LIKE 'test-prod-%' OR name LIKE 'AutoProd%';
```

### Valkey Keys to Flush

```bash
redis-cli KEYS "session:*"         | xargs redis-cli DEL
redis-cli KEYS "emp:*:active_batch"| xargs redis-cli DEL
redis-cli KEYS "refresh:*"        | xargs redis-cli DEL
```

### ✅ Post-Cleanup Verification Checklist

- [ ] `app.js` has NO `/test` or `/test/sql` routes
- [ ] `test.html` deleted from project root
- [ ] `04_test_dispatch_data.sql` deleted from `db/`
- [ ] No test data remains (`SELECT COUNT(*) FROM customers WHERE full_name LIKE 'Auto%';` → 0)
- [ ] Valkey has no stale test session keys

---

## 6. 🛒 Running the Storefront (Next.js Frontend)

### Prerequisites
- Backend must be running on `http://localhost:4000` (see §3 above).
- Docker containers (PostgreSQL + Valkey) must be up (`docker compose up -d`).

### Start the frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000` in your browser.

### Storefront Pages

| URL | Purpose |
|-----|---------|
| `/` | Homepage — hero, categories, product grid |
| `/shop` | All products with category filter chips |
| `/p/[slug]` | Product detail + variant selector + add to cart |
| `/cart` | Cart with qty stepper and remove |
| `/checkout` | Checkout form → order creation |
| `/order/[orderNumber]` | Order confirmation + WhatsApp button |
| `/track` | Phone → orders list → full order detail |
| `/returns` | Return request form |

---

## 7. 🔴 PhonePe Integration Checklist

> **Context:** The storefront is currently running in **dev mode**. After a successful `POST /payments/initiate`, instead of redirecting to the real PhonePe payment URL, the app goes directly to `/order/[orderNumber]` to simulate a successful payment. This is intentional — PhonePe credentials are not configured yet.

When you have your PhonePe merchant credentials, make the following changes:

### Backend Changes

| File | What to change |
|------|---------------|
| `backend/.env` | Add `PHONEPE_MERCHANT_ID`, `PHONEPE_MERCHANT_KEY`, `PHONEPE_REDIRECT_URL`, `PHONEPE_KEY_INDEX` |
| `backend/src/controllers/checkoutController.js` | Line ~196: Replace the mock `payment_url` string with a real PhonePe API call using their SDK. See [PhonePe PG Docs](https://developer.phonepe.com/). |
| `backend/src/controllers/webhookController.js` | Verify webhook signature using `PHONEPE_MERCHANT_KEY`. Already structured for this — just wire in the real signature check. |

### Frontend Changes

| File | Line (approx) | What to change |
|------|--------------|----------------|
| `frontend/app/checkout/page.js` | ~117 | **Remove** `router.push(...)` and **replace with** `window.location.href = data.payment_url;` |
| `frontend/app/checkout/page.js` | ~122 | Remove the dev-mode disclaimer paragraph below the Pay button |

```diff
// frontend/app/checkout/page.js  (~line 117)

- // DEV MODE: skip PhonePe redirect
- router.push(`/order/${data.order_number}`);

+ // PRODUCTION: redirect to real PhonePe payment page
+ if (typeof sessionStorage !== 'undefined') {
+   sessionStorage.setItem('pending_order', data.order_number);
+ }
+ window.location.href = data.payment_url;
```

### PhonePe Redirect URL
PhonePe needs a return URL after payment. Configure your PhonePe dashboard callback to:
```
https://yourdomain.com/order/{orderNumber}
```
Or for local testing (use ngrok):
```
https://<your-ngrok-id>.ngrok.io/order/{orderNumber}
```

### After Wiring PhonePe
- [ ] Real payment succeeds → webhook fires → `payment_status` → `PAID` → `status` → `PROCESSING`
- [ ] Webhook endpoint verified: `POST /payments/webhook` handles PhonePe callback signature
- [ ] Remove dev-mode comment from `checkout/page.js`
- [ ] Remove `router` import from `checkout/page.js` (no longer needed if using `window.location.href`)
- [ ] Remove `/test-signature` route from `backend/src/routes/payments.js` (marked **🔴 CRITICAL** in §5)
