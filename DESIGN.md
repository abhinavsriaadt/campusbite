# CampusBite — Design Brief (for Claude Code)

Put this file at the repo root and reference it from CLAUDE.md:
"All frontend work must follow DESIGN.md. Use the tokens in src/styles/tokens.css; never hard-code colors, spacing or font sizes."

> **Precedence:** the capstone requirements (README / problem statement) always win over this file.
> Where a design item has no backing data or would change business rules, the real data is shown
> instead — see "Deviations from the design brief" at the end.

---

## 1. What makes the best delivery apps feel good (and what we take from each)

| Lesson | Where it comes from | How CampusBite applies it |
|---|---|---|
| Food sells itself, so the photos come first | Zomato | Big 16:10 dish/restaurant images, rounded corners, a subtle gradient at the bottom so text stays readable |
| Restraint: one brand color, lots of neutral space | Uber | Neutrals cover ~90% of the screen, the brand color is used only for primary actions and the active state, and there's never more than one primary button per view |
| Orders sorted so you never hunt | Blinkit | Orders grouped by **Active / Past**, then by date ("Today", "Yesterday", "12 Nov"), with status chips and a sticky "live order" card on top |
| Always know what's next | All three | Every order shows a progress stepper and a single next action ("Accept", "Mark Ready", "Out for delivery") |
| Speed you can feel | All three | Skeleton loaders instead of spinners, optimistic UI on cart actions, toasts for confirmations |

The look and logo are our own. Don't copy any brand's logo, exact colors, or illustrations.

---

## 2. Design tokens — create `src/styles/tokens.css`

```css
:root {
  /* Brand */
  --brand-500: #E8492F;   /* "Chili" — primary actions, active tab, cart badge */
  --brand-600: #C93A22;   /* hover / pressed */
  --brand-50:  #FDEEEA;   /* tinted backgrounds, selected chips */

  /* Neutrals (warm) */
  --ink-900: #1B1B1F;     /* headings */
  --ink-700: #3A3A42;     /* body text */
  --ink-500: #6B6B76;     /* secondary text, captions */
  --ink-300: #B9B8BF;     /* placeholders, disabled */
  --line:    #E7E5E0;     /* borders, dividers */
  --bg:      #F7F6F3;     /* page background (warm off-white) */
  --surface: #FFFFFF;     /* cards, modals */

  --brand-text: #C93A22;  /* brand-colored text/links (passes contrast) */
  --on-brand:   #FFFFFF;  /* text on brand fill */

  /* Semantic: base (icons, borders) / -50 (chip bg) / -text (chip text) */
  --success: #1E9E5A;  --success-50: #E6F5EC;  --success-text: #14693C;
  --warning: #D98E04;  --warning-50: #FDF3DC;  --warning-text: #8A5A00;
  --danger:  #D92D3A;  --danger-50:  #FCE8EA;  --danger-text:  #A11F2A;
  --info:    #2F6FEB;  --info-50:    #E8EFFD;  --info-text:    #1F4FB0;
  --neutral-50: #EDECE9; --neutral-text: #3A3A42;
  --veg:     #1E9E5A;  --nonveg:     #B3261E;

  /* Elevation extras (used mainly by dark mode) */
  --surface-2: #FFFFFF;   /* modals, sheets, dropdowns */
  --overlay: rgba(27,27,31,.45);
  --img-dim: 1;           /* image brightness multiplier */

  /* Type — Google Font "Plus Jakarta Sans" (400/500/600/700) */
  --font: "Plus Jakarta Sans", system-ui, -apple-system, Segoe UI, sans-serif;
  --fs-xs: 12px; --fs-sm: 14px; --fs-md: 16px; --fs-lg: 18px;
  --fs-xl: 22px; --fs-2xl: 28px; --fs-3xl: 36px;
  --lh-tight: 1.2; --lh-body: 1.5;

  /* Spacing (4px grid) */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px;
  --s-5: 24px; --s-6: 32px; --s-7: 48px; --s-8: 64px;

  /* Shape & depth */
  --r-sm: 8px; --r-md: 12px; --r-lg: 16px; --r-pill: 999px;
  --shadow-1: 0 1px 2px rgba(27,27,31,.06), 0 1px 3px rgba(27,27,31,.08);
  --shadow-2: 0 4px 12px rgba(27,27,31,.08);
  --shadow-3: 0 12px 32px rgba(27,27,31,.14);

  /* Motion */
  --ease: cubic-bezier(.2,.8,.2,1);
  --t-fast: 120ms; --t-base: 200ms; --t-slow: 320ms;
}
```

### Dark mode — add to the same `tokens.css`

Goal: a warm, deep "night kitchen" look. It shouldn't be pure black or a simple color inversion. Food photos glow against charcoal, and the chili red reads like a lit sign.

```css
[data-theme="dark"] {
  color-scheme: dark;                 /* native scrollbars, inputs, date pickers */

  /* Brand — fill stays rich; text variant is lifted for contrast */
  --brand-500: #EE5235;  --brand-600: #FF6A4D;  --brand-50: #3A1D17;
  --brand-text: #FF8A6E;  --on-brand: #FFFFFF;

  /* Warm charcoal neutrals (never #000) */
  --bg:        #121113;   /* page */
  --surface:   #1B1A1D;   /* cards */
  --surface-2: #242327;   /* modals, sheets, dropdowns, hovered cards */
  --line:      #2F2D32;
  --ink-900:   #F5F3EF;   /* headings (warm off-white, not #FFF) */
  --ink-700:   #D9D6D0;   /* body */
  --ink-500:   #A3A0A8;   /* secondary */
  --ink-300:   #6C6A72;   /* placeholders, disabled */

  /* Semantic: desaturated-bright text on deep tinted chips */
  --success: #3CC47C;  --success-50: #12301F;  --success-text: #6FE0A3;
  --warning: #F0B23A;  --warning-50: #33270D;  --warning-text: #FFCF6E;
  --danger:  #FF5C66;  --danger-50:  #3A1518;  --danger-text:  #FF8F96;
  --info:    #5B8EF5;  --info-50:    #16233F;  --info-text:    #93B6FF;
  --neutral-50: #2A292D; --neutral-text: #C9C6C0;
  --veg: #3CC47C;  --nonveg: #FF5C66;

  /* Depth in dark = lighter surface + hairline, not big shadows */
  --shadow-1: 0 0 0 1px var(--line);
  --shadow-2: 0 0 0 1px var(--line), 0 6px 16px rgba(0,0,0,.45);
  --shadow-3: 0 0 0 1px var(--line), 0 16px 40px rgba(0,0,0,.6);
  --overlay: rgba(0,0,0,.6);
  --img-dim: .9;
}
```

**How it works**
- A `ThemeContext` stores `"light" | "dark" | "system"` in localStorage under `cb_theme`.
  - It sets `document.documentElement.dataset.theme` and resolves `"system"` with `matchMedia('(prefers-color-scheme: dark)')`.
  - In `"system"` mode it also listens for changes, so the app follows the OS live.
- An inline script in `index.html` sets the theme **before React mounts**, so the page never flashes white on load.
- The toggle is a sun/moon icon button in the navbar, with a 3-way Light / Dark / System choice in the avatar menu.
- Set `<meta name="theme-color">` to the current `--bg` on toggle, so the mobile browser bar matches.
- Add `transition: background-color var(--t-base), color var(--t-base), border-color var(--t-base)` on `body` and cards only. Never use `transition: all`, which makes the whole page lag.

**Make dark mode look great, not just inverted**
- **Elevation:** the page uses `--bg`, cards use `--surface`, and modals, sheets, dropdowns and hovered cards use `--surface-2`. The higher an element sits, the lighter it is. Shadows in dark mode are mostly a 1px hairline.
- **Images:** `img { filter: brightness(var(--img-dim)); }`. On hover, the RestaurantCard image returns to brightness 1 and scales to 1.03, which makes the food "light up". The bottom gradient on images fades into `rgba(18,17,19,.85)`.
- **Brand color:** filled buttons use `--brand-500` with `--on-brand` text. Brand-colored *text* (links, prices on the cart bar, active nav labels) uses `--brand-text`, never `--brand-500`, which is too dim on charcoal.
- **Status chips:** the background is `--{role}-50` and the text is `--{role}-text`, in both themes. This is the single rule that makes chips readable everywhere.
- **Kanban board:** columns use `--bg` with a `--line` border, and cards use `--surface`. A stale order (older than 15 minutes) gets a 3px `--warning` left border plus a faint `--warning-50` background.
- **StickyCartBar:** in dark mode, add `box-shadow: 0 -8px 24px rgba(0,0,0,.5)` so it lifts off the content.
- **Inputs:** background `--surface-2`, border `--line`. On focus, the border becomes `--brand-500` with a `0 0 0 3px var(--brand-50)` ring.
- **Skeleton shimmer:** a gradient from `--surface` to `--surface-2` to `--surface`, never grey on black.
- **Veg/non-veg marks:** use the brighter `--veg`/`--nonveg` values with a 1.5px border, so they don't disappear.
- **Empty-state and illustration icons:** use `--ink-500`, never pure white.
- **Charts and stat bars (owner stats):** use `--brand-500`, `--info`, `--success` and `--warning` on `--surface`, with `--line` gridlines.
- **Placeholder for missing images:** a `--brand-50` block with a `--brand-text` cuisine icon.

**Dark-mode QA (run on every page)**
- [ ] `grep -rnE "#[0-9a-fA-F]{3,6}|rgb\(" src --include=*.jsx --include=*.css` finds no colors outside `tokens.css`.
- [ ] Body text has at least 4.5:1 contrast, and chips, secondary text and placeholders are readable.
- [ ] No pure `#000` backgrounds and no pure `#FFF` text.
- [ ] Modals, dropdowns and bottom sheets are visibly lighter than the page behind them.
- [ ] Focus rings are visible on dark backgrounds.
- [ ] Native date pickers and selects render dark (because of `color-scheme`).
- [ ] Reloading in dark mode doesn't flash white.
- [ ] The toggle works on the auth pages too, before login.

**Rules:**
- Prices and numbers use `font-variant-numeric: tabular-nums` and the ₹ prefix.
- Headings are 700 weight with letter-spacing -0.01em. Body text is 400 or 500.
- The max content width is 1200px. Mobile gutters are 16px and desktop gutters are 24px.
- Respect `prefers-reduced-motion`.

### Order status → color (single source: `src/utils/status.js`)

| Status | Chip color | Label shown to users |
|---|---|---|
| PLACED | info | Order placed |
| ACCEPTED | info | Accepted |
| PREPARING | warning | Being prepared |
| READY | warning | Ready for pickup |
| ASSIGNED | brand | Rider assigned |
| OUT_FOR_DELIVERY | brand | On the way |
| DELIVERED | success | Delivered |
| CANCELLED | neutral | Cancelled |
| REFUNDED | neutral | Refunded |

Payment chips are `mock_paid` → "Paid" (success) and `refunded` → "Refunded" (grey). Return chips are requested → warning, approved → success, rejected → danger.

---

## 3. Components (build once in `src/components/ui/`, reuse everywhere)

- **Button:** primary (brand fill), secondary (white, line border), ghost, and danger. Height is 44px on mobile and 40px on desktop. Each has loading (inline spinner, disabled) and disabled states. Only one primary button per view.
- **Input / Select / Textarea:** label above the field, 12px radius, brand-colored focus ring `0 0 0 3px var(--brand-50)`, error text below in danger.
- **Chip / StatusBadge:** pill shape, 12px semibold text, background `--{role}-50`, text `--{role}-text`. Brand chips use `--brand-50` with `--brand-text`, and grey chips use `--neutral-50` with `--neutral-text`.
- **Card:** surface background, `--r-lg` radius, `--shadow-1` shadow. On hover (desktop only) it rises to `--shadow-2` with `translateY(-2px)`, and in dark mode the background also shifts to `--surface-2`.
- **RestaurantCard:**
  - Image at 16:10 with a bottom gradient.
  - Name in 600 weight, then a cuisine line in ink-500.
  - Row: ★ rating chip (green when ≥ 4) · "₹ for two" · an "Open"/"Closed" dot.
  - Closed restaurants appear greyscaled at 60% opacity.
- **DishCard:**
  - Layout is text on the left and a 96px image on the right, list-style like a menu.
  - The text side has a veg/non-veg square icon, the name, the price, and a 2-line clamped description.
  - The **ADD** button overlaps the bottom of the image. Once the dish is in the cart it becomes a stepper `– 1 +`.
  - Unavailable dishes are greyed out with a "Currently unavailable" label.
- **StickyCartBar** (customer, mobile and desktop): when the cart isn't empty, a bar is fixed to the bottom: "2 items · ₹480 | View cart →" in brand color. It slides up when it appears.
- **OrderStepper:** horizontal on desktop, vertical on mobile. Steps are Placed → Accepted → Preparing → Ready → On the way → Delivered. Completed steps get a filled dot, the current step pulses, and each step shows its timestamp when available.
- **Skeleton:** shimmer blocks shaped like the card they replace. Use them for every list load.
- **EmptyState:** a simple line icon, one sentence, and one action, e.g. "No orders yet. Browse restaurants →".
- **Toast:** bottom-center on mobile, top-right on desktop. Auto-dismisses after 3 seconds. Success, error, and info variants.
- **Modal / BottomSheet:** uses `--surface-2` over a `--overlay` backdrop. It's a centered modal on desktop and a bottom sheet on mobile (<640px). Used for writing a review (5 tappable stars), giving a return reason, and assigning a rider.
- **FilterBar:** horizontally scrollable chips (status), a date-range picker, and a "Clear" ghost button. Active filters show as brand-50 chips.
- **Pagination:** "Load more" on mobile, numbered pages on desktop.
- **StatCard:** label in ink-500, a big number in 2xl, and an optional delta.

---

## 4. Page-by-page layouts

### Customer
- **Home / restaurant listing:**
  - Hero strip with a greeting ("Hungry, Abhinav?") and a large search field with rounded-pill styling.
  - Cuisine chips row, scrollable horizontally.
  - Responsive grid of RestaurantCards: `repeat(auto-fill, minmax(260px, 1fr))`.
  - Skeletons while loading.
- **Restaurant menu:**
  - Banner image header with the name, rating, cuisine, and address.
  - Sticky sub-header with dish search and a price range filter ("Under ₹150 / ₹150–300 / ₹300+" chips, plus min/max inputs).
  - Dishes are grouped by category with sticky category headers.
  - StickyCartBar at the bottom.
- **Cart & checkout:**
  - Single column. Items with steppers, then a bill summary (item total, delivery fee ₹0 "Free on campus", total), then address and phone fields, then the primary button "Pay ₹480 (mock)".
  - After payment, show a success screen with a check animation and a "Track order" button.
- **My orders (Blinkit-style sorting):**
  - Tabs: **Active** | **Past**.
  - In Active, a live order card sits on top with an OrderStepper and ETA text.
  - Past orders are grouped by date heading. Each row shows the restaurant thumbnail, the item summary ("Paneer Tikka ×2, Naan ×3"), the total, and status, payment, and return chips.
  - Row actions depend on status: Cancel (PLACED only), Rate (DELIVERED with no review), Request refund (DELIVERED with no return yet), and Reorder.
- **AI insights:** a chat-style page.
  - Four suggestion chips at the top: "Summarize my last 5 orders", "What's not delivered yet?", "How much did I spend this week?", "What do I order most?".
  - Answers appear in cards, with a typing-dots loader and a small "Based on your last N orders" caption.

### Restaurant owner
- **Dashboard:**
  - Row of 4 StatCards: Orders today, Revenue, Avg rating, Pending returns.
  - A **Reminders** panel in a warning-50 card listing "Order #42 waiting 23 min", each with a "View" action.
  - A "Recent orders" table.
- **Order board (the standout screen):** a **Kanban board** with columns New (PLACED) → Accepted → Preparing → Ready → Out (assigned/out for delivery).
  - Each card shows the order #, time since it was placed, the items, the total, and **one primary next-action button**.
  - Ready cards have an "Assign rider" button that opens a select sheet.
  - Cards older than 15 minutes in New or Accepted get a warning left border.
  - On mobile the columns become tabs with counts.
  - A table view toggle offers status and date filters plus pagination.
- **Menu management:**
  - Table/list of dishes with a thumbnail, name, price, category, and an **availability toggle switch** (optimistic).
  - "Add dish" opens a side drawer form.
- **Returns:** a list of requests with the customer's reason quoted in a grey box and Approve (success) / Reject (danger outline) buttons, each behind a confirm step.

### Delivery partner (mobile-first; assume they're on a phone outside)
- Large type, 48px tap targets, and high contrast.
- **Assigned deliveries:** cards showing the restaurant → customer, the customer's name, a **tap-to-call phone link** (`tel:`), the address, and the order total.
  - One full-width primary button whose label is the next step: "Picked up · Start delivery" → "Mark delivered".
  - "Mark delivered" asks for confirmation.
- **History:** grouped by date, with a daily count at the top ("Today: 6 deliveries").

### Auth
- Split layout on desktop: a food image panel on the left and the form on the right. On mobile only the form is shown.
- On the register page, the role is chosen with 3 selectable cards (Customer / Restaurant owner / Delivery partner), each with an icon. The owner card reveals the restaurant fields.
- After login, users are redirected to their role's home.

---

## 5. Navigation
- **Customer:** top navbar on desktop (logo, search, Orders, AI Insights, cart icon with a count badge, avatar menu). On mobile, a **bottom tab bar** with Home, Orders, Insights, and Cart.
- **Owner:** a left sidebar on desktop (Dashboard, Orders, Menu, Returns) that collapses to a bottom tab bar on mobile.
- **Partner:** a bottom tab bar on mobile (Deliveries, History).
- The active item uses brand color plus a 2px indicator. No other color is used for navigation.

---

## 6. Microinteractions (small things that make it feel premium)
- Pressing ADD briefly scales the button (`scale(.96)`) and makes the cart badge bounce once.
- The availability toggle and status changes update instantly (optimistic) and roll back with an error toast if the API fails.
- Status changes on cards fade and slide into their new Kanban column (200ms).
- Image loading: fade in from a `--bg` placeholder and always reserve the aspect ratio, so there's no layout shift.
- Destructive or irreversible actions (cancel order, approve refund, mark delivered) always confirm first.
- Every async button shows a loading state and can't be double-clicked.

---

## 7. Usability & accessibility checklist
- [ ] Text contrast ≥ 4.5:1 **in both themes**. Chip text always uses `--{role}-text`, never the base color or the -50 tint.
- [ ] Visible focus ring on every interactive element. The whole app works with the keyboard.
- [ ] Tap targets ≥ 44px, or 48px for the partner screens.
- [ ] Every list has loading (skeleton), empty, and error (with Retry) states.
- [ ] Form errors appear inline below the field, in plain language ("Price must be more than ₹0").
- [ ] No color-only meaning: status chips always include a text label, and veg/non-veg has a shape plus a label for screen readers.
- [ ] Works at 375px width, 768px, and 1280px+.
- [ ] Images have `alt` text, and icons-only buttons have `aria-label`.

---

## 8. Prompt to give Claude Code

> Read DESIGN.md. First create `src/styles/tokens.css`, a global reset, and the components in section 3 under `src/components/ui/`, plus a `/styleguide` dev route that renders every component and state. Then restyle pages in this order: auth → customer home → menu + StickyCartBar → cart/checkout → My orders (Active/Past grouping) → owner dashboard → owner Kanban order board → menu management → returns → partner screens → AI insights. Use only tokens, no hard-coded values. Implement dark mode (section 2) together with the tokens, not at the end, and build the theme toggle in the first step. After each page, check it at 375px and 1280px **in both light and dark**, and fix any overflow or contrast issues. Finish by running the dark-mode QA list. Don't change API calls or business logic. Build the email OTP login (section 10) as a separate step, only after the core features work.

## 9. Content-agnostic layouts (more restaurants later)
- Never hard-code restaurant names, cuisines, or categories in the UI. Derive cuisine chips from `GET /restaurants` data, and build menu category sections from the items' `category` values.
- Cards must handle long names (2-line clamp), missing images (show a brand-50 placeholder with a cuisine icon), and 0 reviews ("New" chip instead of a rating).
- Lists always paginate, and search runs on the server, so 9 restaurants or 500 use the same layout.

Images: seed data uses the `image_url` values in `backend/seed_data.json`.

## 10. Email OTP login (extra login method, keeps password login)
- **UI:** the login card has two tabs, **Password** | **Email OTP**.
  - Step 1: an email field and a "Send code" button.
  - Step 2: a 6-box code input with auto-advance, paste support for the full code, `inputMode="numeric"` and `autocomplete="one-time-code"`.
  - Below the boxes: a "Resend in 0:59" countdown, a "Check your spam folder" hint, and a "Change email" link.
  - In both themes the boxes use the input styles, and the filled boxes get a `--brand-500` border.
- **API:** `POST /auth/otp/request {email}` always returns 200 with the same message, so it doesn't reveal which emails are registered. `POST /auth/otp/verify {email, code}` returns the same response as `/auth/login`.
- **Backend rules:**
  - Generate the code with `secrets.randbelow(10**6)` as 6 digits, and store only its SHA-256 hash in `otp_codes`.
  - Codes expire after 5 minutes, allow at most 5 attempts, and can be used only once.
  - Allow one resend per 60 seconds per email.
  - Send the email in a FastAPI `BackgroundTasks` task.
- **Delivery:** with `OTP_DELIVERY=console` the code is printed to the Docker logs (for demos and evaluators). With `OTP_DELIVERY=email`, it's sent through Gmail SMTP with an App Password (`SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASSWORD`).
- **Email template:** simple HTML with the CampusBite wordmark, the code in large monospace text, "Expires in 5 minutes", and a plain-text fallback.

---

## Deviations from the design brief (capstone requirements take precedence)

| Design item | Why it differs | What is shown instead |
|---|---|---|
| Delivery fee "₹0 Free on campus" | Totals are computed server-side (`DELIVERY_FEE`); showing ₹0 would misstate the bill | The server's real fee; it reads "Free on campus" only when the fee is 0 |
| "₹ for two" on restaurant cards | No such data exists | The real rating count |
| ETA on the live order card | No ETA data exists | "Updated N min ago" from the real status timestamp |
| My Orders = Active/Past tabs only | Brief requires filtering by status **and date** | Tabs plus the status/date FilterBar |
| Partner screens without filters | Brief requires filtering deliveries by status | Status FilterBar kept |
| Filled buttons use `--brand-500` | §7 requires ≥ 4.5:1, but white on `--brand-500` is 3.87:1 (light) and 3.56:1 (dark) | All §2 values are unchanged. Fills use an added `--brand-fill` (#C93A22, 5.11:1) in both themes, plus `--success-fill` / `--danger-fill` for solid success/danger buttons, because the dark `-text` shades are too light to carry white text. `--brand-500` stays for indicators, focus, borders and charts |
| Skeleton shimmer `--surface → --surface-2 → --surface` (dark) | A skeleton inside a card would have the same colour as the card, so it would be invisible | Skeleton blocks are `--surface-2` with a `--line` shimmer in dark mode |
| Seed images from `backend/seed_data.json` | Seed data lives in `backend/app/seed.py` | `RESTAURANT_IMAGES` / `DISH_IMAGES` in `seed.py`: Unsplash photos, each checked by eye |
| Placeholders use `--ink-300` | `--ink-300` on an input is 1.97:1 (light), which fails §2's QA check that placeholders are readable | Placeholders use `--ink-500` (≥ 4.5:1); `--ink-300` stays for disabled states and decorative marks |
| Chips / small buttons 36px | §7 requires tap targets ≥ 44px | Added `--control-sm`: 44px on touch-sized screens, 36px from 768px up; delivery-partner screens use 48px for every control |
| §10 Email OTP login | §8 says to build it as a separate step after the core features, and it changes auth | Not built yet; password login only |
