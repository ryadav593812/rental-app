# Azure FinOps Self-Service Portal — Requirements Specification

**Document type:** Engineering requirements (feed to AI coding assistant — Cursor / Kiro)
**Status:** Draft v1
**Owner system:** FastMCP FinOps server (32 tools) on AKS, workload identity, Reader on all subscriptions
**Data source:** ADLS Gen2, Apache Parquet, FOCUS schema (also feeds existing Power BI dashboards)

---

## 1. Purpose

Build a self-service portal that lets subscription owners (organized into project teams) onboard their Azure subscriptions, request membership in a project-based access group, and generate **Executive** or **Detailed** cost reports scoped strictly to the subscriptions their project group owns — without ever exposing data from subscriptions outside their access.

The existing FastMCP server already has broad Reader access to all subscriptions via AKS workload identity. **This portal does not change that.** It adds an authorization layer in front of the MCP that resolves and enforces per-user scope before any tool call executes.

---

## 2. Core Authorization Model

### 2.1 Principle

> A user's effective subscription scope = the **union of subscriptions** mapped to every Entra ID security group the user is a member of.

There is no separate "VP role" or tiered role flag. Breadth of access emerges naturally from group membership count. A user in 1 project group sees that project's subscriptions. A user in 10 project groups sees the union of all 10.

### 2.2 Entities

| Entity | Description |
|---|---|
| **Project Group** | An Entra ID Security Group, one per project/team (e.g. `sg-finops-qflow`). Created via this portal during onboarding. |
| **Subscription** | An Azure subscription ID, mapped to exactly the project group(s) that legitimately own/use it. |
| **Group-to-Subscription Mapping** | Stored in the portal's own database. One project group → N subscriptions. |
| **User** | An Entra ID identity. Effective scope = union of subscriptions across all project groups they belong to. |

### 2.3 What this portal does NOT do

- Does NOT grant Azure RBAC (Reader/Contributor/Owner) on subscriptions. The MCP's workload identity already has that.
- Does NOT trust any subscription_id passed directly by a user or a steering file without server-side validation against resolved scope.
- Does NOT allow a user to self-declare unverified ownership of a subscription without an approval step.

---

## 3. Personas

| ID | Persona | Description |
|---|---|---|
| P1 | **Subscription Owner / Project Member** | Belongs to one or more project groups. Can request onboarding of new subscriptions to their group, request to join existing groups, and generate Executive/Detailed reports scoped to their group(s)' subscriptions. |
| P2 | **Project Lead / Group Owner** | A subscription owner promoted to approve membership requests for their specific project group(s). |
| P3 | **FinOps Admin** | Platform admin. Approves new project group creation, approves cross-checks where no Azure RBAC signal exists, manages mapping table, views audit logs, has implicit access to all groups for support purposes (logged separately, not a silent bypass). |
| P4 | **VP / Multi-Project Stakeholder** | Not a distinct role — simply a user added as a member to multiple project groups (e.g. 10 groups → union of all their subscriptions). Same UI and permissions model as P1, just broader resolved scope. |

---

## 4. Modules

### M1 — Authentication & Scope Resolution

- M1.1: Portal authenticates users via Microsoft Entra ID (MSAL, OIDC).
- M1.2: On login, backend calls Microsoft Graph (`/me/transitiveMemberOf` or `/users/{id}/transitiveMemberOf`) to retrieve the user's Entra group memberships.
- M1.3: Backend filters returned groups to only those matching the `sg-finops-*` naming convention (or a tagged extension attribute) to isolate project groups from unrelated org groups.
- M1.4: Backend joins filtered groups against the internal Group-to-Subscription Mapping table to compute the user's resolved scope (union of subscription IDs).
- M1.5: Resolved scope is computed fresh on every session/login — not cached indefinitely — so membership changes take effect promptly (target: within one session refresh cycle, configurable TTL e.g. 15 min).
- M1.6: Resolved scope is never sent to or trusted from the client. It is held server-side and attached to every backend request as authoritative context.

### M2 — Subscription & Project Group Onboarding (NEW — self-service)

This is the core new capability: a user can onboard a subscription that has never been registered before, without a FinOps admin manually creating the group ahead of time.

- M2.1: Portal exposes an **"Onboard Subscription"** form, fields:
  - Subscription ID (GUID, validated format)
  - Subscription display name (optional, free text — or auto-resolved server-side, see M2.4)
  - Project/Group name (free text — used to derive the Entra group name, e.g. `qflow` → `sg-finops-qflow`)
  - Initial members to add to the group (list of UPNs/emails, max 20 per the Graph API single-call constraint — see Constraint C1)
  - Requestor's justification / business reason (free text, stored for audit)
- M2.2: On submit, backend validates:
  - Subscription ID is a valid GUID and not already mapped to an *different* existing project group (a subscription should map to exactly one project group; flag and block duplicate onboarding attempts — route to FinOps Admin for resolution if a genuine conflict exists)
  - Each member entered resolves to a real Entra ID user via Graph lookup (`/users/{upn}`) before group creation — reject unresolvable entries with a clear error, don't silently drop them
- M2.3: **Verification step (recommended, configurable):** before auto-approving, backend attempts to verify the requestor has a legitimate relationship to the subscription by checking Azure RBAC role assignments on that subscription using the **requestor's own delegated token** (not the MCP's workload identity) against ARM (`GET /subscriptions/{id}/providers/Microsoft.Authorization/roleAssignments`). If the requestor holds Owner/Contributor/Reader on the subscription, auto-approve. If not, route to FinOps Admin (P3) for manual approval.
- M2.4: On approval (auto or manual), backend triggers group creation:
  - Calls Microsoft Graph `POST /groups` to create a new Security Group named per convention (e.g. `sg-finops-<project>`)
  - **Owners and members must be specified in the same creation call.** Per Graph API behavior, a security group created via application permissions without owners is created anonymously and becomes unmodifiable afterward — this must never happen. (Constraint C2)
  - Initial members from the onboarding form are added in this same call (subject to the 20-relationship cap per call — Constraint C1). If more than 20 members are submitted, create the group with the first 20 and queue the remainder for a follow-up `POST /groups/{id}/members/$ref` batch call.
  - The requestor is set as a group **Owner** (not just member) so they can independently manage membership going forward without needing Entra ID admin rights, where Entra ID group-owner self-service permissions allow it.
- M2.5: Backend writes the new mapping: `project_group_id (Entra group object ID) → [subscription_id]` into the internal mapping DB.
- M2.6: Confirmation emailed to requestor (and FinOps Admin if manual approval was required) with group name, subscription, and member list.
- M2.7: **Idempotency:** if the same subscription is submitted twice before approval completes, the second submission must be detected and rejected/merged, not create a duplicate group.

### M3 — Join Existing Project Group (self-service membership request)

- M3.1: User can browse a list of existing project groups (names only — not their subscription details, to avoid scope leakage to non-members) and request to join.
- M3.2: Request routes to the project group's Owner(s) (P2) for approval, not auto-approved, since group membership directly grants cost-data visibility.
- M3.3: On approval, backend calls Graph `POST /groups/{id}/members/$ref` to add the user.
- M3.4: Rejected requests are logged with reason (optional) and requestor is notified.

### M4 — Report Generation

- M4.1: Two report types, available to any authenticated user for their resolved scope:
  - **Executive Report**: aggregated summary — total spend, trend, top-N anomalies, top consumers — across the user's full resolved scope (all subscriptions across all their project groups, unioned).
  - **Detailed Report**: granular, driven by a **steering file** (see M5) that lets the user filter to specific subscriptions/resource groups/date ranges/tool outputs within their resolved scope.
- M4.2: Reports can be generated two ways:
  - **Scheduled (monthly)**: backend job iterates all users/groups, generates and emails reports per their stored preferences.
  - **On-demand ("Run scan")**: user-triggered from the portal UI, generates fresh report synchronously or async with status polling.
- M4.3: Every report generation request — scheduled or on-demand — resolves scope server-side per M1 immediately before calling MCP tools. No report generation path may accept a client-supplied subscription list as final truth.
- M4.4: Report output formats: Executive → PDF (templated); Detailed → Excel (steering-file-driven sheets).
- M4.5: Output stored in a private blob container/prefix scoped to the requesting group; access via short-lived SAS token (recommend ≤ 24h expiry) included in the download link or email.

### M5 — Steering File Handling (Detailed Report)

- M5.1: At onboarding/first use, system generates a **pre-filled steering file template** for the user containing only their resolved scope's subscription IDs (so they edit within a fence, not a blank slate).
- M5.2: On submission, backend validates: every subscription_id referenced in the steering file must be a subset of the user's server-resolved scope.
- M5.3: If the file references subscriptions outside scope: reject the entire submission with a clear error listing the out-of-scope IDs (do not silently strip and proceed without telling the user — they should know their request was modified). Log the rejected attempt to the audit table.
- M5.4: Final validated/intersected scope — never the raw steering file — is what gets passed to MCP tool calls.

### M6 — MCP Scope Enforcement (gateway + defense in depth)

- M6.1: A scope-enforcement gateway sits between the portal backend and the FastMCP server. Every tool call carries the resolved scope as **trusted server-side context**, injected by the gateway — never as an LLM- or user-supplied tool argument.
- M6.2: Each of the 32 MCP tools must independently validate the injected scope is present and non-empty before querying ADLS/parquet (fail closed). Tools that accept a `subscription_id` parameter must verify it is a member of the injected scope set, even if it was already filtered upstream — defense in depth, since the gateway should not be the only enforcement point.
- M6.3: `list_subscriptions()`-style tools must return only the intersection of all subscriptions with the caller's resolved scope, never the full list the workload identity can technically see.

### M7 — Audit & Logging

- M7.1: Every onboarding request, approval/rejection, group creation, membership change, report generation, and steering-file rejection is written to an append-only audit table with: `actor_user_oid, action, target (group/subscription), resolved_scope_snapshot, timestamp, outcome`.
- M7.2: FinOps Admin (P3) has a dashboard/view over the audit log, filterable by user, group, subscription, and date range.
- M7.3: Audit log is the source of truth for "who could see what, when" — required given this data feeds budget/financial decisions.

---

## 5. Known Constraints (from Microsoft Graph API — verified)

| ID | Constraint | Implication |
|---|---|---|
| C1 | A maximum of 20 owner/member relationships can be added in a single group-creation call. | Onboarding form must cap initial member list at 20, or split into create + follow-up batch add calls for the remainder. |
| C2 | Creating a group via application permission (`Group.Create`) without specifying owners creates it anonymously and unmodifiable thereafter. | Group creation call must always include at least one owner (the requestor) at creation time — never create first and add owners after. |
| C3 | To add users as group owners/members via app-only permission, the app also needs `User.Read.All` (minimum) to resolve those users. | Backend app registration needs `Group.Create`/`Group.ReadWrite.All` + `User.Read.All` as application permissions, admin-consented. |
| C4 | All group-related Graph operations require admin consent on the app registration. | A tenant admin must grant consent once during setup; factor this into rollout timeline. |
| C5 | A non-admin delegated user cannot add themselves as a group owner via delegated context in some flows. | Use **application permissions** (backend service identity) for group creation, not delegated user tokens, to reliably set the requestor as owner programmatically. |

---

## 6. High-Level Tech Stack

| Layer | Component |
|---|---|
| Identity | Microsoft Entra ID; Security Groups (`sg-finops-<project>` convention) |
| Portal frontend | React + MSAL (Entra ID auth) |
| Portal backend | Node.js or Python (FastAPI) service — handles onboarding workflow, scope resolution, Graph API calls |
| Group/Subscription mapping store | Azure SQL Database or PostgreSQL Flexible Server |
| Audit log store | Same DB (append-only table) or Azure Table Storage |
| Identity graph calls | Microsoft Graph API (`/groups`, `/users`, `/me/transitiveMemberOf`) via app-only permissions |
| MCP server | FastMCP on AKS, workload identity (unchanged), behind new scope-enforcement gateway |
| Data layer | ADLS Gen2, Parquet, FOCUS schema (unchanged) |
| Report generation | Azure Function / Container App job |
| Report output storage | ADLS Gen2 / Blob, group-scoped prefix, SAS-token download |
| Scheduled delivery | Azure Logic Apps / Timer-triggered Function + Microsoft Graph `sendMail` |
| Genie/Databricks (if used in report pipeline) | Must read from subscription-filtered views, not raw broad-access tables |

---

## 7. Required App Registration Permissions (Application/app-only)

- `Group.ReadWrite.All` (or least-privileged group-management equivalent available) — create/manage project groups
- `User.Read.All` — resolve member UPNs/emails to Entra object IDs during group creation
- `GroupMember.ReadWrite.All` — add/remove members post-creation, batch operations beyond the 20-item cap
- Delegated `User.Read` (sign-in) for the portal frontend's MSAL auth flow

All application permissions above require tenant admin consent (Constraint C4) — flag this as a setup dependency, not a runtime task.

---

## 8. Open Items / Decisions Needed Before Build

1. Should a subscription be allowed to map to **more than one** project group (shared subscriptions across teams), or strictly one group per subscription? (Spec above assumes one-to-one; flag if this is wrong.)
2. TTL for cached scope resolution (M1.5) — how fresh must access revocation be?
3. SAS token expiry window for report downloads (M4.5) — default proposed: 24 hours.
4. Does FinOps Admin (P3) need a documented "break-glass" access path to any group's data for support tickets, and should that always be logged distinctly from normal access (recommended: yes, with mandatory justification field)?
5. Genie/Databricks integration — confirm whether Genie's underlying identity also has broad cross-subscription access; if so, row-level security must be applied at the Genie-facing view layer using the same resolved-scope logic.

---

## 9. Out of Scope (this phase)

- Live chat UI for subscription owners (explicitly deferred — current scope is form-based onboarding + scheduled/on-demand report generation only).
- Changes to the MCP's underlying Azure RBAC (workload identity Reader access remains as-is).
- Power BI dashboard scoping (separate workstream, not covered by this spec).
