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

  /* Semantic */
  --success: #1E9E5A;  --success-50: #E6F5EC;
  --warning: #D98E04;  --warning-50: #FDF3DC;
  --danger:  #D92D3A;  --danger-50:  #FCE8EA;
  --info:    #2F6FEB;  --info-50:    #E8EFFD;
  --veg:     #1E9E5A;  --nonveg:     #B3261E;

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
| CANCELLED | ink-500 (grey) | Cancelled |
| REFUNDED | ink-500 (grey) | Refunded |

Payment chips are `mock_paid` → "Paid" (success) and `refunded` → "Refunded" (grey). Return chips are requested → warning, approved → success, rejected → danger.

---

## 3. Components (build once in `src/components/ui/`, reuse everywhere)

- **Button:** primary (brand fill), secondary (white, line border), ghost, and danger. Height is 44px on mobile and 40px on desktop. Each has loading (inline spinner, disabled) and disabled states. Only one primary button per view.
- **Input / Select / Textarea:** label above the field, 12px radius, brand-colored focus ring `0 0 0 3px var(--brand-50)`, error text below in danger.
- **Chip / StatusBadge:** pill shape, 12px semibold text, tinted background with the strong text color from the semantic pair.
- **Card:** surface background, `--r-lg` radius, `--shadow-1` shadow, raised to `--shadow-2` with `translateY(-2px)` on hover (desktop only).
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
- **Modal / BottomSheet:** a centered modal on desktop and a bottom sheet on mobile (<640px). Used for writing a review (5 tappable stars), giving a return reason, and assigning a rider.
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
- [ ] Text contrast ≥ 4.5:1. Chip text always uses the strong color, never the -50 tint.
- [ ] Visible focus ring on every interactive element. The whole app works with the keyboard.
- [ ] Tap targets ≥ 44px, or 48px for the partner screens.
- [ ] Every list has loading (skeleton), empty, and error (with Retry) states.
- [ ] Form errors appear inline below the field, in plain language ("Price must be more than ₹0").
- [ ] No color-only meaning: status chips always include a text label, and veg/non-veg has a shape plus a label for screen readers.
- [ ] Works at 375px width, 768px, and 1280px+.
- [ ] Images have `alt` text, and icons-only buttons have `aria-label`.

---

## 8. Prompt to give Claude Code

> Read DESIGN.md. First create `src/styles/tokens.css`, a global reset, and the components in section 3 under `src/components/ui/`, plus a `/styleguide` dev route that renders every component and state. Then restyle pages in this order: auth → customer home → menu + StickyCartBar → cart/checkout → My orders (Active/Past grouping) → owner dashboard → owner Kanban order board → menu management → returns → partner screens → AI insights. Use only tokens, no hard-coded values. After each page, check it at 375px and 1280px and fix any overflow. Don't change API calls or business logic.

Images: for seed data, use free Unsplash image URLs for food and restaurants, stored in `image_url` columns.

---

## Deviations from the design brief (capstone requirements take precedence)

| Design item | Why it differs | What is shown instead |
|---|---|---|
| Delivery fee "₹0 Free on campus" | Totals are computed server-side (`DELIVERY_FEE`); showing ₹0 would misstate the bill | The server's real fee; it reads "Free" only when the fee is 0 |
| "₹ for two" on restaurant cards | No such data exists | The real rating count |
| ETA on the live order card | No ETA data exists | "Updated N min ago" from the real status timestamp |
| My Orders = Active/Past tabs only | Brief requires filtering by status **and date** | Tabs plus the status/date FilterBar |
| Partner screens without filters | Brief requires filtering deliveries by status | Status FilterBar kept |
| Light-only tokens | Existing automatic dark mode is preserved | Same token names, dark values under `prefers-color-scheme: dark` |
| Chip text uses the semantic colour; primary buttons are brand-500 | §7 requires text contrast ≥ 4.5:1, but these pairs measure 2.4–4.1:1 (e.g. white on brand-500 = 3.87, warning on warning-50 = 2.43) | §2 values are unchanged. Text uses added `--*-ink` shades (all ≥ 5.7:1) and primary buttons fill with `--brand-600` (5.11:1); brand-500 stays for indicators and accents |
