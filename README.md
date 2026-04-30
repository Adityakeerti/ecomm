# Curator E-Commerce Platform

Full-stack hyperlocal e-commerce system with:

- **Storefront** (Next.js, `frontend/app/(store)`)
- **Admin portal** (React admin UI inside `frontend/app/(portal)/admin`)
- **Delivery portal** (session-based flow inside `frontend/app/(portal)/delivery`)
- **Backend API** (Express + PostgreSQL + Valkey)

This repository now includes a full user-auth flow for storefront users, role-separated admin/user auth middleware, hardened CORS + rate limiting, and server-side live-price validation at payment initiation.

---

## Tech Stack

- **Frontend:** Next.js (App Router), React
- **Backend:** Node.js, Express
- **Database:** PostgreSQL
- **Cache / Sessions:** Valkey (Redis-compatible)
- **Assets:** Cloudinary / R2 (configurable)
- **Infra:** Docker Compose (local)

---

## Project Structure

- `backend/` - Express API, controllers, routes, middleware
- `frontend/` - Storefront + portal UI (admin + delivery)
- `admin/` - Legacy standalone admin app (Vite)
- `delivery/` - Legacy standalone delivery app (Vite)
- `db/` - SQL schema + migrations + test data
- `helper.md` - Detailed local workflow notes

---

## Security + Auth Status (Current)

### Implemented

- **Storefront user auth routes**
  - `POST /auth/register`
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `POST /auth/logout` (protected user route)
  - `GET /auth/me` (protected user route)
- **Role-aware middleware**
  - `adminAuth` enforces `role === 'admin'`
  - `userAuth` enforces `role === 'user'`
- **Frontend user account page**
  - `frontend/app/(store)/account/page.js`
- **Navbar auth UX fixed**
  - No longer treats cart token as user login state
- **CORS hardened**
  - Uses `ALLOWED_ORIGINS` allowlist
- **Rate limiting added**
  - Login endpoints (`/admin/auth/login`, `/auth/login`)
  - Session/payment abuse control (`/cart/session`, `/payments/initiate`)
- **Checkout billing hardening**
  - Live DB variant prices are fetched at payment initiation
  - Cart snapshot prices are not trusted for final billing
- **Phone normalization centralized**
  - Backend normalizes to `+91XXXXXXXXXX`
- **Dynamic categories**
  - Public `GET /v1/categories` endpoint
  - Storefront home categories now come from DB
- **Order insertion hardening**
  - No temporary `"TEMP"` customer display ID writes
  - `PAYMENT_GATEWAY` env is used instead of hardcoded gateway

### Intentionally Deferred (current repo state)

- `test/dev` endpoints are still present locally and should be removed before production deployment.
- Secret rotation is manual and should be completed before release.

---

## API Highlights

### Public Store APIs

- `GET /v1/products`
- `GET /v1/products/:slug`
- `GET /v1/products/:slug/variants`
- `GET /v1/categories`
- `POST /cart/session`
- `POST /cart/:token/items`
- `POST /payments/initiate`

### Auth APIs

- **Admin:** `/admin/auth/*`
- **User:** `/auth/*`

### Admin APIs

- Mounted under `/admin` and protected by admin JWT.

---

## Environment Variables

Use `backend/.env.example` as base.

Important variables:

- `PORT`
- `DATABASE_URL`
- `VALKEY_URL`
- `JWT_SECRET` (must be strong in production)
- `ALLOWED_ORIGINS` (comma-separated)
- `PAYMENT_GATEWAY` (default: `PHONEPE`)
- Cloud provider vars (`CLOUDINARY_*` or `R2_*`)

> `backend/.env` is ignored and must never be committed with real secrets.

---

## Local Setup

### 1) Install dependencies

- `backend`: `npm install`
- `frontend`: `npm install`

### 2) Start services

- Start PostgreSQL + Valkey (Docker or local)
- Run backend: `npm run dev` inside `backend`
- Run frontend: `npm run dev` inside `frontend`

### 3) Apply DB scripts

- Core schema: `db/01_schema.sql`
- Optional admin seed: `db/02_admin.sql`
- Customer auth migration: `db/06_customers_auth.sql`
- Category-product consistency backfill: `db/07_category_product_consistency.sql`
- Cutoff time update (if upgrading): `db/08_update_cutoff_time.sql`

---

## Key Functional Flows

- **Storefront user auth:** register/login, token persisted in `localStorage`
- **Cart session:** cart token remains separate from user auth token
- **Checkout:** backend validates zone + inventory + phone normalization
- **Payment initiation:** backend recomputes total from live variant prices
- **Admin operations:** protected by admin JWT with role check

---

## Production Checklist

- Remove dev/test endpoints before deploy
- Rotate all exposed secrets (Cloudinary, SMTP, API keys)
- Set a strong `JWT_SECRET`
- Restrict `ALLOWED_ORIGINS` to trusted domains only
- Run DB migrations in order and validate indexes/triggers
- Re-test auth separation (`user` token cannot access admin routes, and vice versa)

---

## Additional Notes

For implementation notes and deep operational details, refer to:

- `helper.md`
- `working.Md`
