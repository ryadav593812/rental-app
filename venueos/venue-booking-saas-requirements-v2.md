# Event Venue Booking SaaS — Requirements Document

**Version:** 2.0
**Date:** June 2026 (v2.0 supersedes v1.0 — see Section 10 for changelog)
**Product type:** Multi-tenant, subscription-based SaaS for event venues, banquet halls, and wedding venues in India
**Tech stack:** React/Next.js (frontend), NestJS on Node.js (backend), PostgreSQL with row-level security (database), Redis (real-time + caching), S3-compatible object storage via self-hosted Openinary (media/document storage)

> **Note for AI agents / developers building from this doc:** This document is structured persona-first and feature-module-first, with explicit module IDs (e.g. `MOD-BOOKING-01`) so individual features can be mapped to backlog tickets, and explicit **tenant feature toggles** so any feature can be enabled/disabled per client without code branching. Treat each numbered feature as a candidate user story. Each module states its dependencies so build order can be sequenced correctly.

---

## 1. Product Overview

A cloud-based, multi-tenant SaaS platform for event venues (banquet halls, wedding lawns, marriage gardens, hotels with event spaces) in India to manage bookings, prevent double-booking via a soft-lock mechanism, visualize seating layouts (2D and 3D), handle billing/contracts, and — critically — provide India-specific demand intelligence (auspicious dates, festival calendars, weekday/weekend/long-weekend pricing insights) that no global competitor currently offers.

**Core differentiators:**
- Soft-lock booking engine with DB-level double-booking prevention
- 2D drag-drop seating layout designer + 3D visualization
- India-specific demand calendar: Muhurat dates, Ashada Masa/Shradh (inauspicious periods), festivals, long weekends — region-aware
- Fully modular, persona-based feature set — every feature can be toggled on/off per tenant
- GST-compliant billing, vendor management, referral/agent tracking — built for the Indian wedding/event ecosystem specifically

---

## 2. Tenancy & Feature-Toggle Model

**This is a foundational architectural requirement, not a feature — build this first.**

- The system is **multi-tenant**: one platform instance, each venue (or venue group) is a tenant with isolated data.
- Every feature module in this document must be **independently togglable per tenant** by Super Admin (and optionally self-serve by Venue Owner within their subscription plan's allowed modules).
- **Implementation requirement:** maintain a `tenant_feature_flags` table (tenant_id, module_id, enabled boolean) checked at both API authorization layer and frontend render layer — never hardcode module visibility.
- A feature being disabled for a tenant must:
  - Hide all related UI (no broken/empty screens)
  - Block related API routes (403, not just hidden UI)
  - Not break dependent modules — see "Dependencies" listed per module below; disabling a dependency should warn the admin which dependent modules will also be affected

---

## 3. Personas

### 3.1 Platform-Side Personas

| ID | Persona | Description | Notes for build |
|---|---|---|---|
| `PER-SUPERADMIN` | Super Admin (Platform Owner) | Manages all tenants, subscription plans, platform billing, feature flag control, support escalations | Single role, platform-level, not per-tenant |
| `PER-SUPPORT` | Platform Support Staff | Handles tenant onboarding, billing disputes, technical tickets | Read access across tenants for support purposes; needs audit logging on cross-tenant access |

### 3.2 Venue-Side Personas (Per Tenant)

| ID | Persona | Description | Default Access Scope |
|---|---|---|---|
| `PER-OWNER` | Venue Owner | Subscribes, owns the tenant account | Full access: billing, staff, reports, settings, feature toggle requests |
| `PER-MANAGER` | Venue Manager | Day-to-day operations head | Bookings, pricing, staff management, reports — no subscription/billing changes |
| `PER-SALES` | Sales Agent / Booking Executive | Handles inquiries, soft-locks, follow-ups | CRM + booking creation up to confirmation stage; no refund/cancellation rights |
| `PER-ACCOUNTS` | Accounts / Billing Staff | Manages invoices, payments, refunds | Billing module only; no booking creation |
| `PER-FRONTDESK` | Front Desk / Event Coordinator | Day-of-event coordination | View confirmed bookings, vendor schedules, checklists; read-only on most else |
| `PER-GROUPADMIN` | Multi-Venue Group Admin | For chains/groups owning multiple properties | Cross-venue dashboard, comparative reports across all venues in their group |

### 3.3 Customer-Side Personas

| ID | Persona | Description |
|---|---|---|
| `PER-CUSTOMER` | Customer / Event Host | Books venue, makes payments, views layout, downloads contract/invoice |
| `PER-COCUSTOMER` | Co-decision-maker (family member) | Secondary login on same booking — common in Indian family-decision bookings; view/approve rights, not payment rights by default |

### 3.4 External Stakeholder Personas

| ID | Persona | Description |
|---|---|---|
| `PER-VENDOR` | Vendor (Caterer, Decorator, Photographer, DJ, etc.) | Assigned to specific bookings; sees only their own schedule/requirements |
| `PER-REFERRAL` | Referral Partner / Wedding Planner / Agent | Brings bookings, tracked for commission; sees only their referred bookings and payout status |

---

## 4. Feature Modules

> Each module lists: **Personas involved**, **Feature list**, **Dependencies**, **Tenant-toggle note**.

---

### `MOD-BOOKING-01` — Booking Engine *(Core, cannot be disabled)*

**Personas:** `PER-MANAGER`, `PER-SALES`, `PER-CUSTOMER`, `PER-FRONTDESK`

**Features:**
1. Inquiry → Soft Lock → Confirmed → Completed/Cancelled state machine
2. Auto-expiry on soft locks (configurable timer per tenant, e.g. 24–72 hrs)
3. Real-time availability calendar across halls/lawns/spaces
4. **Per-hall slot configuration (v2.0):** each hall defines its own slots — name, start time, end time, and count — at setup. Platform-provided starter templates (e.g. 2-slot: Morning 6 AM–3 PM / Evening 3 PM–10 PM) are offered as a starting point but are fully customizable per hall, including supporting 3+ slots per day where a venue wants e.g. Morning/Afternoon/Evening turnover. Two halls in the same venue, or two venues in the same group, are not required to share a slot configuration.
5. **Slots are atomic and fixed at booking time (v2.0):** once a hall's slots are configured, a booking must consume one or more *whole, contiguous* slots — never a partial slot. A 3-hour event books one full slot (the remainder of that slot's time window goes unused, not resold); a full-day wedding books all slots for that hall on that date by selecting multiple contiguous slots. Slot *configuration* (the boundaries themselves) can be edited later by Owner/Manager for future dates, but slot boundaries are never redefined ad hoc during a single booking's creation.
6. DB-level double-booking prevention: unique constraint on `(hall_id, date, slot_id)` for active soft-locks/confirmed bookings, extended so a multi-slot booking claims and locks each constituent slot atomically — a multi-slot request must succeed or fail as a whole (no partial claim of some slots in the set).
7. Booking audit trail (who locked/confirmed/cancelled, timestamped)
8. Waitlist for fully booked dates with notify-on-release

**Dependencies:** None (foundational — build first). Hall slot configuration should be in place before bookings can be created against a hall.
**Tenant-toggle note:** This module is the product core and should not be fully disable-able, but individual sub-features (e.g. waitlist) can be toggled.
**Build note (v2.0):** changing a hall's slot configuration after bookings already exist against the old configuration must show a dependency warning identifying affected future bookings, mirroring the existing feature-flag dependency-warning pattern in Section 2.

---

### `MOD-CRM-02` — CRM & Lead Management

**Personas:** `PER-MANAGER`, `PER-SALES`, `PER-OWNER`

**Features:**
1. Lead capture (website form, WhatsApp, manual entry)
2. Follow-up reminders/task assignment per agent
3. Lead-to-booking conversion tracking
4. Inquiry source tagging (Instagram, referral, walk-in, Google, etc.)
5. Quotation builder with PDF/WhatsApp share
6. Lost-lead reason tracking (price, date unavailable, lost to competitor)

**Dependencies:** `MOD-BOOKING-01`
**Tenant-toggle note:** Fully optional module — small single-hall venues may not need a CRM layer.

---

### `MOD-LAYOUT-03` — 2D Layout Designer

**Personas:** `PER-MANAGER`, `PER-OWNER`, `PER-CUSTOMER`

**Data model (v2.0) — three-level layout hierarchy:**
This module operates on three distinct, nested concepts. Getting this hierarchy right is foundational — building it as a single flat "layout" concept breaks the venue-specific and event-specific customization required below.

```
Hall boundary (Level 1)
   └── Layout templates (Level 2)
          └── Event/booking layout instances (Level 3)
```

1. **Hall boundary (Level 1):** the physical footprint of a hall — an **irregular polygon**, not a fixed rectangle, since real banquet halls and lawns are frequently non-rectangular. Defined once per hall, rarely changed. Supports tenant-chosen display units (feet or meters), with all values stored internally in a single canonical unit (meters) and converted for display per the venue's unit preference — never stored or compared across mixed units. Boundary definition is **optional at hall creation**: a hall not yet given a real boundary is automatically assigned a platform-default placeholder rectangle (sized generically, e.g. 60×40 ft equivalent) so the hall is usable for bookings immediately. Any 2D/3D feature reading a default (unconfirmed) boundary must visibly flag it as a placeholder, not a confirmed measurement, since capacity/fit calculations against it are not reliable until replaced with the hall's real footprint. Boundary is fully editable later from the Owner/Manager hall configuration screen; editing a boundary after layout templates exist against it must trigger a dependency warning (existing saved templates may no longer fit).
2. **Layout templates (Level 2):** reusable starting arrangements scoped to one specific hall (and therefore implicitly to one venue) — e.g. "Round tables — 200 guests," "Theatre style — 150 guests." Templates are venue/hall-specific by construction; a venue never shares or inherits another venue's templates. Drag-drop canvas editor (tables, chairs, stage, dance floor, buffet counters), saved as structured JSON (not image) for reusability and reuse in `MOD-LAYOUT3D-04`. Each placeable element carries a real-world default footprint size (e.g. round table diameter for a given seat count), so the canvas is to-scale against the hall boundary, not an arbitrary drawing surface — this is what makes the capacity calculator (feature 6 below) physically meaningful rather than a simple count of placed seats.
3. **Event/booking layout instances (Level 3):** the actual layout for one specific booking. Created as a **copy** of a layout template (or the hall's default arrangement, if no template is selected) at booking time, then freely and independently customizable for that one event — e.g. Event A in a hall places chairs around the perimeter with the stage centered, while Event B in the *same hall* on a different date keeps the default stage-in-corner arrangement with rows facing it, plus a buffet counter. Editing a booking's layout instance never modifies the template it was copied from, and never affects any other booking.

**Features:**
1. Drag-drop canvas editor, used both for authoring Level 2 templates and for customizing a Level 3 booking instance — the editor must clearly indicate which mode is active (Owner/Manager editing a reusable template vs. editing one specific booking's layout), since saving in template mode affects future bookings that start from it, while saving in instance mode affects only the open booking.
2. Layout saved as structured JSON (not image) for reusability and for 3D generation
3. Saved layout templates by guest count/style, scoped per hall (e.g. "Round tables — 200 guests")
4. Customer-facing read-only layout preview, showing the customer **their specific booking's layout instance** (Level 3) — never a generic template — with a "Request changes" action that notifies the venue manager
5. Auto capacity calculator from placed elements, computed against the hall's real boundary area and each element's real footprint (polygon area via standard computational geometry; placed elements checked for fit within the boundary, not just counted)
6. Group-level template push (placeholder/future scope): Group Admin or Owner can push a layout template to other venues in the group, with the ability to modify the template before pushing rather than forcing an identical copy — not required for first build pass

**Dependencies:** `MOD-BOOKING-01` (hall boundaries and slots are configured together in the same Hall Configuration screen; layout instances attach to a specific booking)
**Tenant-toggle note:** Optional — can be disabled for venues that don't want layout planning (e.g. open-lawn-only venues). When disabled, hall boundary configuration remains invisible/irrelevant to the Owner — the placeholder default exists in the data model but is never surfaced in the UI.

---

### `MOD-LAYOUT3D-04` — 3D Visualization

**Personas:** `PER-MANAGER`, `PER-CUSTOMER`

**Features:**
1. **Level 1 (default scope):** Extruded 3D rendering generated from the same Level 3 layout-instance JSON (or Level 2 template JSON, when previewing a template rather than a specific booking) — tables/stage/dance floor as simple 3D shapes, angled camera view. Floor extrusion follows the hall's actual polygon boundary (v2.0) rather than assuming a rectangular room shell.
2. **Level 2 (future/premium):** Walkthrough camera mode in a pre-built generic 3D venue shell
3. **Level 3 (out of scope for SaaS core; venue-specific add-on service):** Photorealistic per-venue 3D model — not a standard subscription feature, treat as a separate paid service if ever offered

**Dependencies:** `MOD-LAYOUT-03` (3D is generated from 2D layout data)
**Tenant-toggle note:** Optional, likely a higher-tier subscription feature.

---

### `MOD-BILLING-05` — Billing & Payments

**Personas:** `PER-ACCOUNTS`, `PER-OWNER`, `PER-CUSTOMER`

**Features:**
1. GST-compliant invoice generation
2. Advance + milestone + balance payment tracking
3. Payment gateway integration (Razorpay/PayU) — UPI, card, netbanking
4. Automated payment due reminders (WhatsApp/SMS/Email)
5. Refund/cancellation policy engine (slab-based refund %, configurable per tenant)
6. Multiple payment plan templates (e.g. 25% advance / 50% at 30 days / 25% on event day)

**Dependencies:** `MOD-BOOKING-01`
**Tenant-toggle note:** Core for any paid tenant; refund-slab configuration should be tenant-customizable, not hardcoded.

---

### `MOD-CONTRACT-06` — Contracts & Documents

**Personas:** `PER-OWNER`, `PER-MANAGER`, `PER-CUSTOMER`, `PER-ACCOUNTS`

**Data model (v2.0):**
- **Contract templates are per-venue**, not merely per-tenant — a multi-venue group owner can define different cancellation/payment terms and clause sets for each property (e.g. Venue 1 and Venue 2 under the same owner running different rules). A tenant with one venue simply has one venue's worth of templates; the model doesn't change.
- **Each template supports version history**, with exactly one version flagged "active" at any time. New bookings always generate from the currently-active version; existing signed contracts retain a record of which version the customer actually signed (this satisfies the existing terms-and-conditions versioning requirement below).
- **Contract lifecycle: `Draft/Generated` → `Released` → `Signed`.** A contract auto-generates the moment a booking transitions to Confirmed in the `MOD-BOOKING-01` state machine, merging in booking-specific data (customer name, hall, date, slot(s), amount, payment plan) from the venue's active template. Generation alone does **not** make the contract visible to the customer.
- **View and Release are two distinct actions.** Owner/Manager can **View** a generated contract to review the auto-populated details (and apply a per-booking edit, below) before it is customer-visible. **Release** is the separate, explicit action that makes the contract visible in the Customer Portal. This mirrors the same review-before-visibility pattern used for external vendor/referral updates in `MOD-VENDOR-07`.
- **Per-customer, per-booking edit:** before release, Owner/Manager can edit a *copy* of the generated contract for that one booking — the edit never modifies the underlying template. Edits use **structured fields for common terms** (advance %, cancellation slab, payment milestones) plus a **free-text addendum box** for anything that doesn't fit a structured field, so one-off negotiated terms don't require unstructured editing of the whole document.
- **`contracts:release` is a granular permission (v2.0)**, evaluated through the hybrid RBAC model defined in `MOD-RBAC-08` — default-granted to both `PER-OWNER` and `PER-MANAGER`, but independently revokable per person (e.g. an Owner may grant a junior manager `contracts:view` without `contracts:release`).
- **Group-level template push (placeholder/future scope):** Group Admin or Owner can push a contract template to other venues in the group, with the ability to modify it before pushing rather than forcing an identical copy across all venues — not required for first build pass.

**Features:**
1. Auto-generated booking contract from the venue's active template, on booking confirmation
2. View / Release workflow as described above, gated by the `contracts:release` capability
3. Per-booking structured-field + free-text-addendum edit, applied to a copy only
4. E-signature capture
5. Terms & conditions versioning (track which version a customer signed)
6. Document storage per booking (ID proofs, signed contracts)

**Dependencies:** `MOD-BOOKING-01`, `MOD-RBAC-08` (for the `contracts:release` capability)
**Tenant-toggle note:** Optional — some smaller venues operate without formal contracts.

---

### `MOD-VENDOR-07` — Vendor & Event Operations

**Personas:** `PER-OWNER`, `PER-MANAGER`, `PER-FRONTDESK`, `PER-VENDOR`, `PER-REFERRAL`

**Data model (v2.0) — Menu/Catering Module:**
This feature was previously named but unspecified. v2.0 defines it fully.
- **Menu packages are defined per venue**, not platform-wide — e.g. Basic / Premium tiers, with veg / non-veg / Jain (and other dietary) variants, mirroring the dietary-tracking already implied elsewhere in this document (guest count finalization, Manager/Vendor dietary notes).
- Menu packages are the **real data source for the CRM quotation builder** (`MOD-CRM-02` feature 5) — a quotation's catering line item pulls from a venue's actual defined packages, rather than being entered as free-standing text.
- **Per-booking menu selection**, tied to the existing guest-count finalization deadline (feature 4 below) — the selected menu and finalized guest count are reviewed together, since both typically lock at the same pre-event deadline.
- The selected menu for a booking is visible to the customer in the Customer Portal (`MOD-PORTAL-11`), alongside that booking's contract and layout instance.

**External (vendor/referral) write-access model (v2.0):**
Vendors and referral partners are **not** part of the internal capability+scope RBAC model defined in `MOD-RBAC-08`. That model assumes a person belongs to one tenant; an external vendor or referral partner (e.g. a wedding planner, an external caterer) is tenant-independent by nature — the same partner may be attached to bookings across multiple, unrelated venues and possibly multiple tenants on the platform. A separate, deliberately lighter mechanism applies instead:
- A vendor or referral partner is **attached to specific bookings** (already implied by feature 1 below — vendor assignment per booking).
- That attachment carries a small, fixed set of permissions — not a flexible grant/revoke system — scoped only to bookings they are attached to. For v2.0 this includes proposing a menu/catering update for an attached booking.
- **All external-submitted changes enter a pending state** and require explicit Owner/Manager approval before becoming visible to the customer. This is the same review-before-customer-visibility pattern used for contract release in `MOD-CONTRACT-06`, applied here to keep the venue as the consistent source of truth for anything customer-facing. Pending external changes appear in a Manager/Owner review queue, following the same UI pattern as existing soft-lock follow-up reminders.
- This mechanism is intentionally separate from internal staff RBAC; if external roles later need richer, more flexible permissioning, that would be a deliberate future extension rather than a default assumption.

**Features:**
1. Vendor assignment per booking (catering, decor, sound, photography)
2. Vendor schedule/call sheet generation
3. Day-of-event checklist
4. Guest count finalization tracking with deadline reminders to customer
5. Menu/catering selection module — per-venue packages, dietary variants, per-booking selection, customer-portal visibility, and external-proposal-with-approval workflow as described above
6. Group-level menu package push (placeholder/future scope): Group Admin or Owner can push a menu package to other venues in the group, with modify-before-push — not required for first build pass

**Dependencies:** `MOD-BOOKING-01`
**Tenant-toggle note:** Optional — relevant mainly to full-service venues, less so for space-only rentals. The Menu/Catering module (feature 5) should have its own Super Admin feature-flag entry, distinct from generic Vendor & Event Operations, so space-only venues can disable catering specifically without losing vendor scheduling/checklists.

---

### `MOD-RBAC-08` — Staff & Role Management *(Core, cannot be disabled)*

**Personas:** `PER-OWNER`, `PER-MANAGER` (administers permissions); all internal personas (subject to permissions)

**Data model (v2.0) — Hybrid role + capability + scope model:**
v1.0 modeled permissions as a fixed checkbox grid: one role label per person, with a hardcoded permission set per role. This breaks down on two real scenarios: (a) a single person legitimately wearing multiple hats (e.g. a small venue's sole staff member acting as Owner, Manager, *and* Sales Agent), and (b) the need for permission grants that don't map to any predefined role at all (e.g. a Sales Agent given read-only visibility into this month's bookings/revenue, which is not a listed Sales Agent permission). v2.0 replaces the fixed-role model with a three-part hybrid, modeled on capability-based access policies (the same general approach as cloud storage access policies — a named identity is granted one or more capability bundles, each optionally scoped to a resource subset):

1. **Capability catalog:** the atomic, named permissions in the system (e.g. `bookings:create`, `bookings:confirm`, `billing:view`, `billing:refund`, `reports:view`, `reports:export`, `contracts:view`, `contracts:release`, `staff:manage`). Each capability is tagged as either **hall-scopable** (its effect can be limited to specific halls, e.g. `bookings:confirm`) or **tenant-global** (always applies tenant-wide regardless of any scope given, e.g. `staff:manage` — adding/removing staff is not meaningfully limitable to "one hall").
2. **Role bundles:** the existing predefined roles (`PER-MANAGER`, `PER-SALES`, `PER-ACCOUNTS`, `PER-FRONTDESK`, etc.) remain, but are now **editable default presets** — a named, convenient set of capability grants — rather than hardcoded logic. A person can be assigned **more than one role bundle simultaneously** (e.g. one staff login holding Owner + Manager + Sales bundles at once); their effective permission set is the union of all assigned bundles.
3. **Per-person overrides:** Owner can grant or revoke individual capabilities for a specific person, layered on top of their role bundle(s), optionally scoped to one or more specific halls (or to "all halls," which is dynamic and automatically includes halls added to the venue later — a named subset of halls does not auto-extend to new halls; Owner must explicitly add them). Example: a Sales Agent role bundle does not include `reports:view`, but Owner grants that one capability to a specific Sales Agent, scoped to all halls, so they can see "what happened this month" without any write access.
4. **Standard read-only convenience bundle:** a named **"Business Overview"** bundle (`bookings:view` + `billing:view` + `reports:view`, all read-only) is provided as a standard preset, following common B2B SaaS RBAC convention, so Owners don't need to grant three atomic capabilities separately for this common case. Like any bundle, individual capabilities within it remain independently revokable per person via override.
5. **Conflict resolution rule:** when a role-bundle grant and a per-person override disagree, **the most specific scope wins** — a hall-scoped override always takes precedence over a tenant-wide role grant, in either direction (a hall-scoped deny overrides a tenant-wide grant; a hall-scoped grant overrides a tenant-wide deny). This must be enforced identically at the API authorization layer and the frontend render layer, consistent with the feature-flag enforcement principle in Section 2.
6. **Group/venue-level scoping:** for `PER-GROUPADMIN` tenants, the same scoping mechanism extends one level up — overrides can be scoped to specific **venues** within the group, not only to halls within a single venue.
7. **Override authority:** only `PER-OWNER` may create or edit per-person overrides, consistent with the existing RBAC editor's Owner-only editing model. This is not delegable in v2.0.
8. **External personas excluded:** `PER-VENDOR` and `PER-REFERRAL` are explicitly **not** covered by this capability+scope model — see `MOD-VENDOR-07` for the separate, lighter, attachment-based access mechanism that applies to external personas instead, and the rationale for keeping the two mechanisms distinct.

**Features:**
1. Role-bundle-based permission assignment per venue, with multi-bundle assignment per person
2. Per-person capability overrides, hall/venue-scoped, Owner-only, with most-specific-scope-wins conflict resolution
3. Staff activity logs / audit trail — extended in v2.0 to also log every permission change itself (who granted/revoked what, for whom, when), not only the actions those permissions gate
4. Multi-venue staff assignment (for `PER-GROUPADMIN` tenants), with venue-level scoping for overrides

**Dependencies:** None (foundational)
**Tenant-toggle note:** Core module; cannot be disabled, though specific roles can be unused by smaller tenants.
**Build note (v2.0):** the permission-matrix editor UI should present role-bundle assignment and per-person overrides as two distinct, clearly separated controls — a person's effective permissions are the union of their bundles plus their overrides, and the UI should make this composition visible (e.g. show "from role: X, Y, Z" separately from "individually granted: A" and "individually revoked: B") rather than collapsing it into a single flat checkbox grid as in v1.0.

---

### `MOD-NOTIFY-09` — Notifications

**Personas:** All

**Features:**
1. WhatsApp/SMS/Email triggers at each booking stage
2. Payment due reminders
3. Event-day reminders to customer and vendors
4. Internal staff alerts (new inquiry, soft-lock expiring soon)

**Dependencies:** `MOD-BOOKING-01`
**Tenant-toggle note:** Channel-level toggles recommended (e.g. tenant may want SMS but not WhatsApp due to cost).

---

### `MOD-REPORTS-10` — Reports & Analytics

**Personas:** `PER-OWNER`, `PER-MANAGER`, `PER-GROUPADMIN`

**Features:**
1. Occupancy rate by hall/date
2. Revenue by month/quarter
3. Lead conversion rate by source
4. Referral partner performance
5. Cancellation rate & reasons

**Dependencies:** `MOD-BOOKING-01`, `MOD-CRM-02` (for conversion metrics)
**Tenant-toggle note:** Optional, though most owners will want at least basic reports.

---

### `MOD-PORTAL-11` — Customer Portal

**Personas:** `PER-CUSTOMER`, `PER-COCUSTOMER`

**Features:**
1. View booking status, **this booking's specific layout instance** (read-only — see `MOD-LAYOUT-03` Level 3), released contract, **selected menu/catering package** (see `MOD-VENDOR-07`), and invoices
2. Make payments online
3. Request layout changes (notifies venue manager; does not edit the layout directly)
4. Chat/ticket communication with venue staff

**Dependencies:** `MOD-BOOKING-01`, `MOD-BILLING-05`, `MOD-CONTRACT-06` (only **released** contracts are visible — see Draft/Generated → Released lifecycle), `MOD-LAYOUT-03` (optional, if tenant has it enabled), `MOD-VENDOR-07` (optional, if Menu/Catering is enabled)
**Tenant-toggle note:** Optional — some venues may prefer to manage all customer communication offline/manually. Layout and menu visibility within the portal are naturally gated by whether those parent modules are enabled for the tenant.

---

### `MOD-REFERRAL-12` — Referral & Agent Management

**Personas:** `PER-REFERRAL`, `PER-OWNER`, `PER-ACCOUNTS`

**Features:**
1. Referral partner registration and tracking
2. Per-booking referral attribution
3. Commission calculation rules (% or flat fee, configurable)
4. Payout tracking and history
5. Referral partner's own portal view (their bookings + payout status only)

**Dependencies:** `MOD-BOOKING-01`, `MOD-BILLING-05`
**Tenant-toggle note:** Optional — relevant mainly to venues that work with wedding planners/agents.

---

### `MOD-INTEL-13` — India-Specific Demand Intelligence *(Key differentiator module)*

**Personas:** `PER-OWNER`, `PER-MANAGER`, `PER-GROUPADMIN`

**Features:**
1. **Muhurat/auspicious date calendar overlay** — region-configurable wedding-auspicious date tagging on the booking calendar
2. **Inauspicious period flagging** — Ashada Masa, Shradh/Pitru Paksha, and other regionally-observed no-wedding periods (region-configurable per tenant, since observance varies by state/community)
3. **Festival calendar layer** — national/regional festivals tagged as high-demand or low-demand depending on venue type and region (configurable)
4. **Weekday vs. weekend occupancy insights** — dashboard showing fill-rate disparity to support differential pricing decisions
5. **Long-weekend detection & alerts** — auto-flag public-holiday-adjacent weekends as high-demand windows, alert manager ahead of time
6. **Demand-dip alerts** — flag upcoming low-demand periods (e.g. Ashada Masa) so managers can pivot marketing toward corporate events/birthdays/anniversaries
7. **Year-on-year comparison** — same week/date last year vs. this year booking comparison
8. **Lead-time risk flagging** — flag auspicious dates that remain unbooked closer to the date than their historical norm
9. *(Phase 2 — requires accumulated platform data)* Cross-venue anonymized demand benchmarking and price-elasticity suggestions

**Dependencies:** `MOD-BOOKING-01`, `MOD-REPORTS-10` (for historical comparison features)
**Tenant-toggle note:** Should be a distinguishing feature of higher subscription tiers (see Pricing section). Region/community configuration (which calendar rules apply) must be tenant-configurable, not hardcoded — India's auspicious/inauspicious periods vary significantly by state and community.
**Build note:** Start with a manually curated, admin-editable calendar dataset (muhurat dates, regional festival/inauspicious periods) rather than attempting automated astrological calculation. Predictive/AI features (#9, and deeper versions of #7-8) are Phase 2, after sufficient real booking data exists to learn from.

---

## 5. "Good to Have" Features (Phase 2+ / Backlog Candidates)

These are valuable but not required for MVP — flag as backlog items, not blockers.

| Feature | Notes |
|---|---|
| AI chatbot for customer inquiries (WhatsApp-based) | Auto-answer common questions, capture leads after hours |
| Dynamic pricing engine (auto-suggest price changes, not just alerts) | Builds on `MOD-INTEL-13`, needs historical data first |
| Virtual venue tour (360° photo viewer) | Lower effort than full 3D, good interim visual feature |
| Guest list & RSVP management for customers | Useful add-on for the customer portal |
| Integrated seating chart with guest name assignment | Extends `MOD-LAYOUT-03` — assign actual guest names to table seats |
| Multi-language support (Hindi + regional languages) | Important for Tier 2/3 city venues |
| Venue marketplace/discovery page (public-facing, for customers to find venues on your platform) | Adds a demand-generation layer beyond pure SaaS tool |
| Insurance/damage deposit tracking | Common ask from premium venues |
| Weather-based outdoor event alerts | Relevant for lawn/garden venues |
| Integration with photography/videography delivery platforms | Post-event vendor coordination |
| WhatsApp Business catalog integration for package showcasing | Marketing extension |
| Loyalty/repeat customer discount engine | For corporate clients booking recurring events |

---

## 6. Pricing Model (Subscription, India-Focused)

**Hybrid model:** Flat subscription with included usage, module-based tiering (the `MOD-INTEL-13` demand intelligence layer is the key tier differentiator since it's the hardest-to-replicate value-add).

| Tier | Monthly Price | Included Modules | Booking Volume | Notes |
|---|---|---|---|---|
| **Starter** | ₹2,499/mo | `MOD-BOOKING-01`, `MOD-RBAC-08`, `MOD-BILLING-05`, `MOD-NOTIFY-09` (SMS only) | Up to 15 bookings/month, 1 hall | For single-hall, single-staff small venues |
| **Growth** | ₹5,499/mo | + `MOD-CRM-02`, `MOD-LAYOUT-03`, `MOD-CONTRACT-06`, `MOD-NOTIFY-09` (WhatsApp) | Up to 50 bookings/month, up to 3 halls | Most independent banquet halls/lawns |
| **Pro** | ₹9,999/mo | + `MOD-LAYOUT3D-04` (Level 1), `MOD-VENDOR-07`, `MOD-REFERRAL-12`, `MOD-REPORTS-10`, `MOD-INTEL-13` | Unlimited bookings, up to 6 halls | Full-service wedding venues |
| **Enterprise / Group** | Custom | All modules + `PER-GROUPADMIN` cross-venue dashboard, API access, custom SLA | Unlimited, multi-property | Venue chains, hotel groups with event spaces |

**Add-ons (any tier):**
- Extra hall/space beyond plan limit: ₹499/mo per hall
- WhatsApp credit top-up: ₹499/mo
- `MOD-LAYOUT3D-04` Level 1 as standalone add-on for Starter/Growth tiers: ₹999/mo
- Dedicated onboarding/data migration assistance: one-time fee, custom quote

**Per-tenant module toggling:** Within their plan's allowed module set, Venue Owner can self-serve enable/disable optional modules from settings (e.g. a Growth-tier venue not using Vendor Management can simply leave it off — Super Admin should default new optional modules to "off" until explicitly enabled, to avoid cluttering small venues' interfaces).

---

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Multi-tenancy** | Strict data isolation between tenant venues at the database level |
| **Concurrency safety** | Booking soft-lock/confirm operations must use DB-level constraints/transactions to prevent race conditions — do not rely on application-layer checks alone |
| **Availability** | Cloud-hosted, high uptime target; calendar/availability data must reflect real-time state across concurrent staff sessions |
| **Performance** | Real-time calendar updates (Socket.io or Postgres LISTEN/NOTIFY) when one staff member locks/books a slot |
| **Security** | Encrypted data at rest/in transit; RBAC enforced at API level, not just UI; audit logging on sensitive actions (cancellations, refunds, cross-tenant support access, and — v2.0 — permission/override grants and revocations, contract releases, and external vendor/referral-submitted changes) |
| **Localisation** | Hindi + regional language support (phased); region-configurable cultural calendar data in `MOD-INTEL-13` |
| **Data portability** | Tenant data export available; no hard lock-in |
| **Feature modularity** | Every module must check tenant feature flags at both API and UI layers (see Section 2) |

---

## 8. Build Sequencing Recommendation (for backlog planning)

1. **Foundation:** `MOD-RBAC-08`, multi-tenancy + feature-flag architecture (Section 2)
2. **Core:** `MOD-BOOKING-01` (booking engine + soft-lock concurrency handling, including per-hall slot configuration)
3. **Revenue path:** `MOD-BILLING-05`, `MOD-NOTIFY-09`
4. **Differentiator (visual):** `MOD-LAYOUT-03` (hall boundary + templates + booking instances) → `MOD-LAYOUT3D-04`
5. **Sales tooling:** `MOD-CRM-02`, `MOD-CONTRACT-06`
6. **Operational depth:** `MOD-VENDOR-07` (including Menu/Catering Module), `MOD-REFERRAL-12`
7. **Customer-facing:** `MOD-PORTAL-11`
8. **Insight layer (key differentiator):** `MOD-INTEL-13`, `MOD-REPORTS-10`
9. **Backlog:** Section 5 "Good to Have" features, prioritized by tenant feedback once live

**v2.0 note:** `MOD-RBAC-08` being foundational now matters more than in v1.0, since `MOD-CONTRACT-06`'s `contracts:release` capability and `MOD-VENDOR-07`'s external-approval workflow both depend on the hybrid permission model existing first. Within step 4, hall boundary configuration should be sequenced before layout templates, and layout templates before booking instances, per the three-level hierarchy now defined in `MOD-LAYOUT-03`.

---

## 9. Open Questions / Decisions Needed

- [ ] Which muhurat/panchang data source to use for `MOD-INTEL-13` — licensed data provider vs. manually curated calendar
- [ ] Default soft-lock expiry duration — confirm if this should be tenant-configurable from day one or a fixed platform default initially
- [ ] Refund/cancellation slab defaults — need at least one real venue's policy as a template
- [ ] Confirm whether `MOD-LAYOUT3D-04` Level 1 ships in MVP or as fast-follow (effort estimate: +2-3 weeks after 2D layout is stable)
- [ ] Payment gateway: Razorpay vs PayU — settlement terms comparison needed
- [ ] Whether `PER-COCUSTOMER` needs payment rights in any tenant scenario (currently scoped as view/approve only)
- [ ] Whether a booking can be amended (date/slot change) without manually re-triggering contract generation, or whether amendment always requires manual regeneration (v2.0 — not yet decided)
- [ ] Exact UI/data spec for the Group Admin "push template to other venues, with modify-before-push" action across `MOD-LAYOUT-03`, `MOD-CONTRACT-06`, and `MOD-VENDOR-07` (v2.0 — flagged as placeholder/future scope in each module, not required for first build pass)

---

## 10. Changelog — v2.0

v2.0 supersedes v1.0. All changes below were scoped to address gaps identified during prototype review; no v1.0 feature was removed, only specified further or restructured.

| Module | Change |
|---|---|
| `MOD-BOOKING-01` | Slot configuration is now per-hall (not platform-fixed), supports any slot count, and slots are explicitly defined as atomic — a booking consumes one or more whole contiguous slots, never a partial slot |
| `MOD-LAYOUT-03` | Introduced explicit three-level hierarchy: hall boundary (polygon, tenant-chosen units, optional/default-then-customizable) → layout templates (per-hall) → event/booking layout instances (copy-on-create, independently editable). Customer Portal now explicitly shows the booking-specific instance, not a generic template |
| `MOD-LAYOUT3D-04` | 3D extrusion now follows the hall's actual polygon boundary rather than assuming a rectangular shell |
| `MOD-CONTRACT-06` | Templates are now per-venue (not per-tenant only), with a Draft/Generated → Released lifecycle, a separate `contracts:release` capability, and a structured-field + free-text-addendum per-booking edit model |
| `MOD-VENDOR-07` | Menu/Catering selection module fully specified for the first time (was previously named but undefined): per-venue packages, dietary variants, link to CRM quotation builder, customer-portal visibility. Introduced the external (vendor/referral) attachment-based access model with mandatory Owner/Manager approval before any external-submitted change is customer-visible |
| `MOD-RBAC-08` | Replaced the fixed role → fixed permission model with a hybrid model: editable role bundles, multi-bundle assignment per person, per-person hall/venue-scoped overrides, most-specific-scope-wins conflict resolution, a standard read-only "Business Overview" bundle, and audit logging extended to permission changes themselves |
| `MOD-PORTAL-11` | Explicitly scoped layout visibility to the booking-specific instance; added menu/catering visibility; clarified that only **released** contracts (not merely generated ones) are customer-visible |
| Tech stack | Updated to React/Next.js, NestJS, PostgreSQL with row-level security, Redis, and self-hosted Openinary (S3-compatible media/document storage) |

---

*This document is structured for direct use in backlog/ticket generation. Each `MOD-XX-NN` module and its numbered features can be converted 1:1 into epics and user stories. Persona IDs (`PER-XX`) should be used as the "as a [persona]" actor in user story format: "As a `PER-SALES`, I want to soft-lock a date so that I can hold it for a customer while they arrange payment."*

