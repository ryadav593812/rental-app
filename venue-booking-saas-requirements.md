# Event Venue Booking SaaS — Requirements Document

**Version:** 1.0
**Date:** June 2026
**Product type:** Multi-tenant, subscription-based SaaS for event venues, banquet halls, and wedding venues in India
**Tech stack:** React (frontend), Node.js (backend), PostgreSQL (database)

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
4. Multi-slot booking per date (morning/evening/full-day)
5. DB-level double-booking prevention (unique constraint on hall+date+slot for active locks)
6. Booking audit trail (who locked/confirmed/cancelled, timestamped)
7. Waitlist for fully booked dates with notify-on-release

**Dependencies:** None (foundational — build first)
**Tenant-toggle note:** This module is the product core and should not be fully disable-able, but individual sub-features (e.g. waitlist) can be toggled.

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

**Personas:** `PER-MANAGER`, `PER-CUSTOMER`

**Features:**
1. Drag-drop canvas editor (tables, chairs, stage, dance floor, buffet counters)
2. Layout saved as structured JSON (not image) for reusability
3. Saved layout templates by guest count/style (e.g. "Round tables — 200 guests")
4. Customer-facing read-only layout preview
5. Auto capacity calculator from placed elements

**Dependencies:** `MOD-BOOKING-01` (layouts attach to a specific booking or venue hall)
**Tenant-toggle note:** Optional — can be disabled for venues that don't want layout planning (e.g. open-lawn-only venues).

---

### `MOD-LAYOUT3D-04` — 3D Visualization

**Personas:** `PER-MANAGER`, `PER-CUSTOMER`

**Features:**
1. **Level 1 (default scope):** Extruded 3D rendering generated from the same 2D layout JSON — tables/stage/dance floor as simple 3D shapes, angled camera view
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

**Personas:** `PER-MANAGER`, `PER-CUSTOMER`, `PER-ACCOUNTS`

**Features:**
1. Auto-generated booking contract from tenant's own template
2. E-signature capture
3. Terms & conditions versioning (track which version a customer signed)
4. Document storage per booking (ID proofs, signed contracts)

**Dependencies:** `MOD-BOOKING-01`
**Tenant-toggle note:** Optional — some smaller venues operate without formal contracts.

---

### `MOD-VENDOR-07` — Vendor & Event Operations

**Personas:** `PER-MANAGER`, `PER-FRONTDESK`, `PER-VENDOR`

**Features:**
1. Vendor assignment per booking (catering, decor, sound, photography)
2. Vendor schedule/call sheet generation
3. Day-of-event checklist
4. Guest count finalization tracking with deadline reminders to customer
5. Menu/catering selection module

**Dependencies:** `MOD-BOOKING-01`
**Tenant-toggle note:** Optional — relevant mainly to full-service venues, less so for space-only rentals.

---

### `MOD-RBAC-08` — Staff & Role Management *(Core, cannot be disabled)*

**Personas:** `PER-OWNER`, `PER-MANAGER`

**Features:**
1. Role-based permission assignment per venue
2. Staff activity logs / audit trail
3. Multi-venue staff assignment (for `PER-GROUPADMIN` tenants)

**Dependencies:** None (foundational)
**Tenant-toggle note:** Core module; cannot be disabled, though specific roles can be unused by smaller tenants.

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
1. View booking status, layout, contract, invoices
2. Make payments online
3. Request layout changes
4. Chat/ticket communication with venue staff

**Dependencies:** `MOD-BOOKING-01`, `MOD-BILLING-05`
**Tenant-toggle note:** Optional — some venues may prefer to manage all customer communication offline/manually.

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
| **Security** | Encrypted data at rest/in transit; RBAC enforced at API level, not just UI; audit logging on sensitive actions (cancellations, refunds, cross-tenant support access) |
| **Localisation** | Hindi + regional language support (phased); region-configurable cultural calendar data in `MOD-INTEL-13` |
| **Data portability** | Tenant data export available; no hard lock-in |
| **Feature modularity** | Every module must check tenant feature flags at both API and UI layers (see Section 2) |

---

## 8. Build Sequencing Recommendation (for backlog planning)

1. **Foundation:** `MOD-RBAC-08`, multi-tenancy + feature-flag architecture (Section 2)
2. **Core:** `MOD-BOOKING-01` (booking engine + soft-lock concurrency handling)
3. **Revenue path:** `MOD-BILLING-05`, `MOD-NOTIFY-09`
4. **Differentiator (visual):** `MOD-LAYOUT-03` → `MOD-LAYOUT3D-04`
5. **Sales tooling:** `MOD-CRM-02`, `MOD-CONTRACT-06`
6. **Operational depth:** `MOD-VENDOR-07`, `MOD-REFERRAL-12`
7. **Customer-facing:** `MOD-PORTAL-11`
8. **Insight layer (key differentiator):** `MOD-INTEL-13`, `MOD-REPORTS-10`
9. **Backlog:** Section 5 "Good to Have" features, prioritized by tenant feedback once live

---

## 9. Open Questions / Decisions Needed

- [ ] Which muhurat/panchang data source to use for `MOD-INTEL-13` — licensed data provider vs. manually curated calendar
- [ ] Default soft-lock expiry duration — confirm if this should be tenant-configurable from day one or a fixed platform default initially
- [ ] Refund/cancellation slab defaults — need at least one real venue's policy as a template
- [ ] Confirm whether `MOD-LAYOUT3D-04` Level 1 ships in MVP or as fast-follow (effort estimate: +2-3 weeks after 2D layout is stable)
- [ ] Payment gateway: Razorpay vs PayU — settlement terms comparison needed
- [ ] Whether `PER-COCUSTOMER` needs payment rights in any tenant scenario (currently scoped as view/approve only)

---

*This document is structured for direct use in backlog/ticket generation. Each `MOD-XX-NN` module and its numbered features can be converted 1:1 into epics and user stories. Persona IDs (`PER-XX`) should be used as the "as a [persona]" actor in user story format: "As a `PER-SALES`, I want to soft-lock a date so that I can hold it for a customer while they arrange payment."*
