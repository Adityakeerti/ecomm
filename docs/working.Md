# Hyperlocal E-Commerce Platform - Project Workflow & Structure

This document outlines the complete flow, file structure, and functionalities of the Hyperlocal Instagram-First E-Commerce Platform. This acts as a comprehensive reference manual for developers to understand how the moving parts (Frontend apps, Backend Node.js API, DB, and Cache) interoperate.

---

## 1. System Architecture & Tech Stack

### Core Technologies
- **Backend:** Node.js with Express.js.
- **Database:** PostgreSQL (with PostGIS for geolocation/delivery zones). Managed locally via Docker.
- **Cache/Session Store:** Valkey (a Redis alternative) used for temporary cart holds and delivery portal sessions.
- **Infrastructure:** Docker & Docker Compose.

### Distinct Portals / Frontends 
*Note: Currently, these are directories awaiting their physical frontends, but the backend is fully scaffolded to support them.*
1. **Frontend (Customer App):** The main store interface built for Instagram-first shoppers.
2. **Admin Dashboard:** Back-office for catalog, orders, support, and dispatch management.
3. **Delivery Portal:** Minimal platform for delivery staff to receive assignments and update order states.

---

## 2. Directory & File Structure

### Root Level
- `docker-compose.yml`: Setup for PostgreSQL and Valkey containers, defining image versions, ports (e.g. Postgres on 5433), and volumes.
- `README.md & helper.md`: Primary developer and setup documentation.
- `p2d1_test.html`, `p2d2_test.html`: Manual UI test suites used to mock api requests and UI flows for developers.

### Database Layer (`/db`)
Automatic setup scripts that Docker runs on initialization.
- `01_schema.sql`: Contains the heavily normalized table designs (Customers, Orders, Delivery Staff/Zones, Products, Dispatch Batches).
- `02_admin.sql`: Generates standard admin users.
- `03_add_image_url.sql`: Schema extensions.
- `04_test_dispatch_data.sql`: Test seed data.

### Backend Application (`/backend/src`)

#### Configuration & Main Entries
- `server.js`: The central entry point configuring the `PORT` and starting the Express listener.
- `app.js`: Connects all routers, middleware, testing endpoints, and root configurations (Cors, Helmet, Morgan logging).

#### Controllers (`/controllers`)
These files handle incoming HTTP payloads and define specific business logic for endpoints.
- **Admin Specific:**
  - `adminAuthController.js`: Handles JWT generation, login, refresh tokens, and logout.
  - `adminDispatchController.js`, `adminOperationsController.js`, `adminOrdersController.js`, `adminProductsController.js`, `adminReturnsController.js`, `adminOverviewController.js`: Complete CRUD and operational logic for respective entities over Admin Portal.
- **Delivery Staff Specific:**
  - `deliveryAuthController.js`: OTP or simple credential validation mapping to Valkey sessions.
  - `deliveryBatchController.js`: Manages assigned dispatches, route states, and order deliveries.
- **Customer Frontend Specific:**
  - `cartController.js`: High-speed item additions managed via Valkey micro-sessions.
  - `checkoutController.js`: Finalizing carts and generating payment links/intents.
  - `orderController.js`, `returnsController.js`, `productController.js`, `zoneController.js`: Browsing the catalog, tracking orders, submitting return requests.
- **Webhooks:**
  - `webhookController.js`: Interprets 3rd-party pings (like payment gateway hooks) and adjusts internal DB records asynchronously.

#### Middleware (`/middleware`)
Security abstractions placed in front of sensitive routes.
- `adminAuth.js`: Evaluates Admin JWT signatures and checks expiration.
- `empAuth.js`: Validates delivery employee sessions backed by Valkey.
- `upload.js`: Intercepts multipart/form-data for image uploads.

#### Routes (`/routes`)
Maps URL paths to Controller functions.
- `adminRoutes.js`, `adminAuthRoutes.js`
- `deliveryRoutes.js`
- **Customer Modules:** `cart.js`, `checkout.js`, `orders.js`, `payments.js`, `products.js`, `returns.js`, `track.js`, `zones.js`.

#### Utilities & Services (`/utils`, `/services`)
- `db.js`: PostgreSQL connection pool setup.
- `valkey.js`: Standardized Valkey (Redis) client wrapper.
- `geo.js`, `routeOptimiser.js`: Geographic calculations and routing logic for the Smart Dispatch system.
- `emailService.js`, `whatsapp.js`: Notification integrations.
- `cloudinary.js`, `r2.js`, `imageStorage.js`: Cloud bucket integrations for product image and return proof uploads.

---

## 3. Core Workflows & Functionality

### A. The "Passkey-Free" Customer Flow
1. **Browsing:** Customer browses `Products` (`GET /v1/products`).
2. **Micro-Session Cart:** Customer adds items to Cart (`POST /cart`). To ensure fast interactions, this cart is held as a temporary session inside Valkey with a 15-minute TTL without forcing an intensive login loop.
3. **Checkout:** Customer submits phone number and delivery location. The Backend evaluates `Zones` to dictate if the location is serviceable. 
4. **Payment & Webhook:** The customer completes payment via a 3rd party. `webhookController.js` listens to payment confirmations, converts the Valkey Cart into a hard `Order` in the PostgreSQL database, and links a generic customer profile via the Phone Number.
5. **Post-Purchase:** Notifications are sent via `whatsapp.js` and `emailService.js`. The customer uses the `track.js` API to observe order status.

### B. Smart Dispatching System
1. **Accumulation:** As `Orders` finalize, they are flagged as "Ready".
2. **Batch Generation:** `adminDispatchController.js` and cron-like triggers pool orders going to the same geographic `Delivery Zone`.
3. **Routing Output:** `routeOptimiser.js` plots an optimal path (`batch_stops`) minimizing delivery distance.
4. **Assignment:** Assigned to a specific `Delivery Staff` member.

### C. The Delivery Portal Flow
1. **Login:** Delivery staff log in (`deliveryAuthController.js`) creating an active Valkey session token.
2. **Current Batch:** They retrieve their active assignment (`deliveryBatchController.js`).
3. **Fulfillment:** Driver visually uses the provided optimal route, arriving at locations and finalizing individual stops, sending updates directly to the Customer and Admin interfaces simultaneously.

### D. The Admin Oversight Flow
1. **Login:** The owner secures an access token and refresh token via `adminAuthController.js`.
2. **Monitoring Dashboard:** Provides aggregate metrics, live revenue, and dispatching progress via `adminOverviewController.js`.
3. **Product Management:** Updating catalogs, variants, and pushing images to remote storage (`adminProductsController.js`, using `cloudinary.js`/`r2.js`).
4. **Customer Service / Operations:** Approving or declining `Returns` and manually adjusting incorrect DB entries if system edge-cases arise (`adminReturnsController.js`, `adminOperationsController.js`).

---

## 4. Key Developer Insights
- **Testing Approach:** Currently uses raw HTML files making native `fetch` requests directly to backend endpoints (`p2d1_test.html`). This validates real HTTP logic without building a dense UI. 
- **DB Safety:** `app.js` presently contains a `/test/sql` development endpoint. This MUST be removed prior to production to prevent arbitrary command injection.
