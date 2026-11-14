import { useState } from "react";
import {
  Logo, LogoMonoWhite,
  Alert, Badge, Button, Card, CardHead, Chip, ConfirmDialog, DishCard, DishSkeleton, EmptyState, ErrorState, Field, FilterBar, Icon,
  ListSkeleton, Modal, OrderStepper, Pagination, PaymentBadge, QtyStepper, RatingChip, RestaurantCard, RestaurantCardSkeleton,
  ReturnBadge, Spinner, StarInput, Stars, StatCard, StatusBadge, Switch, Tabs, ThemeChoice, ThemeToggle, VegMark,
} from "../components/ui";
import { catalogApi, menuDishes } from "../api/endpoints";
import { useToast } from "../context/ToastContext";
import { useAsync } from "../hooks/useAsync";
import { ALL_STATUSES } from "../utils/status";

/** Dev-only catalogue of every UI component and state (DESIGN.md §8). Not routed in production builds. */
const now = Date.now();
const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const HISTORY = ["PLACED", "ACCEPTED", "PREPARING"].map((s, i) => ({ id: i, to_status: s, created_at: iso(40 - i * 10) }));

const Section = ({ title, children }) => (
  <section className="sg__section"><h2>{title}</h2><div className="sg__body">{children}</div></section>
);

export default function Styleguide() {
  const toast = useToast();
  const [qty, setQty] = useState(1);
  const [on, setOn] = useState(true);
  const [stars, setStars] = useState(4);
  const [tab, setTab] = useState("a");
  const [modal, setModal] = useState(null);
  const [filters, setFilters] = useState({ status: "", date_from: "", date_to: "" });
  // Cards render a real restaurant and dish from the API (no mock names or prices).
  const sample = useAsync(async () => {
    const list = await catalogApi.restaurants({ page_size: 1 });
    const r = list.items[0];
    const menu = r ? await catalogApi.menu(r.id) : null;
    return { r, total: list.total, dishes: menuDishes(menu), menuTotal: menu?.total ?? 0 };
  }, []);
  const r = sample.data?.r;
  const dish = sample.data?.dishes[0];

  return (
    <div className="sg">
      <div className="page-head"><div><h1>Styleguide</h1><p>Every component and state, built from tokens. Dev-only route.</p></div></div>

      <Section title="Theme">
        <div className="row"><ThemeToggle /><div className="sg__theme"><ThemeChoice /></div></div>
        <p className="text-sm muted">Stored in localStorage as <code>cb_theme</code>. "System" follows the OS setting live.</p>
      </Section>

      <Section title="Brand">
        <div className="sg-brand">
          {["light", "dark"].map((t) => (
            <div key={t} className="sg-brand__panel" data-theme={t}>
              <p className="text-xs muted">{t} theme</p>
              <div className="row"><Logo theme={t} height={40} /><span className="text-xs muted">full · 40px (auth)</span></div>
              <div className="row"><Logo theme={t} height={28} /><span className="text-xs muted">full · 28px (navbar ≥ 640px)</span></div>
              <div className="row">
                <Logo theme={t} variant="mark" height={56} /><Logo theme={t} variant="mark" height={32} /><Logo theme={t} variant="mark" height={16} />
                <span className="text-xs muted">mark · 56 / 32 / 16px</span>
              </div>
            </div>
          ))}
          <div className="sg-brand__panel sg-brand__panel--brand">
            <LogoMonoWhite height={32} /><span className="text-xs">LogoMonoWhite on a brand fill</span>
          </div>
        </div>
      </Section>

      <Section title="Colour tokens">
        <div className="sg__swatches">
          {["brand-500", "brand-600", "brand-50", "brand-text", "brand-text-tint", "brand-fill", "on-brand", "ink-900", "ink-700", "ink-500", "ink-300", "line", "bg", "surface", "surface-2",
            "success", "success-50", "success-text", "warning", "warning-50", "warning-text", "danger", "danger-50", "danger-text",
            "info", "info-50", "info-text", "neutral-50", "neutral-text", "veg", "nonveg"].map((t) => (
            <div key={t} className="sg__swatch"><span style={{ background: `var(--${t})` }} /><code>--{t}</code></div>
          ))}
        </div>
      </Section>

      <Section title="Type scale">
        {["3xl", "2xl", "xl", "lg", "md", "sm", "xs"].map((s) => <p key={s} style={{ fontSize: `var(--fs-${s})` }}>--fs-{s} · ₹1,234.50</p>)}
      </Section>

      <Section title="Buttons">
        <div className="row">
          <Button variant="primary">Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button><Button variant="danger-outline">Danger outline</Button><Button variant="success">Success</Button>
        </div>
        <div className="row">
          <Button variant="primary" loading>Loading</Button><Button variant="secondary" disabled>Disabled</Button>
          <Button variant="primary" size="sm" icon="plus">Small</Button><Button variant="primary" size="lg" iconRight="arrowRight">Large</Button>
          <Button variant="ghost" iconOnly icon="edit" aria-label="Edit" />
        </div>
      </Section>

      <Section title="Inputs">
        <div className="form-grid">
          <Field label="Default" hint="Helper text"><input className="input" placeholder="Placeholder" /></Field>
          <Field label="With error" error="Price must be more than ₹0"><input className="input" defaultValue="0" /></Field>
          <Field label="Select"><select className="select"><option>Option</option></select></Field>
          <Field label="Disabled"><input className="input" disabled value="Disabled" /></Field>
          <Field label="Textarea" className="full"><textarea className="textarea" /></Field>
        </div>
        <div className="search"><Icon name="search" /><input className="input" placeholder="Search" /></div>
      </Section>

      <Section title="Chips & badges">
        <div className="row">{ALL_STATUSES.map((s) => <StatusBadge key={s} status={s} />)}</div>
        <div className="row"><PaymentBadge status="mock_paid" /><PaymentBadge status="refunded" /><ReturnBadge status="pending" /><ReturnBadge status="approved" /><ReturnBadge status="rejected" /><Badge tone="info">Info</Badge></div>
        <div className="row"><Chip>Default</Chip><Chip active>Active</Chip><Chip count={3}>With count</Chip><RatingChip value={4.4} count={12} /><RatingChip value={3.6} count={5} /><RatingChip count={0} /><VegMark veg /><VegMark veg={false} /></div>
      </Section>

      <Section title="Cards">
        <div className="grid-cards">
          {sample.error ? <ErrorState message={sample.error} onRetry={sample.reload} />
            : !sample.data ? <><RestaurantCardSkeleton /><RestaurantCardSkeleton /></>
            : !r ? <EmptyState icon="store" title="No restaurants yet">Seed the database to preview cards.</EmptyState>
            : (
              <>
                <RestaurantCard r={r} />
                <RestaurantCard r={{ ...r, id: -1, is_open: false }} />
                <RestaurantCard r={{ ...r, id: -2, image_url: null, rating_count: 0, categories: [], cost_for_two: null }} />
              </>
            )}
          <RestaurantCardSkeleton />
        </div>
        <Card className="card--pad">
          {dish && (
            <>
              <DishCard dish={dish} canOrder qty={0} onAdd={() => toast.info("ADD pressed")} onQty={() => {}} />
              <DishCard dish={{ ...dish, id: -1 }} canOrder qty={qty} onQty={setQty} highlight />
              <DishCard dish={{ ...dish, id: -2, is_available: false }} canOrder qty={0} />
            </>
          )}
          <DishSkeleton />
        </Card>
        {sample.data && <div className="grid-stats"><StatCard label="Restaurants" value={String(sample.data.total)} /><StatCard label={`Dishes at ${r?.name ?? "—"}`} value={String(sample.data.menuTotal)} /></div>}
      </Section>

      <Section title="Order stepper">
        <Card className="card--pad"><OrderStepper order={{ status: "PREPARING", status_history: HISTORY }} /></Card>
        <Card className="card--pad"><OrderStepper order={{ status: "DELIVERED", status_history: [] }} /></Card>
      </Section>

      <Section title="Controls">
        <div className="row"><QtyStepper value={qty} name="demo" onChange={setQty} /><QtyStepper outline value={qty} name="demo" onChange={setQty} /><Switch checked={on} onChange={setOn} label="Demo switch" /><Spinner /></div>
        <StarInput value={stars} onChange={setStars} /><Stars value={3} />
        <Tabs label="Demo" value={tab} onChange={setTab} items={[{ value: "a", label: "Active", count: 2 }, { value: "b", label: "Past", count: 14 }]} />
        <FilterBar value={filters} onChange={setFilters} statuses={ALL_STATUSES} />
        <Pagination page={2} pages={8} onChange={() => {}} />
      </Section>

      <Section title="Feedback">
        <Alert type="error">Error alert</Alert><Alert type="warning">Warning alert</Alert><Alert type="info">Info alert</Alert><Alert type="success">Success alert</Alert>
        <div className="row"><Button onClick={() => toast.success("Saved")}>Success toast</Button><Button onClick={() => toast.error("Something failed")}>Error toast</Button><Button onClick={() => toast.info("Heads up")}>Info toast</Button></div>
        <div className="row"><Button onClick={() => setModal("modal")}>Modal / bottom sheet</Button><Button onClick={() => setModal("drawer")}>Drawer</Button><Button onClick={() => setModal("confirm")}>Confirm</Button></div>
        <Card><EmptyState icon="receipt" title="No orders yet" action={<Button variant="primary">Browse restaurants</Button>}>Orders you place show up here.</EmptyState></Card>
        <Card><ErrorState message="Can't reach the server." onRetry={() => {}} /></Card>
        <ListSkeleton count={1} />
      </Section>

      <Modal open={modal === "modal" || modal === "drawer"} variant={modal === "drawer" ? "drawer" : "sheet"} title="Write a review" onClose={() => setModal(null)}
        footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button variant="primary">Submit</Button></>}>
        <StarInput value={stars} onChange={setStars} />
        <Field label="Comment"><textarea className="textarea" /></Field>
      </Modal>
      <ConfirmDialog open={modal === "confirm"} title="Mark as delivered?" confirmLabel="Yes, delivered" onClose={() => setModal(null)} onConfirm={() => setModal(null)}>
        <p>This can't be undone.</p>
      </ConfirmDialog>
      <Card><CardHead title="Card head" /><div className="card__body">Card body</div></Card>
    </div>
  );
}
