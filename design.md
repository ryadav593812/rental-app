# Party Props POC: Design & Development Documentation

This document outlines the architecture, development milestones, and bug fixes implemented for the Party Props Proof of Concept (POC) system.

---

## 1. System Overview
The system is a centralized platform for party decoration inventory management, user authentication, and order fulfillment. It utilizes a **Node.js/Express** backend with **Better-SQLite3** for relational data persistence.

---

## 2. Development Batches

### Batch 1: Core Database & Infrastructure
*   **Database Schema**: Initialized tables for `users`, `family_members`, `addresses`, `items`, and `orders`.
*   **Static File Serving**: Configured Express to serve the frontend interface (`index.html`, `dashboard.html`).
*   **Seeding**: Implemented automated inventory seeding for 12 core rental and consumable items, including JSON-encoded panorama image arrays.

### Batch 2: User Architecture & Auth
*   **Auth Flow**: Created endpoints for Registration, Login, and Password Resets.
*   **Relationship Management**: Built sub-profile logic for family members and address management (limit of 5 addresses per user).
*   **Session Management**: Implemented `sessionStorage` logic for client-side state persistence.

### Batch 3: Inventory Engine & Order Pipeline
*   **Dynamic Inventory Reduction**: Developed an algorithm to calculate available stock by subtracting active orders from `max_inventory` for a 3-day scheduling block (E-1, E, E+1).
*   **Checkout Engine**: Implemented order placement logic with state-tracking (`PENDING` to `COMPLETED`).
*   **Admin Dashboard**: Created API routes for order modifications and inventory adjustments.

---

## 3. Bug Fixes & Refinements

### Authentication & Profile Persistence
*   **Password Persistence**: Fixed a synchronization issue where password changes were updating local browser state but not the backend database.
*   **Update-Profile Endpoint**: Implemented a robust `PUT /api/auth/update-profile` route using database transactions to ensure atomic updates across `users`, `addresses`, and `family_members` tables.
*   **State Recovery**: Refactored `toggleProfileDrawer` to perform real-time `fetch` calls to the backend on open, ensuring the UI always reflects the database state rather than stale local memory.

### Address & Logistics Logic
*   **Default Address Selection**: Restored and improved the "Default Address" functionality. Added a star-toggle (`★`/`☆`) interaction to the UI and updated the backend logic to save the specific default index to the database.
*   **Constraint Guardrails**: Enforced a 5-address limit and added logic to clear/re-sync address records during profile updates.

### Frontend UI/UX
*   **Interactive Controls**: Added a "Family Member" addition engine with real-time input capture.
*   **Dynamic Loading**: Added pulse/loading states to the profile drawer to improve perceived performance during data synchronization.

---

## 4. Current Architecture Logic
| Component | Technology | Role |
| :--- | :--- | :--- |
| **Database** | SQLite3 | Persistent relational storage. |
| **Backend** | Node.js / Express | API request handling & logic execution. |
| **State Mgt** | `sessionStorage` | Client-side user auth state tracking. |
| **UI** | HTML / JS / Tailwind | Component-based dynamic rendering. |

---

## 5. Future Maintenance Notes
*   **Transaction Safety**: All profile updates are wrapped in `db.transaction()` to prevent partial updates.
*   **Data Integrity**: Address and Family Member tables utilize `ON DELETE CASCADE` foreign keys to ensure that deleting a user record cleans up related sub-data.
*   **Next Steps**: Resume testing flows for end-to-end checkout and admin status transitions.