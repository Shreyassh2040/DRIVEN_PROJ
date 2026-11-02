# Testing and QA

CivicFlow has two testing layers:

1. A dependency-free API smoke suite that runs against a disposable MySQL database.
2. A manual browser checklist covering roles, responsive states, accessibility and data honesty.

---

## Automated smoke suite

```bash
cd backend
npm test
```

The suite uses the same `DB_*` credentials as the application from `backend/.env`. It:

- Drops and recreates `smart_city_test`.
- Loads `database/schema.sql` with the database name substituted.
- Inserts a temporary administrator hash directly into the test database.
- Starts the Express app on an ephemeral port.
- Runs the assertions against the real MySQL schema.
- Closes the server and drops the test database at the end.

The production database (`smart_city`) is never touched.

### Expected output

```text
Preparing disposable test database…
  ✓ health endpoint reports a database connection
  ✓ public registration forces the citizen role
  …
  ✓ unknown API routes return a JSON 404

24 passed, 0 failed.
```

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `TEST_DB_NAME` | `smart_city_test` | Disposable test database name |
| `KEEP_TEST_DB` | unset | Set to `1` to keep the test database after the run |

```bash
# Keep the database for inspection
KEEP_TEST_DB=1 npm test

# Use a different disposable name
TEST_DB_NAME=civicflow_ci npm test
```

The MySQL account needs `CREATE DATABASE` and `DROP DATABASE` privileges. If your production account does not have them, run the suite with a local development account.

### Coverage

The suite verifies:

- Health and database connectivity.
- Citizen registration and forced `citizen` role.
- Duplicate registration, invalid login and session identity.
- Citizen denial on admin/officer endpoints.
- Administrator login and officer provisioning.
- Officer denial on administrator endpoints.
- Complaint creation, tracking-code format, validation and ownership.
- Foreign-citizen access denial.
- Staff queue, statistics, assignment and status transitions.
- Resolution requirements and notification delivery.
- Poll creation, public visibility, one-vote rule, option locking and closed-poll rejection.
- Administrator denial of citizen-only actions.
- Service category creation, service creation/update/deactivation and invalid category rejection.
- Category deletion protection while services exist.
- Admin dashboard, analytics, activity log and CSV export.
- Settings update and validation.
- Last-administrator protection and account deactivation/reactivation.
- JSON 404 behaviour.

---

## Manual browser checklist

Run through this checklist after backend or frontend changes. Use a fresh database or the smoke test database when you do not want to modify live records.

### Public experience

- [ ] Landing page loads with live statistics only; with an empty database it shows honest empty/zero states.
- [ ] Service search, category filter, area filter and sorting work; no service is invented.
- [ ] Service detail shows address, phone, hours, category and map fallback when `GOOGLE_MAPS_API_KEY` is empty.
- [ ] Login and registration forms validate inline and show server errors without losing entered data.
- [ ] Registering with a `role` value in dev tools still creates a citizen.
- [ ] `404.html` renders for an unknown route.
- [ ] Skip-to-content link works with the keyboard.

### Citizen

- [ ] Dashboard shows real complaint and poll counts, recent items and empty states.
- [ ] Submit a complaint with and without a photo; verify the tracking ID appears.
- [ ] Optional geolocation fills coordinates only after browser permission.
- [ ] My complaints search, status filter and pagination work.
- [ ] Complaint detail shows status, timeline, photo (if any) and official updates.
- [ ] A citizen cannot open another citizen's complaint by editing the URL.
- [ ] Open poll accepts one vote; a second attempt is rejected with a clear message.
- [ ] Closed/scheduled polls cannot be voted on.
- [ ] Notifications mark as read individually and all at once.
- [ ] Profile update persists; password change requires the current password.

### Officer

- [ ] Officer login lands on the officer console; citizen/admin tokens are redirected by the shell guard.
- [ ] Overview metrics, trend and performance match the API.
- [ ] Queue search and filters combine correctly; pagination resets under a new filter.
- [ ] Complaint drawer loads detail, map fallback, protected photo and timeline.
- [ ] Assigning an officer updates the assignment and notifies the officer.
- [ ] Status transitions require a resolution summary or rejection note as appropriate.
- [ ] Public and internal comments behave differently in the citizen timeline.
- [ ] Empty queue, filtered-empty and error states are readable and retryable.

### Administrator

- [ ] All nine tabs open through the hash navigation and load lazily.
- [ ] Overview, complaints, users, officers, services, polls, analytics, activity and settings render without console errors.
- [ ] User role/status changes show confirmation and refresh the row.
- [ ] The current administrator cannot demote or deactivate their own account.
- [ ] Officer create/edit modal validation works; password is required only on create.
- [ ] Service create/edit/deactivate and category create/edit/toggle/delete work.
- [ ] Category deletion is blocked while services reference it.
- [ ] Poll create/edit/close/delete works; options lock after the first vote.
- [ ] Analytics range selector updates all charts.
- [ ] Activity filters and pagination work; details are readable.
- [ ] Settings save and reload; invalid support email is rejected.
- [ ] CSV export downloads with the active status/category filters.

### Responsive layout

Check at approximately:

| Width | Target |
| --- | --- |
| 1440 px | Desktop, full sidebar and multi-column dashboards |
| 1024 px | Small desktop/large tablet |
| 768 px | Tablet, stacked panels, sidebar drawer |
| 390 px | Mobile, single column, no horizontal page overflow |

- [ ] Sidebar toggle opens/closes and closes on navigation.
- [ ] Tables switch to labelled stacked rows instead of clipping.
- [ ] Modals and drawers fit the viewport and scroll internally.
- [ ] Filter bars wrap instead of overflowing.
- [ ] Charts remain readable and labelled.
- [ ] Buttons meet a comfortable touch target.

### Accessibility

- [ ] Every interactive element is keyboard reachable.
- [ ] Visible focus styles are present.
- [ ] Form controls have associated labels and `aria-invalid`/error text where applicable.
- [ ] Dialogs use native `<dialog>` and return focus sensibly.
- [ ] Icons that convey meaning have accessible names; decorative icons are hidden.
- [ ] Status is conveyed by text as well as colour.
- [ ] The page has one `h1` and logical heading order.
- [ ] Toasts use `role="status"` or `role="alert"` appropriately.
- [ ] No keyboard trap in sidebar, menus or dialogs.

### Data honesty and security

- [ ] No page displays a hardcoded complaint, user, service, poll or statistic.
- [ ] With zero records, empty states appear instead of fake samples.
- [ ] With no Maps key, the UI shows coordinates/address/directions, never a fake map.
- [ ] A citizen cannot reach admin APIs with a modified client.
- [ ] A deactivated account is signed out on its next request.
- [ ] Uploaded photos require a valid token; the upload directory is not publicly served.
- [ ] Rate limits return `429` after sustained requests.
- [ ] SQL errors are not exposed in responses.

---

## Manual API checks

```bash
# Health
curl -s http://localhost:3000/api/health | node -pe "JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')), null, 2)"

# Public live statistics
curl -s http://localhost:3000/api/stats

# Service taxonomy
curl -s http://localhost:3000/api/service-categories

# Register and login
curl -s -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"QA Citizen","email":"qa@example.com","password":"password123"}'

curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"qa@example.com","password":"password123"}'
```

Use the returned token as `Authorization: Bearer <token>` for authenticated checks.

---

## Browser verification notes

A headless Chrome pass is useful for catching client-side errors that static checks miss. The administration console was verified with Chrome DevTools Protocol against the live schema:

- Overview metrics, trend, recent complaints, performance and activity render.
- All nine tabs load and remain navigable through hashes.
- Complaint drawer renders status, assignment and comment forms, map fallback and timeline.
- Officer, service, category and poll modals open with bound fields.
- At 390 px there is no horizontal page overflow and the sidebar toggle is visible.
- No browser console errors were recorded on the administration pages after the shell navigation fix.

To repeat a browser check manually, sign in as an administrator and open:

```text
http://localhost:3000/admin-dashboard.html
```

Then click every tab, open a complaint, open each creation modal, and check the dev-tools console.

---

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `Set a JWT_SECRET…` on start | `backend/.env` has a secret of at least 32 characters |
| `ECONNREFUSED` / database unavailable | MySQL is running and `DB_*` values are correct |
| Smoke suite cannot create database | MySQL user needs `CREATE DATABASE` / `DROP DATABASE` |
| `403` for a valid token | Account is inactive or has a different role than required |
| Map area is blank | Expected without a key; verify the coordinate/directions fallback is shown |
| CSV download fails | Send the request with a valid bearer token; admin role required |
| Frontend API calls fail on port 5500 | Start the API on port 3000 and include `http://localhost:5500` in `CLIENT_ORIGIN` |
