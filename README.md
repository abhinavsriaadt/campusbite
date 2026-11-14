# CampusBite — Restaurant Ordering & Delivery Platform

CampusBite is a full-stack food ordering and delivery application with three connected experiences:

- **Customers** browse restaurants, search dishes, order with a dummy payment, track delivery, review, request refunds and ask an AI assistant about their order history.
- **Restaurant owners** manage their menu, run the order pipeline, assign riders, resolve refunds, watch live statistics and get reminders about stalled orders.
- **Delivery partners** see only the orders assigned to them, pick them up, mark them delivered and review their history.

The React frontend talks to a FastAPI backend over REST. Data lives in PostgreSQL, accessed through SQLAlchemy. The backend runs in Docker Compose.

---

## Contents

1. [Tech stack](#tech-stack)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Quick start (Docker backend + local frontend)](#quick-start)
5. [Authentication](#authentication)
6. [Environment variables](#environment-variables)
7. [Database setup](#database-setup)
8. [Running the backend without Docker](#running-the-backend-without-docker)
9. [API documentation](#api-documentation)
10. [Testing](#testing)
11. [Security notes](#security-notes)
12. [Project structure](#project-structure)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, JavaScript (ES2022), React Hooks + Context, React Router, Axios, Vite; token-based design system ([DESIGN.md](DESIGN.md)) |
| Backend | Python 3.14, FastAPI, Pydantic v2, SQLAlchemy 2 ORM, Alembic migrations |
| Auth | JWT (PyJWT, HS256), bcrypt password hashing, role-based access control |
| Database | PostgreSQL 16 (SQLite supported for local development and tests) |
| AI | OpenAI API (Chat Completions, default model `gpt-5.4-mini`) |
| DevOps | Docker, Docker Compose, Git & GitHub |
| Testing | pytest + FastAPI TestClient (backend), Playwright end-to-end run (UI) |

## Features

### Authentication and RBAC
- Register as a **Customer**, **Restaurant Owner** (creates the restaurant at sign-up) or **Delivery Partner**.
- Email + password sign-up and login. Passwords are hashed with bcrypt (cost 12), and both register and login return a JWT, so a new account is signed in straight away. The frontend stores the token in `localStorage` and sends it as `Authorization: Bearer …`. See [Authentication](#authentication).
- **Every rule is enforced on the backend.** Role guards cover each endpoint, and every query is scoped by owner. Another user's resources return `404`, so their IDs can't be probed.
- Protected React routes redirect by role. Expired sessions log out automatically.
- Login brute-force throttling (10 attempts per 10 minutes per IP and email).

### Customer
- Restaurant listing with search, **category chips** (with restaurant counts, kept in the URL as `?category=coffee`) and pagination. Cards show cuisine, rating, cost for two and up to two categories.
- Restaurant menu grouped into sticky sections, with name search, min/max price (hints show the menu's real price range) and a veg-only toggle. Opening a menu from a category (`?tag=rolls`) scrolls to and highlights the matching dishes.
- Dish search across all restaurants by name and price range.
- Cart (one restaurant per order) kept in React state and persisted per user in `localStorage`, with a sticky "View cart" bar.
- **Reorder** a past order: dishes still on the menu go back into the cart and the server re-prices them.
- Checkout uses a **server-side price quote** (`POST /orders/quote`), so totals are never computed by the client.
- Dummy payment (card, UPI, wallet or cash). No card data is ever collected.
- My orders: **Active / Past** tabs, a live-order card with a progress stepper (refreshes every 20 s), orders grouped by day, status and date filters, and pagination ("Load more" on phones). The order detail page has the stepper, status history and payment ledger.
- Cancel while the order is `PLACED`, which triggers an automatic refund in the ledger.
- Rate and review after delivery (one review per order).
- Request a refund after delivery, with a mandatory reason (one request per order).
- **AI Order Insights**: ask questions like "How much did I spend this week?"

### Restaurant owner
- Dashboard with net and gross revenue, orders today, active orders, average order value, rating, pending refunds, a 7-day revenue chart, orders by status and top dishes. Everything is computed by SQL aggregates.
- Reminders panel for orders stuck in `PLACED` or `ACCEPTED` for more than 15 minutes.
- **Kanban order board** (New → Accepted → Preparing → Ready → Out) with one next action per card, a warning border on orders waiting over 15 minutes, and a refresh every 30 s. Columns become tabs on phones. An "All orders" view has status and date filters, sorting and pagination. Assign or reassign a delivery partner (the list shows each partner's current load).
- Menu management: add, edit or delete dishes, plus an availability toggle, search and filters.
- Refund requests: approve (order becomes `REFUNDED`, payment `refunded`, and a refund ledger entry is written) or reject, with a note.
- Restaurant profile and an open/closed switch.

### Delivery partner
- Mobile-first delivery cards (assigned orders only): pickup restaurant → customer name, address and **tap-to-call** phone, with one full-width next-step button. "Mark delivered" asks for confirmation.
- `ASSIGNED → OUT_FOR_DELIVERY → DELIVERED`.
- Delivery history with status and date filters, plus counters (active, delivered today, delivered all time).

### Platform
- **Order state machine** with role-specific transitions. Invalid transitions return `409`; transitions by the wrong role return `403`. Status changes lock the order row.
- **Payment ledger**: append-only `PAYMENT` and `REFUND` rows with unique transaction references.
- **Middleware** logs the method, path, status and duration of every request, adds `X-Request-ID` and `X-Process-Time` (response time in milliseconds), adds security headers, and catches unhandled errors.
- **Timezone-aware business days**: all day boundaries (date filters, "orders today", the 7-day chart, "spent this week") follow `APP_TIMEZONE`, so an order at 00:30 IST counts as that day, not the previous UTC day.
- **Background task**: an asyncio scheduler (started in the app lifespan) scans every 60 s for stale orders and writes `admin_reminder_logs`. It deduplicates, and reminders auto-resolve when the order moves on.
- Responsive UI (checked at 375 px and 1280 px) with light and dark themes (a sun/moon toggle in the navbar and a Light / Dark / System choice in the avatar menu, remembered per browser and applied before first paint), skeleton loaders, empty and error states with Retry, toasts, optimistic updates that roll back on failure, and confirmation for irreversible actions. Customers get a top nav on desktop and a bottom tab bar on phones; owners get a sidebar.

### Order lifecycle

```
PLACED ──► ACCEPTED ──► PREPARING ──► READY ──► ASSIGNED ──► OUT_FOR_DELIVERY ──► DELIVERED ──► REFUNDED
  │  (owner)        (owner)       (owner)   (owner assigns)   (partner)            (partner)    (owner approves return)
  └──► CANCELLED  (customer cancels or owner rejects — only while PLACED; payment auto-refunded)
```

## Architecture

```
┌──────────────────────┐   REST + JWT    ┌──────────────────────────────────────────┐      ┌──────────────┐
│ React SPA (Vite)     │ ──────────────► │ FastAPI                                  │ ───► │ PostgreSQL   │
│  AuthContext         │                 │  middleware: logging, timing, headers    │      │  (Docker)    │
│  CartContext         │ ◄────────────── │  routers  → services → SQLAlchemy models │      └──────────────┘
│  role-guarded routes │      JSON       │  order state machine · payment ledger    │
└──────────────────────┘                 │  reminder scheduler (asyncio, lifespan)  │ ───► OpenAI API
                                         └──────────────────────────────────────────┘
```

**Database tables:** `users`, `restaurants`, `menu_items`, `orders`, `order_items`, `order_status_history`, `reviews`, `payment_ledger`, `return_requests`, `admin_reminder_logs`, `categories`, `restaurant_categories`.

Key relationships:

- A customer has many orders.
- A restaurant has many menu items and many orders.
- An order has many order items, many ledger entries, one optional review and one optional return request.
- A delivery partner is assigned to many orders.

Order items snapshot the dish name and price, so history survives menu edits. Enum columns carry database `CHECK` constraints, and ratings, prices and quantities have range checks.

## Quick start

**Prerequisites:** Docker Desktop (or OrbStack), Node.js 18 or newer, and Git.

### 1. Clone and configure

```bash
git clone <your-repo-url> campusbite
cd campusbite
cp .env.example .env
```

Edit `.env` and set at least:

```bash
POSTGRES_PASSWORD=<any strong password>
JWT_SECRET_KEY=<run: python3 -c "import secrets; print(secrets.token_urlsafe(48))">
OPENAI_API_KEY=<optional — enables AI insights>
```

### 2. Start the backend and database with Docker Compose

```bash
docker compose up -d --build
docker compose ps          # both services should show "healthy"
docker compose logs -f backend
```

On startup the backend container:

1. Waits for Postgres to be healthy.
2. Runs `alembic upgrade head`.
3. Seeds the Lucknow demo data if `SEED_DEMO_DATA=true`. This is idempotent (see [Seed data](#seed-data)).
4. Starts Uvicorn on **http://localhost:8000**.

Swagger docs are at **http://localhost:8000/docs**.

### 3. Run the frontend locally

```bash
cd frontend
cp .env.example .env       # VITE_API_URL=http://localhost:8000/api
npm install
npm run dev                # → http://localhost:5173
```

Production build: `npm run build`, which outputs to `frontend/dist/`.

### Seed data

The demo data lives in **`backend/seed_data_lucknow.json`**: 45 Lucknow restaurants, 9 categories and 1,000 menu items (20–25 per restaurant), plus demo customers and delivery partners. `backend/app/seed.py` loads it. A restaurant can be in several categories (Tunday Kababi is in both Mughlai and Rolls), and each dish carries category tags.

The 9 categories are **North Indian, Mughlai, South Indian, Rolls, Coffee, Sweets, Cafe, Cake and Momos**.

```bash
docker compose exec backend python seed.py --reset   # wipe restaurants/menus/orders and reload the file
docker compose exec backend python seed.py           # no-op if categories already exist
```

- `--reset` runs in one transaction. It deletes reminders, reviews, returns, payments, orders, menus, categories, restaurants and the seeded owner accounts, then reloads everything. Seeded customers and riders, and anyone who signed up themselves, are kept. (A self-registered owner's restaurant is removed too, because every restaurant is replaced.)
- The seed also creates 20 orders over the last 14 days through the real order service. They cover every status, with payment ledger rows, 3 reviews, 1 pending refund request and 2 orders left `PLACED`/`ACCEPTED` for more than 15 minutes, so owner reminders appear straight away.
- The script prints a summary: `45 restaurants, 9 categories, 1000 menu items, 20 orders`.

> Demo data for educational use. Not affiliated with any restaurant; menus and prices are illustrative.

### Demo accounts (seeded)

Every demo account is `@campusbite.dev` with the password **`Password@123`**.

| Role | Email |
|---|---|
| Customers (with order history) | `aarav@campusbite.dev`, `sana@campusbite.dev`, `rohit@campusbite.dev` |
| Restaurant owner (Tunday Kababi: most demo orders and live reminders) | `owner.tundaykababi@campusbite.dev` |
| Other restaurant owners | `owner.<restaurant>@campusbite.dev`, e.g. `owner.starbucks@campusbite.dev` (each owner's email is in the data file) |
| Delivery partners | `imran.rider@campusbite.dev`, `deepak.rider@campusbite.dev`, `vikas.rider@campusbite.dev` |

Photos come from the `image_url` values in the data file (loremflickr keyword images, hotlinked). They aren't checked against each dish. If the image host is unavailable, cards and dishes show the brand placeholder instead.

Set `SEED_DEMO_DATA=false` and `VITE_SHOW_DEMO_ACCOUNTS=false` for a real deployment.

### Useful commands

```bash
docker compose down              # stop (data kept in the pgdata volume)
docker compose down -v           # stop AND wipe the database
docker compose up -d --build     # rebuild after backend code changes
docker compose exec db psql -U campusbite -d campusbite   # SQL shell
```

## Authentication

```
Sign up:  POST /auth/register {name, email, phone, password, role, restaurant?} ──► 201 {access_token, token_type, user}
Log in:   POST /auth/login    {email, password}                              ──► 200 {access_token, token_type, user}
Then:     Authorization: Bearer <access_token>   (GET /auth/me returns the current user)
```

- **Passwords** are hashed with bcrypt and never stored or logged in plain text. The rules are at least 8 characters with at least one letter and one number, checked on the client and enforced by the API.
- **Emails** are trimmed and lower-cased on every request, so `Aarav@CampusBite.dev ` and `aarav@campusbite.dev` are the same account. Registering an email that already exists returns `409`.
- **Login errors** don't reveal which part was wrong: an unknown email and a wrong password both return `401 "Invalid email or password."` (bcrypt runs either way, so timing doesn't leak it either). More than 10 attempts in 10 minutes from the same IP for the same email returns `429` with `Retry-After`.
- **Owners** register with their restaurant in the same request; the user and the restaurant are created in one transaction.
- **Tokens** are signed JWTs (`HS256`, `JWT_SECRET_KEY`) with `sub`, `role`, `iat` and `exp`. The frontend keeps the token and user in `localStorage`, re-validates the token with `/auth/me` on load, and logs out on any `401`.
- **RBAC** is enforced by the API on every route: each endpoint declares the roles it allows (`customer`, `restaurant_owner`, `delivery_partner`), and the wrong role gets `403`. React route guards only redirect for convenience; they aren't the security boundary.

## Environment variables

### Root `.env` (read by Docker Compose and the backend container)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `POSTGRES_PASSWORD` | **yes** | — | Database password |
| `POSTGRES_DB` / `POSTGRES_USER` | no | `campusbite` | Database name and user |
| `BACKEND_PORT` | no | `8000` | Host port for the API |
| `JWT_SECRET_KEY` | **yes** | — | JWT signing key (32+ characters) |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | no | `720` | Token lifetime |
| `CORS_ORIGINS` | no | `http://localhost:5173,…` | Comma-separated allowed frontend origins |
| `SEED_DEMO_DATA` | no | `true` (example) | Seed demo data on start |
| `OPENAI_API_KEY` | for AI | — | Enables AI insights. Without it, the endpoint returns `503` with a clear message. |
| `OPENAI_MODEL` | no | `gpt-5.4-mini` | OpenAI chat model |
| `AI_RATE_LIMIT_PER_MINUTE` | no | `5` | AI questions per customer per minute |
| `ENABLE_REMINDER_SCHEDULER` | no | `true` | Run the background reminder job |
| `REMINDER_THRESHOLD_MINUTES` | no | `15` | When an order counts as stale |
| `REMINDER_CHECK_INTERVAL_SECONDS` | no | `60` | Scheduler interval |
| `APP_TIMEZONE` | no | `Asia/Kolkata` | Business timezone for "today", date filters, daily revenue chart and AI date questions (timestamps are stored in UTC) |
| `LOG_LEVEL` | no | `INFO` | Logging level |
| `LOGIN_RATE_LIMIT` / `LOGIN_RATE_WINDOW_SECONDS` | no | `10` / `600` | Login attempts allowed per IP + email within the window |

`DATABASE_URL` is assembled by `docker-compose.yml` from the Postgres variables.

### `frontend/.env`

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000/api` | Backend base URL |
| `VITE_SHOW_DEMO_ACCOUNTS` | `true` | Show the demo-login helper |

## Database setup

- **With Docker (recommended):** nothing to do. Compose starts PostgreSQL 16 with a persistent volume, and the backend applies Alembic migrations automatically.
- **Schema changes:** edit the models in `backend/app/models/`, then:
  ```bash
  cd backend
  alembic revision --autogenerate -m "describe change"
  alembic upgrade head
  ```
- **Seed demo data manually:** `python seed.py` (safe to re-run) or `python seed.py --reset` to reload it.
- **Reset:** `docker compose down -v && docker compose up -d`.

## Running the backend without Docker

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # set JWT_SECRET_KEY; DATABASE_URL defaults to SQLite
alembic upgrade head
python seed.py                # optional demo data (--reset to reload)
uvicorn app.main:app --reload --port 8000
```

## API documentation

Interactive docs are at `http://localhost:8000/docs` (Swagger) and `/redoc`. To call protected endpoints from Swagger:

1. Call `POST /api/auth/login`.
2. Click **Authorize**.
3. Paste the `access_token`.

All routes are prefixed with `/api`. Lists return `{items, total, page, page_size, pages}` and accept `page` and `page_size` (maximum 100).

| Method & path | Role | Description |
|---|---|---|
| `POST /auth/register` | public | Register (owners include a `restaurant` object) and receive a JWT |
| `POST /auth/login` | public | Log in and receive a JWT (`401` on bad credentials, `429` when rate limited) |
| `GET / PATCH /auth/me` | any | Current profile |
| `GET /categories` | public | `[{slug, name, description, restaurant_count}]` |
| `GET /restaurants` | public | List restaurants (`category` slug, `search`/`q`, `cuisine`, `open_only`, `sort`, `page`, `size`/`page_size`). Items include `categories`, `primary_category`, `cost_for_two`, `avg_rating`, `review_count` |
| `GET /restaurants/cuisines` | public | Distinct cuisines |
| `GET /restaurants/{id}` | public | Restaurant details and its menu `sections` |
| `GET /restaurants/{id}/menu` | public | Menu grouped by section: `{sections: [{name, items}], total, price_min, price_max}` (`tag`, `search`/`q`, `min_price`, `max_price`, `veg_only`, `available_only`, `sort`) |
| `GET /restaurants/{id}/reviews` | public | Reviews |
| `GET /dishes` | public | Search dishes across restaurants by name and price |
| `POST /orders/quote` | customer | Server-side price preview of a basket |
| `POST /orders` | customer | Place an order. The dummy payment sets `payment_status=mock_paid`. |
| `GET /orders` | any | Role-scoped list (`status=A,B`, `scope=active\|history`, `date_from`, `date_to`, `sort`). Each row includes an `items_preview` (name × quantity) for list views |
| `GET /orders/{id}` | any (scoped) | Details: items, history, ledger, review, return, `allowed_actions` |
| `GET /orders/{id}/payments` | customer, owner | Payment ledger entries |
| `PATCH /orders/{id}/status` | owner, partner | Lifecycle transition (validated) |
| `POST /orders/{id}/cancel` | customer, owner | Cancel or reject while `PLACED` (auto-refund) |
| `POST /orders/{id}/assign` | owner | Assign or reassign a delivery partner (`READY` or `ASSIGNED`) |
| `POST /orders/{id}/review` | customer | Rate 1–5 with a comment (after delivery, once) |
| `POST /orders/{id}/return` | customer | Request a refund with a reason (after delivery, once) |
| `GET /returns` | customer, owner | Own or restaurant return requests (`status`) |
| `POST /returns/{id}/approve` | owner | Approve: order `REFUNDED`, payment `refunded`, ledger refund |
| `POST /returns/{id}/reject` | owner | Reject with a note |
| `GET / PATCH /owner/restaurant` | owner | Restaurant profile and open/closed state |
| `GET / POST /owner/menu-items` | owner | List or create dishes |
| `GET / PATCH / DELETE /owner/menu-items/{id}` | owner | Manage a dish |
| `PATCH /owner/menu-items/{id}/availability` | owner | Toggle availability |
| `GET /owner/delivery-partners` | owner | Partners with active and completed counts |
| `GET /owner/stats` | owner | Restaurant statistics |
| `GET /owner/reminders` | owner | Stale-order reminders (`include_resolved`) |
| `POST /owner/reminders/{id}/dismiss` | owner | Dismiss a reminder |
| `GET /delivery/stats` | partner | Delivery counters |
| `GET /ai/status` | customer | Whether AI is configured |
| `POST /ai/insights` | customer | Ask a question about your own orders |
| `GET /health` | public | Liveness and database check (`503` when the database is unreachable, so the Docker healthcheck fails) |

**Status codes:**

| Code | Meaning |
|---|---|
| `201` | Created |
| `401` | Missing or invalid token |
| `403` | Wrong role |
| `404` | Not found, or not yours |
| `409` | Business-rule conflict (invalid transition, duplicate review or return, unavailable dish) |
| `422` | Validation error |
| `429` | Rate limited |
| `502` / `503` / `504` | AI upstream problems |

### How the AI feature stays private

The backend builds the AI context only from orders where `customer_id` equals the authenticated user. The question text never selects data, so asking about "order #42 of another user" can't widen the scope. Aggregates (total spent, spend this week or month, undelivered orders, most-ordered items) are computed in SQL over the customer's **entire** order history, so the model doesn't have to do arithmetic. Only the per-order detail rows are capped (latest 50, `AI_CONTEXT_MAX_ORDERS`) to keep the prompt small. The key is read only from the backend environment.

## Testing

```bash
cd backend && source .venv/bin/activate
pytest -q
```

52 tests cover:

- **Auth:** register and login return a JWT, duplicate email `409`, identical `401` for wrong email or password, email normalisation, password rules, bcrypt hashing, `/auth/me`, the login rate limit (`429`) and role guards (`403`).
- **RBAC:** role guards and cross-tenant isolation for customers, owners and riders.
- **Orders:** server-side pricing, the full lifecycle, every invalid transition, cancel rules and auto-refund, and the order-list item preview staying scoped to the right user.
- **Reviews and returns:** review and return rules.
- **Payments:** ledger entries.
- **Owner features:** statistics accuracy, reminder generation, deduplication and auto-resolution.
- **AI:** context isolation (a mocked OpenAI client verifies no foreign orders are sent), totals over the full history even when the detail rows are capped, app rate limiting, and mapping of OpenAI `429`.
- **Catalogue and seed data:** category counts, the many-to-many category filter, menu grouping and `tag` filter, the data file's shape (45 / 9 / 1000, 20–25 dishes each), and `seed --reset` keeping self-registered users.
- **Timezones:** orders just after and just before local midnight land on the correct local day in filters, dashboard counts and the chart.
- **Middleware and health:** logging and timing headers; `/health` returns `503` when the database is down.

### End-to-end UI test

A Playwright script drives the real UI in Chrome across all three roles. Start the backend with demo data and run `npm run dev` first. Then:

```bash
cd frontend
npm run e2e        # CHROME_PATH=/path/to/chrome and E2E_BASE_URL=... are optional
```

It covers this flow:

1. Customer filters by the **Coffee** chip (URL `?category=coffee`), opens Starbucks with its coffee dishes highlighted, adds 2 dishes (sticky cart bar), searches the menu, sees the server quote and pays (mock), then gets a success screen and the tracking page.
2. The Starbucks owner moves the order across the Kanban board (New → Accepted → Preparing → Ready) and assigns a rider.
3. Rider, on a 390 px phone, sees the tap-to-call card, picks up, confirms delivery, and finds the order in history.
4. Customer reviews, requests a refund, and uses Reorder (re-quoted by the server).
5. Owner approves the refund through the confirm step. The order becomes Refunded with a refund ledger entry.
6. A new customer signs up and lands on the home page signed in (the session survives a refresh), logs out, and sees the inline error for a wrong password.

It also checks role-based redirects, the mobile tab bar, dark mode with no horizontal overflow, the one-restaurant cart prompt, and that the theme toggle works before login, persists and applies without a flash. It fails on any browser console error, except failed loads from the third-party demo-image host.

### Design system

Frontend styling follows [DESIGN.md](DESIGN.md). The brand is Tandoor orange `#B9452E` (flame `#F09075` for brand text in dark mode). The logo suite lives in `frontend/src/assets/brand/` and is rendered through `<Logo variant="full" | "mark">` and `<LogoMonoWhite>`, which pick the light or dark artwork from the theme. The favicon, apple-touch icon and web manifest are in `frontend/public/`. All colours, spacing, type and motion come from `frontend/src/styles/tokens.css`, and reusable components live in `frontend/src/components/ui/`. In development, http://localhost:5173/styleguide renders every component and state in either theme. The route isn't included in production builds.

Accessibility: every text/background token pair is at least 4.5:1 in both themes, touch targets are at least 44 px (48 px on the delivery-partner screens), and every control has an accessible name. Where DESIGN.md had to bend to meet the capstone requirements or its own accessibility rules, the reason is listed in its "Deviations" table.

## Security notes

- Secrets (`.env`) are git-ignored. Only `.env.example` files are committed, and the Docker image excludes `.env`.
- bcrypt hashing. Login responses don't reveal whether an email exists (constant-time path). Login and AI endpoints are rate limited.
- JWTs require `sub`, `exp` and `iat`. The user is re-loaded from the database on each request, so deactivated users are rejected.
- Authorization is enforced server-side for every route and every row. Client-sent prices are ignored.
- The container runs as a non-root user. The database port isn't published to the host.
- AI answers are rendered with a safe Markdown renderer. No `dangerouslySetInnerHTML` is used.
- The in-process rate limiter suits a single backend instance. Use Redis if you scale horizontally.

## Project structure

```
campusbite/
├── docker-compose.yml        # Postgres + backend
├── DESIGN.md                 # UI design brief and token rules
├── CLAUDE.md                 # Working notes for AI-assisted development
├── .env.example
├── backend/
│   ├── Dockerfile · docker-entrypoint.sh · requirements*.txt · alembic.ini
│   ├── alembic/              # migrations
│   ├── app/
│   │   ├── main.py           # app factory, middleware, lifespan scheduler
│   │   ├── core/             # config, database, security, middleware, rate limiting
│   │   ├── models/           # SQLAlchemy models + enums
│   │   ├── schemas/          # Pydantic request/response models
│   │   ├── api/              # dependencies (auth/RBAC) + routers
│   │   ├── services/         # order state machine, stats, reminders, AI, pagination
│   │   └── seed.py           # loads seed_data_lucknow.json (--reset to reload)
│   ├── seed.py               # `python seed.py [--reset]` entry point
│   ├── seed_data_lucknow.json # demo restaurants, categories, menus, users
│   └── tests/                # pytest suite
└── frontend/
    ├── index.html · vite.config.js · .env.example
    └── src/
        ├── api/              # axios client (JWT interceptor) + endpoint functions
        ├── context/          # Auth, Cart, Toast providers
        ├── hooks/            # useAsync, useDebounced, usePaged (pages / load more)
        ├── components/       # AppShell (nav), ProtectedRoute, OrderActions, OrderCard, RevenueChart
        │   └── ui/           # design-system components: Button, Field, Badge, Modal, DishCard, OrderStepper…
        ├── pages/            # auth/, customer/, owner/, delivery/, OrderDetail, Profile
        └── styles/           # tokens.css, base, components, layout, pages (light and dark)
```
