# Requirements Specification Document (SRS)
## Project Name: Namma Party Props Rental Platform (Bangalore)
**Version:** 1.0.0  
**Target Deployment Year:** 2026  
**Environment:** Local Node.js Monolith / Micro-frontend Capability  

---

## 1. Executive Summary & Business Model
Namma Party Props is a tech-enabled rental marketplace operating in Bangalore, providing premium event decoration assets (backdrop stands, neon lights, themed frames) combined with retail purchases (balloons, disposable props) and add-on services (return gifts). 
* **Pricing Index:** Rental price matrices range from a minimum of ₹50 to a maximum of ₹500 per specific line item.
* **Rental Span:** Fixed 3-day operational loop comprised of:
  * **Day [E-1]:** Delivery / Distribution / Self-Pickup Logistics.
  * **Day [E]:** The Actual Scheduled Event Day.
  * **Day [E+1]:** Asset Extraction / Drop-off / Return.

---

## 2. User Authentication & Profile Architecture
### 2.1 Identity & Access Management (IAM)
* **Unique Identifier:** Customer Mobile Number serves as the primary system key (`customer_phone`).
* **Authentication Flow:** Password-based entry with an integrated password reset/recovery mechanism triggered if the mobile number already matches an existing database entity.
* **Onboarding Schema:** New customer sign-ups must explicitly capture:
  * Full Name
  * Verified Mobile Number
  * Email ID
  * Permanent Billing Address
  * Date of Birth (DoB)

### 2.2 Profile Complexities & Grouping
* **Family Members Array:** A nested sub-profile ledger allowing users to store data for up to N family members containing:
  * Name
  * Gender
  * Date of Birth (To calculate upcoming birthdays and automatically suggest relevant theme filters).
* **Address Matrix Capacity:** A single customer account can hold up to **5 distinct addresses** (e.g., Home, Office, Venue-1, Venue-2) with an explicit Boolean flag denoting one address as the `Default`.

---

## 3. Core Storefront, Catalog Navigation & Multi-dimensional Filtering
### 3.1 Global Date Matrix (Master Lock)
* **Event Date Filter:** Users specify their intended Event Date ($E$). 
* **Same-Day Lockout Guard:** If the targeted event date equals the current local calendar date ($E = \text{Today}$), the frontend system must forcefully block item selection and flag that immediate delivery slots are unavailable.
* **Dynamic Inventory Visibility:** Once a valid future Event Date is set, the catalog recalculates its quantities to reflect real-time physical warehouse availability for that explicit 3-day window $[E-1, E+1]$.

### 3.2 Advanced Search & Filter Engine
The storefront catalog requires multi-layered filtering nodes:
* **Thematic Alignment:** Selection by themes (e.g., Jungle Theme, Cocomelon, Space, Royal Princess, Vintage Glam).
* **Target Demographics:** Categorization by age brackets (e.g., Toddlers 0-3, Kids 4-12, Teens, Adults).
* **Event Modality:** Filter by event types (e.g., Birthday, Haldi, Mehendi, Anniversary, Baby Shower, Corporate Gala).
* **Material / Asset Composition:** Filter by structural component types (e.g., Fabric, Metallic Frames, Acrylic Boards, Wooden Arches, Neon Illumination).

### 3.3 Visual Display Mechanics & Product Media Carousel
* **Dual Nature Ledger:** The platform lists two fundamentally separate product classes:
  1. **Rental Products:** Returned post-event (Stands, Lights, Fabrics).
  2. **Non-Rental Consumables:** One-time use purchases (Balloons, Poppers, Tape, Customized Flex Prints).
* **Visual Presentation Layout:** Items display an initial high-resolution hero asset image accompanied by title, pricing tiers, and dynamic availability counts.
* **Sliding Panorama/Carousel:** Upon clicking or hovering, an image slider array activates, rendering real-life execution examples of that prop asset configured in actual party venues.
* **Intelligent Cross-Selling System:** Based on chosen rental themes and child demographic targets, the frontend dynamically maps and suggests available retail **Return Gifts** on the checkout module.

---

## 4. Advanced Inventory Control Math & Real-Time Scarcity Warnings
### 4.1 Fractional Asset Stock Auditing
* Every rental asset maintains a static ceiling parameter representing physical warehouse capacity ($I_{\text{max}}$).
* Let total inventory for asset $k$ be $I_k = 25$. If cumulative approved bookings for the specific overlapping timeframe $[E-1, E+1]$ take up 20 units, the available balance shows as:
$$\text{Available } I_k(E) = I_k - \sum \text{Allocated Units in Span}$$
* **Low Stock Urgency Flag:** If available inventory drops below a threshold ($\le 5$ units), the user interface displays a prominent warning counter (e.g., *"Only 5 stands left for this date! Book now"*), driving conversions via real-time scarcity data.

---

## 5. Order Management, Mutability & Workflow Lifecycle States

### 5.1 Ordering Rules
* **Multi-Order Concurrency:** Customers can submit multiple concurrent or overlapping order entries for distinct events or separate venues.
* **Order Mutability Period:** Customers retain full read/write permissions to add or remove line items from their cart *after submission*, provided the order remains in an un-finalized state before payment collection.

### 5.2 State Machine Lifecycle
An order transitions sequentially through these defined states:
[ PENDING ] ──(Admin Review & Alterations)──> [ REVIEWED ]
│
(Customer Pays)
▼
[ DELIVERED ] <──(Logistics Dispatched)─────── [ ORDERED ]
│
(Event Concludes)
▼
[ READY TO PICK UP ] ──(Quality Assurance Check)──> [ COMPLETED ]

* **CANCELLED State:** Triggered by user revocation or payment collection failures. Cancelled orders are deep-frozen and cannot be reactivated; customers must start a fresh order cycle.

| State Name | Triggering Event | Access Permissions / Allowed Actions |
| :--- | :--- | :--- |
| `PENDING` | Customer hits submit on their selected prop manifest. | Customer can edit items. Backend team can modify specifications. |
| `REVIEWED` | Backend updates item specs or sizing discrepancies and pushes a payment link. | Customer interface unlocks "PAY" option. Customer can still change items. |
| `ORDERED` | Advance payment verified or Cash on Delivery (CoD) deposit confirmed. | Manifest is frozen. No further customer-side changes allowed. |
| `DELIVERED` | Self-pickup completed or Porter/Logistics drops items off at venue. | Read-Only. System tracks timeline towards event conclusion. |
| `READY TO PICK UP` | Return window ($E+1$) arrives; assets packed for collection. | Triggers return logistics dispatch tracking. |
| `COMPLETED` | Backend team scans barcode, checks for damage, and restocks items. | Asset returns to active pool. Security deposits settled. |
| `CANCELLED` | Order rejected by admin, payment times out, or customer aborts. | Immutable state. Irreversible. |

---

## 6. Omnichannel Automated WhatsApp Communication Matrix
Every major change in the lifecycle triggers an instant programmatic notification via WhatsApp API webhooks:

| Trigger Point | Target Recipient | Message Template Payload Content |
| :--- | :--- | :--- |
| **Order Placement** | Customer | "Hi [Name], your party prop order #[ID] is submitted! Our Bangalore operations team is verifying the layout sizing. We'll send an update shortly." |
| **Admin Optimization** | Customer | "Action Required! Your prop layout #[ID] has been optimized by our experts (e.g., upgraded stand sizes). View revised manifest and balance total here: [Link]." |
| **Advance Payment Clear** | Customer | "Payment Confirmed! Your decoration assets for event date [Date] are locked in. Order status: ORDERED. Thank you!" |
| **Logistics Handover** | Customer | "Your props are out for delivery! Track vehicle or get warehouse coordinates for self-pickup: [Link]." |
| **Return Collection Reminder** | Customer | "Event Concluded! Your return window is open today. Please keep the stands, lights, and fabrics packed. Our collection agent arrives shortly." |
| **Admin System Cancellation** | Customer | "Alert: Your reservation #[ID] has been cancelled due to payment timeout. To secure your props, please submit a new request." |

---

## 7. Back-Office Administrative Framework & Role-Based Access Control (RBAC)
To protect operational integrity and prevent errors, administrative duties are divided into four clear roles:

### 7.1 Admin (Master Access)
* Full read, write, update, and delete (CRUD) authority across the entire schema.
* Manual financial ledger adjustment, absolute order cancellation rights, user profile management, and database configuration access.

### 7.2 Backend Operator (Validation Team)
* Authorized to view pending reservations and alter item attributes (e.g., swapping a 7ft ring stand for an 8ft ring stand due to balloon volume requirements).
* Can modify line item totals and issue payment requests.
* **Strict Guardrail:** Blocked from deleting records or initiating cancellations.

### 7.3 Support Staff
* Read-only access across customer manifests, delivery metrics, payment logs, and profiles.
* No system modification permissions. Primarily handles phone inquiries and customer coordination.

### 7.4 Inventory Team (Logistics & Warehouse)
* Authorized to update physical baseline numbers, log inbound stock expansions, and decommission damaged items.
* **Physical Asset Serialization:** Unique physical assets are mapped to software keys using **Unique Barcode Stickers** affixed to every ring, base, and neon prop. Scans during dispatch and return automatically update inventory status.