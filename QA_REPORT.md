# CampusBite — QA report

Full audit of the codebase against [SPEC.md](SPEC.md) (the capstone brief), sections 1–13. Every requirement below is implemented, points to where it lives, and is verified by an automated test or a recorded manual check.

**Result:** 137 requirements — 118 PASS, 16 FIXED during this audit, 3 ADDED (new coverage or behaviour). No open requirement.

Status key: **PASS** already met; **FIXED** was wrong or incomplete and was corrected; **ADDED** was missing (behaviour or its verification) and was added.

Test key: `pytest` = `backend/tests/` (SQLite, OpenAI mocked) · `E2E` = Playwright in `frontend/e2e/` · `smoke` = `scripts/smoke_test.py` against the running Docker API.

## 1. Requirement matrix


### §1 Technology stack

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Frontend: React.js, JavaScript (ES6+), React Hooks | `frontend/package.json:14`<br>`frontend/src/context/AuthContext.jsx:17` | `npm run build`<br>E2E `journey.spec.js` “customer registers, browses by category” | **PASS** |
| React Router DOM for routing | `frontend/src/App.jsx:39` | E2E `app.spec.js` “a customer visiting /owner pages is redirected” | **PASS** |
| Axios for API integration | `frontend/src/api/client.js:8` | E2E `journey.spec.js` “customer registers, browses by category” | **PASS** |
| Backend: Python, FastAPI, Pydantic, SQLAlchemy ORM | `backend/app/main.py:38`<br>`backend/app/schemas/__init__.py:75`<br>`backend/app/models/__init__.py:147` | pytest (164 tests) | **PASS** |
| JWT authentication | `backend/app/core/security.py:26`<br>`backend/app/api/deps.py:26` | pytest `test_auth.py::test_login_returns_token_and_me_works` | **PASS** |
| Docker and Docker Compose | `backend/Dockerfile:2`<br>`docker-compose.yml:3` | `docker compose up -d --build` (healthy), fresh-clone test | **PASS** |
| SQL relational database (PostgreSQL 16) via SQLAlchemy | `docker-compose.yml:5`<br>`backend/app/core/database.py:51` | `alembic check` in the container: no drift | **PASS** |
| OpenAI API | `backend/app/services/ai_service.py:179` | pytest `test_ai_stats_middleware.py::test_four_example_queries_get_the_facts_they_need` | **PASS** |
| Git and GitHub | `README.md:124` | git history (phase commits); public repo pending owner approval | **PASS** |

### §2A Customer

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Register and log in | `backend/app/api/routers/auth.py:37`<br>`backend/app/api/routers/auth.py:65`<br>`frontend/src/pages/auth/Register.jsx:38` | pytest `test_auth.py::test_register_returns_token_and_signs_in`<br>E2E `journey.spec.js` “customer registers, browses by category”<br>smoke “register customer” | **PASS** |
| Browse available restaurants | `backend/app/api/routers/restaurants.py:91`<br>`frontend/src/pages/customer/Restaurants.jsx:55` | pytest `test_catalogue.py::test_category_filter_uses_join_table`<br>E2E `journey.spec.js` “customer registers, browses by category” | **PASS** |
| View restaurant menus and food details | `backend/app/api/routers/restaurants.py:150`<br>`frontend/src/pages/customer/RestaurantMenu.jsx:15` | pytest `test_menu.py::test_menu_is_grouped_by_section_in_menu_order` | **PASS** |
| Search and filter dishes by name and price | `backend/app/api/routers/restaurants.py:43`<br>`backend/app/api/routers/restaurants.py:186` | pytest `test_menu.py::test_public_menu_search_and_price_filter`<br>E2E `journey.spec.js` “searches, filters by price”<br>smoke “customer searches the menu by name and price” | **PASS** |
| Add dishes to the cart | `frontend/src/context/CartContext.jsx:44` | E2E `journey.spec.js` “fills the cart and checks out” | **PASS** |
| Update or remove cart items | `frontend/src/context/CartContext.jsx:68`<br>`frontend/src/context/CartContext.jsx:78` | E2E `journey.spec.js` “fills the cart and checks out” | **PASS** |
| Place orders with a dummy payment | `backend/app/services/order_service.py:308`<br>`backend/app/services/order_service.py:223` | pytest `test_orders.py::test_place_order_computes_totals_and_mock_payment`<br>smoke “customer places an order” | **PASS** |
| View order history | `backend/app/api/routers/orders.py:48`<br>`frontend/src/pages/customer/CustomerOrders.jsx:17` | pytest `test_orders.py::test_filters_and_pagination`<br>E2E `journey.spec.js` “fills the cart and checks out” | **PASS** |
| Track order status | `frontend/src/pages/OrderDetail.jsx:21`<br>`frontend/src/pages/OrderDetail.jsx:27` | pytest `test_lifecycle_matrix.py::test_happy_path_by_all_three_roles` | **PASS** |
| Cancel orders when allowed (PLACED only) | `backend/app/services/order_service.py:340` | pytest `test_lifecycle_matrix.py::test_cancel_only_in_placed`<br>E2E `journey.spec.js` “customer cancels a PLACED order” | **FIXED** |
| Ratings and reviews after delivery | `backend/app/api/routers/orders.py:122` | pytest `test_reviews_returns.py::test_review_only_after_delivery_once`<br>pytest `test_lifecycle_matrix.py::test_review_and_return_only_after_delivery`<br>E2E `journey.spec.js` “customer reviews the delivered order” | **FIXED** |
| Return/refund request after delivery | `backend/app/api/routers/orders.py:145` | pytest `test_reviews_returns.py::test_return_flow_approve`<br>E2E `journey.spec.js` “requests a refund” | **FIXED** |
| AI summaries and insights about past orders | `backend/app/api/routers/ai.py:23`<br>`frontend/src/pages/customer/AiInsights.jsx:17` | pytest `test_ai_stats_middleware.py::test_four_example_queries_get_the_facts_they_need`<br>E2E `app.spec.js` “AI insights page renders” | **PASS** |

### §2B Restaurant owner

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Log in | `backend/app/api/routers/auth.py:65` | E2E `journey.spec.js` “owner sees the order” | **PASS** |
| Add new dishes | `backend/app/api/routers/owner.py:79`<br>`frontend/src/pages/owner/MenuManagement.jsx:14` | pytest `test_menu.py::test_owner_menu_crud_and_isolation`<br>smoke “owner adds a dish” | **PASS** |
| View, update and manage dishes | `backend/app/api/routers/owner.py:93`<br>`backend/app/api/routers/owner.py:116` | pytest `test_menu.py::test_owner_menu_crud_and_isolation` | **PASS** |
| Mark dishes available/unavailable | `backend/app/api/routers/owner.py:107` | pytest `test_orders.py::test_unavailable_or_foreign_items_rejected`<br>smoke “owner marks a dish unavailable” | **PASS** |
| View incoming orders | `frontend/src/pages/owner/OwnerOrders.jsx:23`<br>`backend/app/services/order_service.py:93` | E2E `journey.spec.js` “owner sees the order” | **PASS** |
| Accept orders and update preparation status | `backend/app/services/order_service.py:41`<br>`backend/app/api/routers/orders.py:91` | pytest `test_lifecycle_matrix.py::test_happy_path_by_all_three_roles`<br>smoke “owner accepts” | **PASS** |
| Assign delivery partners | `backend/app/services/order_service.py:354` | pytest `test_lifecycle_matrix.py::test_assign_only_when_ready`<br>E2E `journey.spec.js` “assigns a delivery partner” | **FIXED** |
| Filter orders by status and date | `backend/app/services/order_service.py:121`<br>`frontend/src/components/ui/FilterBar.jsx:26` | pytest `test_orders.py::test_filters_and_pagination`<br>pytest `test_timezone.py::test_order_just_after_local_midnight_is_filed_under_local_day` | **PASS** |
| Basic restaurant statistics | `backend/app/services/stats_service.py:30`<br>`frontend/src/pages/owner/OwnerDashboard.jsx:13` | pytest `test_ai_stats_middleware.py::test_owner_stats_match_seeded_orders`<br>pytest `test_owner_reminders_ai.py::test_stats_are_computed_from_data` | **PASS** |
| Approve or reject return/refund requests | `backend/app/api/routers/returns.py:78`<br>`backend/app/api/routers/returns.py:92` | pytest `test_reviews_returns.py::test_return_flow_approve`<br>pytest `test_reviews_returns.py::test_return_flow_reject`<br>E2E `journey.spec.js` “owner approves the refund” | **PASS** |
| Reminders for orders not updated in time | `backend/app/services/reminder_service.py:20`<br>`backend/app/api/routers/owner.py:149` | pytest `test_owner_reminders_ai.py::test_reminders_generated_deduped_and_resolved`<br>E2E `app.spec.js` “owner dashboard shows reminders” | **PASS** |

### §2C Delivery partner

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Log in | `backend/app/api/routers/auth.py:65` | E2E `journey.spec.js` “delivery partner sees only their order” | **PASS** |
| View only orders assigned to them | `backend/app/services/order_service.py:100` | pytest `test_orders.py::test_delivery_partner_scope`<br>smoke “unassigned rider cannot see the order → 404” | **PASS** |
| View customer delivery details | `backend/app/services/order_service.py:418` | pytest `test_orders.py::test_delivery_partner_scope`<br>smoke “rider sees customer delivery details” | **PASS** |
| Update status to Out for Delivery | `backend/app/services/order_service.py:46` | smoke “rider picks up (out for delivery)” | **PASS** |
| Mark orders Delivered | `backend/app/services/order_service.py:47` | smoke “rider delivers”<br>E2E `journey.spec.js` “delivers it (390px)” | **PASS** |
| View delivery history | `frontend/src/pages/delivery/DeliveryDashboard.jsx:17` | smoke “order is in the rider's delivery history” | **PASS** |

### §3 Authentication and authorization

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Register and log in | `backend/app/api/routers/auth.py:37` | pytest `test_auth.py::test_register_returns_token_and_signs_in`<br>pytest `test_auth.py::test_duplicate_email_is_409_case_insensitive` | **PASS** |
| Password hashing with bcrypt | `backend/app/core/security.py:12` | pytest `test_auth.py::test_password_is_bcrypt_hashed` | **PASS** |
| JWT tokens; 401 for missing/invalid token | `backend/app/core/security.py:41`<br>`backend/app/api/deps.py:19` | pytest `test_auth.py::test_protected_endpoints_require_token`<br>pytest `test_rbac_matrix.py::test_anonymous_gets_401` | **PASS** |
| Three roles | `backend/app/models/enums.py:4` | pytest `test_auth.py::test_role_guards` | **PASS** |
| Protect frontend pages by role | `frontend/src/components/ProtectedRoute.jsx:11`<br>`frontend/src/App.jsx:56` | E2E `app.spec.js` “a customer visiting /owner pages is redirected” | **PASS** |
| Protect backend APIs (authn + authz on every endpoint) | `backend/app/api/deps.py:46` | pytest `test_rbac_matrix.py::test_matrix_covers_every_endpoint`<br>pytest `test_rbac_matrix.py::test_wrong_role_gets_403` | **PASS** |
| Users only access data they're authorized for (no IDOR) | `backend/app/services/order_service.py:104` | pytest `test_rbac_matrix.py::test_other_users_resources_are_404`<br>pytest `test_orders.py::test_customer_and_owner_isolation` | **PASS** |
| Token in localStorage, sent as Bearer header | `frontend/src/api/client.js:13` | E2E `app.spec.js` “a session survives a refresh” | **PASS** |
| Backend authorization, not just hidden UI | `backend/app/api/deps.py:58` | E2E `journey.spec.js` “API rejects what the UI hides”<br>smoke “customer cannot read owner stats → 403” | **PASS** |

### §4 Order lifecycle

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| PLACED → … → DELIVERED, plus CANCELLED and REFUNDED | `backend/app/models/enums.py:10`<br>`backend/app/services/order_service.py:40` | pytest `test_lifecycle_matrix.py::test_transition_table_matches_spec`<br>pytest `test_lifecycle_matrix.py::test_happy_path_by_all_three_roles` | **PASS** |
| Customers cancel only in PLACED | `backend/app/services/order_service.py:344` | pytest `test_lifecycle_matrix.py::test_cancel_only_in_placed` | **FIXED** |
| Owners accept and update preparation status | `backend/app/services/order_service.py:43` | pytest `test_lifecycle_matrix.py::test_happy_path_by_all_three_roles` | **PASS** |
| Assign partners only when READY | `backend/app/services/order_service.py:376` | pytest `test_lifecycle_matrix.py::test_assign_only_when_ready` | **FIXED** |
| Partners update only their assigned orders | `backend/app/services/order_service.py:93` | pytest `test_orders.py::test_delivery_partner_scope`<br>pytest `test_lifecycle_matrix.py::test_wrong_role_on_valid_transition_is_403` | **PASS** |
| Partners move ASSIGNED → OUT_FOR_DELIVERY → DELIVERED | `backend/app/services/order_service.py:46` | pytest `test_lifecycle_matrix.py::test_happy_path_by_all_three_roles` | **PASS** |
| Delivered orders cannot be cancelled | `backend/app/services/order_service.py:342` | pytest `test_lifecycle_matrix.py::test_cancel_only_in_placed`<br>smoke “delivered order cannot be cancelled → 400” | **FIXED** |
| Invalid transitions rejected by the backend (400) | `backend/app/services/order_service.py:153` | pytest `test_lifecycle_matrix.py::test_every_invalid_generic_transition_is_400`<br>smoke “skipping a step (PLACED → READY) → 400” | **FIXED** |

### §5 Dummy payment, returns and refunds

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Order without real payment (dummy gateway) | `backend/app/services/order_service.py:223` | pytest `test_orders.py::test_place_order_computes_totals_and_mock_payment` | **PASS** |
| Payment status mock_paid after placing | `backend/app/models/enums.py:24` | smoke “payment_status is mock_paid” | **PASS** |
| Payment record (ledger) for dummy payments | `backend/app/models/__init__.py:245` | smoke “payment ledger has a PAYMENT entry” | **PASS** |
| Return/refund only after delivery | `backend/app/api/routers/orders.py:150` | pytest `test_lifecycle_matrix.py::test_review_and_return_only_after_delivery` | **FIXED** |
| Reason required for a return (empty → 422) | `backend/app/schemas/__init__.py:425` | pytest `test_reviews_returns.py::test_return_flow_approve`<br>smoke “return without a reason → 422” | **PASS** |
| Owners approve or reject returns | `backend/app/api/routers/returns.py:78` | pytest `test_reviews_returns.py::test_return_flow_approve` | **PASS** |
| Approve → payment refunded + refund record (order REFUNDED) | `backend/app/services/order_service.py:239` | smoke “owner approves the return → refunded”<br>smoke “ledger has PAYMENT + REFUND” | **PASS** |
| Reject → return status rejected | `backend/app/api/routers/returns.py:92` | pytest `test_reviews_returns.py::test_return_flow_reject` | **PASS** |
| One return request per order (409) | `backend/app/models/__init__.py:233` | smoke “second return request → 409” | **PASS** |

### §6 Dashboards and filtering

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Customer: previous and current orders | `frontend/src/pages/customer/CustomerOrders.jsx:17` | E2E `journey.spec.js` “fills the cart and checks out” | **PASS** |
| Customer: filter by status and date | `frontend/src/pages/customer/CustomerOrders.jsx:7` | pytest `test_orders.py::test_filters_and_pagination` | **PASS** |
| Customer: payment and return/refund status | `frontend/src/pages/OrderDetail.jsx:6`<br>`frontend/src/pages/OrderDetail.jsx:6` | E2E `journey.spec.js` “customer reviews the delivered order” | **PASS** |
| Customer: cancel eligible orders; reviews and returns | `frontend/src/components/OrderActions.jsx:76` | E2E `journey.spec.js` “customer cancels a PLACED order” | **PASS** |
| Owner: incoming orders, filters, menu, assignment, stats, returns | `frontend/src/pages/owner/OwnerOrders.jsx:7`<br>`frontend/src/pages/owner/OwnerReturns.jsx:13` | E2E `journey.spec.js` “owner sees the order”<br>E2E `journey.spec.js` “owner approves the refund” | **PASS** |
| Partner: assigned deliveries, status filter, update, history | `frontend/src/pages/delivery/DeliveryDashboard.jsx:6` | E2E `journey.spec.js` “delivery partner sees only their order” | **PASS** |
| Pagination for large lists (API + UI) | `backend/app/services/pagination.py:7`<br>`frontend/src/components/ui/Pagination.jsx:8` | pytest `test_rbac_matrix.py::test_lists_are_paginated` | **PASS** |

### §7 Applied AI

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Request summaries of previous orders | `backend/app/services/ai_service.py:152` | pytest `test_ai_stats_middleware.py::test_four_example_queries_get_the_facts_they_need` | **PASS** |
| Ask questions about order history | `backend/app/schemas/__init__.py:502` | pytest `test_ai_stats_middleware.py::test_four_example_queries_get_the_facts_they_need` | **PASS** |
| Backend fetches only the authenticated customer's orders | `backend/app/services/ai_service.py:117` | pytest `test_ai_stats_middleware.py::test_customer_a_never_appears_in_customer_b_prompt`<br>pytest `test_owner_reminders_ai.py::test_ai_context_only_contains_own_orders` | **PASS** |
| Send order data to the OpenAI API | `backend/app/services/ai_service.py:173` | pytest `test_ai_stats_middleware.py::test_four_example_queries_get_the_facts_they_need` | **PASS** |
| Display the response in React | `frontend/src/pages/customer/AiInsights.jsx:17` | E2E `app.spec.js` “AI insights page renders” | **PASS** |
| No access to other customers' data; no client-supplied customer id | `backend/app/schemas/__init__.py:506` | pytest `test_ai_stats_middleware.py::test_client_cannot_pass_a_customer_id` | **FIXED** |
| API key only in backend environment variables | `backend/app/core/config.py:36` | pytest `test_owner_reminders_ai.py::test_ai_disabled_without_key` | **PASS** |
| Error handling and rate-limit handling (429 / 502 / 503 / 504) | `backend/app/api/routers/ai.py:25`<br>`backend/app/services/ai_service.py:185` | pytest `test_ai_stats_middleware.py::test_openai_errors_are_mapped`<br>pytest `test_owner_reminders_ai.py::test_ai_rate_limit` | **ADDED** |
| Four example queries | `backend/app/services/ai_service.py:53` | pytest `test_ai_stats_middleware.py::test_four_example_queries_get_the_facts_they_need` | **ADDED** |

### §8 Middleware and background tasks

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Middleware logs request method and path | `backend/app/core/middleware.py:35` | pytest `test_ai_stats_middleware.py::test_middleware_times_and_logs_every_request` | **PASS** |
| Middleware measures response time (X-Process-Time) | `backend/app/core/middleware.py:31` | pytest `test_ai_stats_middleware.py::test_middleware_times_and_logs_every_request`<br>smoke “middleware sets X-Process-Time” | **FIXED** |
| Request-level processing (request id, error handler, security headers) | `backend/app/core/middleware.py:40` | pytest `test_owner_reminders_ai.py::test_middleware_headers` | **PASS** |
| Background task finds PLACED/ACCEPTED orders not updated for 15+ min | `backend/app/services/reminder_service.py:17`<br>`backend/app/services/reminder_service.py:72` | pytest `test_owner_reminders_ai.py::test_reminders_generated_deduped_and_resolved` | **PASS** |
| Generates reminder records (no duplicates) | `backend/app/models/__init__.py:280` | pytest `test_owner_reminders_ai.py::test_database_rejects_duplicate_reminder` | **PASS** |
| Reminders displayed on the owner dashboard | `frontend/src/pages/owner/OwnerDashboard.jsx:66` | E2E `app.spec.js` “owner dashboard shows reminders” | **PASS** |

### §9 React frontend

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Entire frontend in React; reusable components | `frontend/src/components/ui/index.js:1` | `/styleguide` renders every component; `npx knip` (no unused exports) | **PASS** |
| Hooks: useState, useEffect, useContext | `frontend/src/context/CartContext.jsx:1`<br>`frontend/src/hooks/useAsync.js:1` | ESLint react-hooks rules: 0 problems | **PASS** |
| React Router DOM navigation | `frontend/src/App.jsx:81` | E2E `app.spec.js` “a customer visiting /owner pages is redirected” | **PASS** |
| Separate pages/dashboards per role | `frontend/src/App.jsx:64` | E2E `app.spec.js` “no horizontal scroll at” | **PASS** |
| Cart and user data in React state (Context) | `frontend/src/context/CartContext.jsx:23`<br>`frontend/src/context/AuthContext.jsx:16` | E2E `journey.spec.js` “fills the cart and checks out” | **PASS** |
| REST APIs via Axios | `frontend/src/api/endpoints.js:29` | E2E `journey.spec.js` “customer registers, browses by category” | **PASS** |
| Loading states and error handling | `frontend/src/components/ui/States.jsx:41`<br>`frontend/src/components/ui/States.jsx:9` | E2E `app.spec.js` “wrong password shows the inline error” | **PASS** |
| Persist login in localStorage | `frontend/src/context/AuthContext.jsx:21` | E2E `app.spec.js` “a session survives a refresh” | **PASS** |
| Send JWT with protected requests | `frontend/src/api/client.js:13` | smoke “no token → 401” | **PASS** |
| Protected routes and role-based navigation | `frontend/src/components/ProtectedRoute.jsx:17` | E2E `app.spec.js` “a customer visiting /owner pages is redirected” | **PASS** |
| Responsive (375 / 768 / 1280 px) | `frontend/src/styles/layout.css:13` | E2E `app.spec.js` “no horizontal scroll at” | **ADDED** |
| Suggested pages: Login/Registration, Restaurant Listing, Restaurant Menu, Cart/Checkout, Customer Dashboard, Owner Dashboard, Menu Management, Order Management, Delivery Partner Dashboard, AI Insights | `frontend/src/pages/auth/Login.jsx:18`<br>`frontend/src/pages/customer/Restaurants.jsx:13`<br>`frontend/src/pages/customer/RestaurantMenu.jsx:15`<br>`frontend/src/pages/customer/Cart.jsx:11`<br>`frontend/src/pages/customer/CustomerOrders.jsx:17`<br>`frontend/src/pages/owner/OwnerDashboard.jsx:13`<br>`frontend/src/pages/owner/MenuManagement.jsx:14`<br>`frontend/src/pages/owner/OwnerOrders.jsx:23`<br>`frontend/src/pages/delivery/DeliveryDashboard.jsx:16`<br>`frontend/src/pages/customer/AiInsights.jsx:17` | E2E `app.spec.js` “no horizontal scroll at” | **PASS** |

### §10 Database

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Tables: users, restaurants, menu items, orders, order items, reviews, payment ledger, admin reminder logs (+ categories) | `backend/app/models/__init__.py:53`<br>`backend/app/models/__init__.py:246`<br>`backend/app/models/__init__.py:281` | `alembic upgrade head` on Postgres; `alembic check`: no drift | **PASS** |
| Customer has many orders | `backend/app/models/__init__.py:65` | pytest `test_orders.py::test_filters_and_pagination` | **PASS** |
| Restaurant has many menu items and orders | `backend/app/models/__init__.py:117` | pytest `test_menu.py::test_owner_menu_crud_and_isolation` | **PASS** |
| Order has many order items | `backend/app/models/__init__.py:186` | pytest `test_orders.py::test_order_list_includes_item_preview_and_stays_scoped` | **PASS** |
| Each delivered order can have one review (unique) | `backend/app/models/__init__.py:228` | pytest `test_reviews_returns.py::test_review_only_after_delivery_once`<br>smoke “second review → 409” | **PASS** |
| Order has many payment ledger entries | `backend/app/models/__init__.py:189` | pytest `test_orders.py::test_cancel_rules_and_auto_refund` | **PASS** |
| Partner assigned to many orders | `backend/app/models/__init__.py:68` | pytest `test_orders.py::test_reassign_before_pickup` | **PASS** |
| Primary keys, foreign keys, relationships | `backend/app/models/__init__.py:159` | `alembic check`: no drift | **PASS** |
| SQL and ORM for CRUD | `backend/app/services/stats_service.py:50` | pytest `test_ai_stats_middleware.py::test_owner_stats_match_seeded_orders` | **PASS** |

### §11 Docker

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Dockerfile for the FastAPI backend | `backend/Dockerfile:2` | `docker compose up -d --build` → healthy | **PASS** |
| docker-compose.yml runs the backend | `docker-compose.yml:21` | fresh clone: `docker compose up -d --build` → healthy, seeded | **PASS** |
| Environment variables configured | `docker-compose.yml:25` | pytest `test_config.py::test_blank_values_use_defaults` | **FIXED** |
| Backend starts correctly in the container | `backend/docker-entrypoint.sh:5` | zero errors in `docker compose logs backend` | **PASS** |
| Backend port exposed | `docker-compose.yml:29` | smoke “API reachable and lists restaurants” | **PASS** |
| Backend connects to the SQL database | `docker-compose.yml:27` | pytest `test_owner_reminders_ai.py::test_health_returns_503_when_database_down` | **PASS** |
| Secrets outside the image and repo | `backend/.dockerignore:6`<br>`.gitignore:2` | `git ls-files | grep -E '\.env$'` empty; history scan shows placeholders only | **PASS** |
| .env.example with variable names, no values | `.env.example:20` | pytest `test_config.py::test_examples_list_every_setting_without_values` | **FIXED** |
| Runnable locally with Docker Compose | `README.md:141` | fresh-clone test following only the README | **PASS** |

### §12 API

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Registration and authentication | `backend/app/api/routers/auth.py:18` | pytest `test_auth.py::test_register_returns_token_and_signs_in` | **PASS** |
| Restaurant listing and menu management | `backend/app/api/routers/restaurants.py:91`<br>`backend/app/api/routers/owner.py:79` | pytest `test_catalogue.py::test_categories_with_counts` | **PASS** |
| Order placement | `backend/app/api/routers/orders.py:40` | smoke “customer places an order” | **PASS** |
| Order history and details | `backend/app/api/routers/orders.py:79` | pytest `test_orders.py::test_full_lifecycle` | **PASS** |
| Order status management | `backend/app/api/routers/orders.py:91` | pytest `test_lifecycle_matrix.py::test_every_invalid_generic_transition_is_400` | **PASS** |
| Delivery partner assignment | `backend/app/api/routers/orders.py:115` | pytest `test_orders.py::test_reassign_before_pickup` | **PASS** |
| Reviews and ratings | `backend/app/api/routers/orders.py:122`<br>`backend/app/api/routers/restaurants.py:212` | pytest `test_reviews_returns.py::test_review_only_after_delivery_once` | **PASS** |
| Return and refund management | `backend/app/api/routers/returns.py:36` | pytest `test_reviews_returns.py::test_return_flow_approve` | **PASS** |
| AI-powered order insights | `backend/app/api/routers/ai.py:23` | pytest `test_ai_stats_middleware.py::test_openai_errors_are_mapped` | **PASS** |
| Restaurant statistics and reminders | `backend/app/api/routers/owner.py:143`<br>`backend/app/api/routers/owner.py:149` | pytest `test_owner_reminders_ai.py::test_stats_are_computed_from_data` | **PASS** |
| Request validation (Pydantic, 422) | `backend/app/schemas/__init__.py:89` | pytest `test_auth.py::test_password_rules`<br>pytest `test_orders.py::test_unavailable_or_foreign_items_rejected` | **PASS** |
| Status codes 200/201/400/401/403/404/409/422/429/502/503 | `backend/app/services/order_service.py:74` | pytest `test_rbac_matrix.py::test_wrong_role_gets_403`<br>pytest `test_lifecycle_matrix.py::test_every_invalid_generic_transition_is_400`<br>pytest `test_ai_stats_middleware.py::test_openai_errors_are_mapped` | **FIXED** |
| All business rules and authorization enforced in the backend | `backend/app/services/order_service.py:190` | pytest `test_rbac_matrix.py::test_other_users_resources_are_404`<br>pytest `test_orders.py::test_client_cannot_set_price` | **PASS** |

### §13 Repository and documentation

| Requirement | Where implemented | How verified | Status |
|---|---|---|---|
| Complete React frontend and FastAPI backend source | `frontend/package.json:2`<br>`backend/requirements.txt:1` | fresh clone builds and runs | **PASS** |
| Dockerfile, docker-compose.yml, .env.example files | `backend/Dockerfile:2`<br>`frontend/.env.example:5` | fresh-clone test | **PASS** |
| README: overview, technologies, features | `README.md:30`<br>`README.md:42` | manual review | **PASS** |
| README: run frontend locally; backend with Docker Compose | `README.md:138`<br>`README.md:155` | fresh clone followed only these steps | **FIXED** |
| README: environment variables; database setup | `README.md:222`<br>`README.md:261` | pytest `test_config.py::test_examples_list_every_setting_without_values` | **FIXED** |
| README: API documentation (/docs + endpoint table) | `README.md:285`<br>`README.md:331` | manual review; table matches the OpenAPI routes (RBAC matrix test) | **PASS** |
| No secrets committed | `.gitignore:2` | secret scan of tracked files and full git history | **PASS** |

## 2. Bugs found and fixed

| # | Bug | Fix | Commit |
|---|---|---|---|
| 1 | Business-rule violations returned **409** instead of **400**: invalid status transitions, cancelling after `PLACED` (including delivered orders), assigning a rider before `READY`, and reviewing or returning an undelivered order (SPEC §4, §12). | Added `_bad_request` (400) in `order_service.py` for rule violations. Kept 409 for real conflicts (duplicate email, second review or return, closed restaurant, sold-out dish, already-resolved return). The README status-code table was updated to match. | `dc4b964` |
| 2 | The middleware sent `X-Process-Time-Ms` rather than `X-Process-Time`, and set no timing header on 500 responses (SPEC §8). | Every response, including the 500 handler, now sets `X-Process-Time` (milliseconds); CORS exposes it. | `dc4b964` |
| 3 | `POST /ai/insights` silently ignored unknown fields, so a client could send `customer_id` and get no error (SPEC §7: no client-supplied ids). | `AIInsightRequest` uses `extra="forbid"`, so unknown fields return 422. The scope was always the authenticated user; this makes the rule explicit and tested. | `dc4b964` |
| 4 | `.env.example` files were missing 8 backend settings (`APP_NAME`, `JWT_ALGORITHM`, `BCRYPT_ROUNDS`, `DELIVERY_FEE`, `TAX_RATE`, `OPENAI_TIMEOUT_SECONDS`, `OPENAI_MAX_OUTPUT_TOKENS`, `AI_CONTEXT_MAX_ORDERS`) and contained values. A blank value copied from an example (e.g. `ACCESS_TOKEN_EXPIRE_MINUTES=`) would have crashed startup (SPEC §11). | All three example files list every variable with an empty value and the default in a comment. `env_ignore_empty=True` makes blanks fall back to defaults. `tests/test_config.py` checks both. | `e8fa1c6` |
| 5 | The order-detail polling effect depended on `order.setData` through a member access (React hooks warning, risk of a stale closure). | It uses the stable `setData` callback directly. | `cf25cac` |
| 6 | Ten `raise` statements inside `except` blocks dropped the original exception (deps, auth, orders, config, AI, order service). | `raise … from None` for user-facing HTTP errors; `raise … from exc` for OpenAI errors so the cause stays in the logs. | `cf25cac` |
| 7 | Lint wasn't reproducible: the repo had no ruff, ESLint or knip config, and ruff picked up a user-level config from outside the repo. 20 JSX texts had unescaped quotes. | Added `backend/ruff.toml`, `frontend/eslint.config.js` and `frontend/knip.json`, with the tools as dev dependencies. Fixed every finding. | `cf25cac` |
| 8 | The E2E script imported `playwright-core`, which wasn't a declared dependency, and was a hand-rolled runner (one intermittent miss on the rider-history step in an earlier run). | Replaced with a `@playwright/test` suite using web-first assertions (auto-waiting), runnable as `npx playwright test`. | `b79eb81` |

No business rule was removed or weakened, and no test was skipped.

## 3. Test results (final run)

| Suite | Command | Result |
|---|---|---|
| Backend (pytest, SQLite, OpenAI mocked) | `cd backend && pytest -q` | **164 passed**, 0 failed |
| API smoke test (live Docker stack) | `python3 scripts/smoke_test.py` | **42 / 42 steps PASS** |
| Browser E2E (Playwright, Chrome) | `cd frontend && npx playwright test` | **19 passed**, 0 failed |
| Backend lint | `cd backend && ruff check .` | 0 problems |
| Frontend lint / dead code | `npx eslint .` · `npx knip` | 0 problems · no unused files, exports or dependencies |
| Frontend build | `npm ci && npm run build` | 0 errors, 0 warnings |
| Docker | `docker compose down -v && docker compose up -d --build` | backend and db healthy, 0 errors in backend logs; `seed.py --reset` → 45 restaurants, 9 categories, 1000 menu items |
| Fresh clone | clone → follow README only | stack healthy and seeded; pytest 164, smoke 42/42 and Playwright 19 all green from the clone |

Backend coverage highlights:
- An **RBAC matrix** of all 40 endpoints × 3 roles, built from the OpenAPI schema, so a new endpoint fails the test until it's classified.
- **Every invalid transition from all 9 statuses**.
- Owner **stats checked against the seeded orders**.
- **Customer A's data never in customer B's AI prompt**.

Security checks:
- `git ls-files | grep -E "\.env$"` is empty.
- `git log -p` contains only placeholder secrets (`sk-test`, `<any strong password>`, empty values).
- The real local `JWT_SECRET_KEY` and `POSTGRES_PASSWORD` were checked against the full history and appear nowhere.
- `.gitignore` covers `.env`, `node_modules`, `__pycache__`, `.venv`/`venv`, `dist`, `uploads`, the Playwright output and the ruff cache.

## 4. Known limitations

- **Demo photos are unavailable right now.** The seed data hotlinks images from `loremflickr.com`, which has returned HTTP 500 for every image URL since 2026-11-14 (checked repeatedly, all URL forms). The UI handles it: every card and dish shows the brand placeholder art. But each failed `<img>` load is logged by the browser as a console error that the app can't suppress. The app itself logs no errors or warnings, and the E2E suite fails on any console error except failed loads from that host. Fixing this means changing image hosts in `seed_data_lucknow.json`, which is a data decision for the project owner.
- **AI answers weren't tested against the live OpenAI API**, because no key is configured here. Every AI path (context building, scoping, the four example queries, error and rate-limit mapping) is tested with a mocked client. Without a key the endpoint returns a clear 503.
- **Rate limiters are in-process.** The login (10 per 10 minutes per IP + email) and AI limits reset when the backend restarts and aren't shared between instances. That's fine for one container; multiple instances would need Redis.
- **Repeated E2E runs** log each demo account in at most twice per run, well under the login limit. Running the suite more than about four times within 10 minutes can still return 429 until the window passes.
- **Submission:** SPEC "Submission Guidelines" require a public GitHub repository. The repo is ready (no secrets, README verified by a fresh clone) but hasn't been pushed; that needs the project owner's go-ahead.

