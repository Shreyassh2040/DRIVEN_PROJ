# Project modules

CivicFlow is organised around three role-specific experiences that share one Express API and one MySQL schema.

## 1. Identity and access

- Public citizen registration; officer and administrator accounts are provisioned by authorised workflows.
- bcryptjs password hashing and JWT bearer sessions.
- Every protected request reloads the account from MySQL, so role changes and deactivation apply immediately.
- Backend role guards: citizen-only complaints and votes, staff-only complaint operations, administrator-only management.

## 2. Service discovery

- Dynamic service categories with icons and ordering.
- Public search by name, description, address and area.
- Category and area filters, pagination, optional distance sorting.
- Service detail with related services, contact details and map/coordinate fallback.
- Administrators publish, edit and deactivate services without deleting history.

## 3. Civic reporting

- Validated complaint submission with optional photo and geolocation.
- Server-generated tracking code (`SC-YYYY-XXXXXXXX`).
- Priority, category, address/coordinates and reporter ownership.
- Citizens see only their own complaints; staff see the full queue.
- Protected photo delivery through an authenticated endpoint.

## 4. Complaint operations

- Officer queue with search, combined filters, pagination and summary counts.
- Assignment to active officers, with an assignment audit trail.
- Status transitions (`submitted`, `in_progress`, `resolved`, `rejected`) with mandatory resolution or rejection notes.
- Public updates and internal staff notes.
- Merged timeline from status history, comments and assignments.
- Notifications for citizens and officers.
- Performance reporting: resolution rate, average resolution time, workload.

## 5. Community participation

- Administrators create scheduled or immediately active polls.
- 2–8 unique options; options lock after the first vote.
- One vote per citizen per poll, enforced by a database unique key.
- Scheduled and closed polls reject votes.
- Results and participation appear in the admin analytics tab.

## 6. Administration

- Overview: live complaint, account, service and poll totals; six-month trend; recent activity.
- Complaints: full oversight queue and the same operational drawer as officers.
- Users: search, role changes and activation/deactivation with last-administrator protection.
- Officers: provision accounts, update departments/contact details, activate/deactivate.
- Services and categories: full catalogue management.
- Polls: create, edit, close and delete where no votes exist.
- Analytics: period filters, trends, category/area/priority breakdowns, officer performance and poll participation.
- Activity: searchable audit log with entity/date filters.
- Settings: city identity and public support details.
- CSV complaint export.

## 7. Platform services

- Central API client with token storage, JSON/FormData handling, blob photos and CSV downloads.
- Shared authenticated shell: role guard, responsive sidebar, topbar, notification menu, profile menu and sign-out.
- Shared UI kit: toasts, dialogs, drawers, confirmations, validation, empty/error/loading states, responsive tables, pagination, timelines and metric cards.
- Custom SVG charts with accessible labels and empty states.
- Optional Google Maps integration; coordinate and directions fallback when no key exists.
- Audit logging, rate limiting, Helmet CSP, CORS allow-list and parameterised SQL.

## Data honesty

Platform statistics, services, complaints, polls, notifications and analytics are read from the database. Empty databases show empty states rather than invented records. Only the taxonomy (service categories) and public setting defaults are seeded.

## Suggested demonstration flow

1. Register a citizen and submit a complaint with a photo.
2. Sign in as an officer, assign the complaint to yourself or another officer, move it to `in_progress`, then resolve it with a summary.
3. Sign back in as the citizen and review the status, notification and timeline.
4. Create a poll as an administrator, vote as a citizen, then close the poll and confirm further votes are rejected.
5. Publish a service and category, then inspect it on the public directory.
6. Open Administration → Analytics and Activity to show the operational and audit views.

## Suggested viva explanation

The platform separates the public service directory from private complaint operations. Citizens can report and follow their own issues but cannot read other citizens' data. Officers receive role-scoped operational tools, while administrators manage accounts, the catalogue and platform configuration. The backend is the source of truth for authorisation, validation and state transitions; MySQL constraints and audit tables provide integrity and accountability.
