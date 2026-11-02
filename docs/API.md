# CivicFlow API reference

Base URL when using the bundled Express server:

```text
http://localhost:3000/api
```

All payloads are JSON unless noted. Authenticated endpoints expect:

```http
Authorization: Bearer <jwt>
```

---

## Response envelope

Success:

```json
{
  "success": true,
  "data": { },
  "message": "Optional human-readable message."
}
```

Error:

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": {
    "email": "Enter a valid email address."
  }
}
```

`errors` is present for field-level validation failures. Common status codes:

| Code | Meaning |
| --- | --- |
| `200` | Success |
| `201` | Resource created |
| `400` | Malformed identifier or request |
| `401` | Missing, invalid or expired token |
| `403` | Authenticated but not allowed, or deactivated account |
| `404` | Resource not found |
| `409` | Conflict (duplicate email, duplicate vote, options locked, etc.) |
| `422` | Validation failure or protected state transition |
| `429` | Rate limit exceeded |
| `503` | Database unavailable |

Paged endpoints accept `page` (default `1`) and `limit`, and return:

```json
{
  "pagination": {
    "page": 1,
    "limit": 15,
    "total": 42,
    "pages": 3
  }
}
```

Dates are stored and returned in UTC (`YYYY-MM-DD HH:MM:SS` or ISO strings depending on the MySQL driver path). The frontend normalises both forms.

---

## Health, statistics and configuration

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Database connectivity and service status |
| `GET` | `/stats` | Public | Live citizen, service, complaint, resolution and active-poll counts |
| `GET` | `/config` | Public | Public settings, Google Maps availability and upload limit |

`GET /config` does not expose private settings. It returns `maps.enabled` and, when configured, the browser-restricted Maps key.

---

## Authentication

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | Public | Create a citizen account |
| `POST` | `/auth/login` | Public | Exchange credentials for a JWT |
| `GET` | `/auth/me` | Any role | Current account |
| `POST` | `/auth/change-password` | Any role | Change the signed-in account password |

### Register

```json
{
  "full_name": "Amina Khan",
  "email": "amina@example.com",
  "password": "at-least-8-characters"
}
```

Any supplied `role` is ignored. The created account is always `citizen`.

Response `201`:

```json
{
  "success": true,
  "data": {
    "token": "…",
    "user": {
      "id": 7,
      "full_name": "Amina Khan",
      "email": "amina@example.com",
      "role": "citizen"
    }
  },
  "message": "Account created. Welcome to CivicFlow."
}
```

### Login

```json
{ "email": "amina@example.com", "password": "at-least-8-characters" }
```

### Change password

```json
{
  "current_password": "old-password",
  "new_password": "new-password-of-at-least-8-characters"
}
```

---

## Profile

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/users/profile` | Any role | Read the signed-in profile |
| `PUT` | `/users/profile` | Any role | Update full name and phone |

```json
{
  "full_name": "Amina Khan",
  "phone": "+1 555 0100"
}
```

---

## Service directory

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/services` | Public | List active services |
| `GET` | `/services/search` | Public | Alias of the list endpoint for search |
| `GET` | `/services/meta` | Public | Areas and categories with service counts |
| `GET` | `/services/:id` | Optional | Service detail and related services |
| `POST` | `/services` | Admin | Create a service |
| `PUT` | `/services/:id` | Admin | Update a service |
| `DELETE` | `/services/:id` | Admin | Deactivate a service (record preserved) |

List query parameters:

| Parameter | Description |
| --- | --- |
| `q` | Name, description, address or area search |
| `category` | Category slug |
| `area` | Exact area filter |
| `sort` | `name`, `newest`, `updated` or distance sorting when coordinates are supplied |
| `lat`, `lng` | Coordinates for distance sorting/display |
| `page`, `limit` | Pagination (`limit` max `60`) |
| `include_inactive=1` | Admin only; include inactive services |

Create/update body:

```json
{
  "name": "Central Community Health Centre",
  "category": "health",
  "description": "Primary care and preventive health services.",
  "address": "12 Civic Avenue",
  "area": "Central Ward",
  "phone": "+1 555 0123",
  "opening_hours": "Mon–Fri, 8:00–17:00",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "is_active": true
}
```

`latitude` and `longitude` must be supplied together and fall within valid ranges. `is_active` is used on update.

---

## Service categories

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/service-categories` | Optional | List active categories and service counts |
| `GET` | `/service-categories?all=1` | Admin | Include inactive categories |
| `POST` | `/service-categories` | Admin | Create a category |
| `PUT` | `/service-categories/:id` | Admin | Update a category |
| `DELETE` | `/service-categories/:id` | Admin | Delete an unused category |

Create body:

```json
{
  "name": "Parks and recreation",
  "slug": "parks",
  "description": "Public gardens, playgrounds and sports facilities.",
  "icon": "pin",
  "sort_order": 85,
  "is_active": true
}
```

`slug` is lowercase letters, numbers, hyphens or underscores and cannot be changed after creation. A category that still has services cannot be deleted (`409`).

---

## Complaints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/issues` | Citizen | Submit a complaint |
| `GET` | `/issues/my` | Any role | List the signed-in reporter's complaints |
| `GET` | `/issues/:id` | Owner or staff | Complaint detail |
| `GET` | `/issues/:id/history` | Owner or staff | Timeline, comments and assignment history |
| `GET` | `/issues/:id/photo` | Owner or staff | Protected image bytes |

### Submit a complaint

Send `multipart/form-data`:

| Field | Required | Notes |
| --- | --- | --- |
| `title` | Yes | 4–180 characters |
| `category` | Yes | `pothole`, `garbage`, `streetlight`, `water_supply`, `drainage`, `road_damage`, `other` |
| `description` | Yes | At least 10 characters |
| `address` | Yes* | Required unless coordinates are supplied |
| `area` | No | Locality or ward |
| `latitude`, `longitude` | No | Must be supplied together |
| `photo` | No | Image, maximum size from `MAX_UPLOAD_MB` |
| `priority` | No | `low`, `medium`, `high`; defaults to `medium` |

The server generates a unique tracking code in the form `SC-YYYY-XXXXXXXX`. Response `201`:

```json
{
  "success": true,
  "data": {
    "issue": {
      "id": 31,
      "tracking_code": "SC-2026-7F3A91C2",
      "title": "Broken streetlight",
      "status": "submitted",
      "status_label": "Submitted",
      "category": "streetlight",
      "category_label": "Street lighting"
    }
  },
  "message": "Complaint submitted successfully."
}
```

### Detail and history

`GET /issues/:id` returns `{ "complaint": { … } }`.

Citizens receive their own complaint only; staff receive reporter contact details. The history endpoint returns:

```json
{
  "events": [],
  "history": [],
  "comments": [],
  "assignments": [],
  "current_status": "in_progress"
}
```

`events` is the merged chronological timeline, including internal notes for staff.

Use `GET /issues/:id/photo` with the bearer token; it returns image bytes, not JSON.

---

## Officer operations

All routes require `officer` or `admin`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/officer/complaints` | Complaint queue |
| `GET` | `/officer/complaints/:id` | Complaint drawer detail |
| `PATCH` | `/officer/complaints/:id/status` | Change status |
| `POST` | `/officer/complaints/:id/assign` | Assign or reassign |
| `POST` | `/officer/complaints/:id/comments` | Add public or internal update |
| `GET` | `/officer/officers` | Active officers and workloads |
| `GET` | `/officer/stats` | Summary, categories, areas, priorities, trend, performance |

Queue filters:

| Parameter | Description |
| --- | --- |
| `q` | Tracking ID, title, address, reporter |
| `status` | `submitted`, `in_progress`, `resolved`, `rejected` |
| `priority` | `low`, `medium`, `high` |
| `category` | Complaint category |
| `area` | Area text |
| `assigned` | `unassigned` or an officer ID |
| `from`, `to` | Date range |
| `page`, `limit` | Pagination (`limit` max `100`) |

### Status update

```json
{
  "status": "resolved",
  "note": "Luminaire replaced and circuit tested.",
  "resolution_summary": "Replaced the failed luminaire and tested the circuit."
}
```

Rules:

- `rejected` requires a note.
- `resolved` requires `resolution_summary` of at least 10 characters.
- Repeating the current status is rejected.
- The reporter receives a notification for citizen-visible changes.
- A status-history row and an audit record are written.

### Assignment

```json
{
  "officer_id": 4,
  "note": "Please inspect before Friday."
}
```

The officer must be active and have the `officer` role.

### Comment

```json
{
  "comment": "Inspection scheduled for tomorrow morning.",
  "visibility": "public"
}
```

`visibility` is `public` or `internal`. Internal comments are visible only to staff.

---

## Administrator operations

All routes require `admin`.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/admin/dashboard` | Overview metrics, trend, recent complaints, recent activity |
| `GET` | `/admin/complaints` | Full complaint queue (same filters as officer queue) |
| `GET` | `/admin/users` | Account directory |
| `GET` | `/admin/users/:id` | Account detail |
| `PATCH` | `/admin/users/:id/role` | Change role |
| `PATCH` | `/admin/users/:id/status` | Activate/deactivate |
| `GET` | `/admin/officers` | Officer accounts and workloads |
| `POST` | `/admin/officers` | Provision an officer |
| `PUT` | `/admin/officers/:id` | Update an officer |
| `GET` | `/admin/analytics` | Period analytics and officer/poll reports |
| `GET` | `/admin/activity-logs` | Audit log |
| `GET` | `/admin/settings` | Platform settings |
| `PUT` | `/admin/settings` | Update platform settings |
| `GET` | `/admin/reports/complaints.csv` | Download complaint CSV |

### Users

`GET /admin/users` filters: `q`, `role`, `status` (`active`/`inactive`), `page`, `limit`.

Role change:

```json
{ "role": "officer" }
```

Status change:

```json
{ "is_active": false }
```

Safeguards:

- You cannot deactivate your own account.
- The last active administrator cannot be demoted or deactivated.
- A deactivated account cannot sign in.
- An officer with open assignments cannot be demoted until work is reassigned.

### Officers

Create:

```json
{
  "full_name": "Jordan Lee",
  "email": "jordan.lee@city.gov",
  "password": "temporary-password",
  "department": "Roads and lighting",
  "phone": "+1 555 0199"
}
```

Update:

```json
{
  "full_name": "Jordan Lee",
  "department": "Roads and lighting",
  "phone": "+1 555 0199",
  "is_active": true
}
```

### Analytics

`GET /admin/analytics?days=90`

`days` accepts `30`, `90`, `365` or `0` (all time). The response includes:

```json
{
  "range_days": 90,
  "summary": {
    "total": 0,
    "submitted": 0,
    "in_progress": 0,
    "resolved": 0,
    "rejected": 0,
    "resolution_rate": 0,
    "avg_resolution_hours": null,
    "avg_update_hours": null
  },
  "trend": [],
  "categories": [],
  "areas": [],
  "priorities": [],
  "service_categories": [],
  "service_areas": [],
  "polls": { "participation": [] },
  "officers": [],
  "citizens_trend": []
}
```

Chart series use `{ "key" | "label", "value" }` objects.

### Activity log

Filters: `q`, `entity_type`, `action` prefix, `from`, `to`, `page`, `limit`.

The response also includes `entity_types` for filter menus.

### Settings

Readable/writable keys:

- `platform_name`
- `city_name`
- `tagline`
- `support_email`
- `support_phone`
- `office_address`

The read response includes `public_keys` and `maps_enabled`.

### CSV export

`GET /admin/reports/complaints.csv?status=resolved&category=pothole`

Returns `text/csv` with a protected `Authorization: Bearer` request. Supported filters: `status`, `category`.

---

## Community polls

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/polls` | Optional | List polls visible to the viewer |
| `GET` | `/polls/:id` | Optional | Poll detail and results |
| `GET` | `/polls/:id/results` | Optional | Same as detail |
| `POST` | `/polls` | Admin | Create a poll |
| `PUT` | `/polls/:id` | Admin | Update a poll |
| `POST` | `/polls/:id/close` | Admin | Close voting |
| `DELETE` | `/polls/:id` | Admin | Delete a poll with no votes |
| `POST` | `/polls/:id/vote` | Citizen | Cast one vote |

Citizens see open, scheduled and date-ended polls. Explicitly closed polls (`is_active = 0`) are hidden from the citizen list. Staff can retrieve them with `?all=1`.

Create/update:

```json
{
  "title": "Which street should be repaired first?",
  "description": "Help the city prioritise the next repair cycle.",
  "starts_at": "2026-11-05T09:00",
  "ends_at": "2026-11-20T18:00",
  "options": ["Cedar Avenue", "Birch Street", "Maple Lane"],
  "is_active": true
}
```

Rules:

- Title 5–180 characters; description up to 2000.
- 2–8 unique options, each up to 180 characters.
- Options cannot be changed after the first vote (`409`).
- Polls with votes cannot be deleted.
- `starts_at` and `ends_at` are optional; if both exist, the end must be after the start.
- Voting on a scheduled, closed or date-ended poll is rejected.

Vote body:

```json
{ "option_id": 12 }
```

One vote per citizen per poll is enforced by `poll_votes.unique_user_poll`. A second vote returns `409`.

---

## Notifications

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/notifications` | List notifications and unread count |
| `GET` | `/notifications/unread-count` | Lightweight unread count |
| `PATCH` | `/notifications/:id/read` | Mark one as read |
| `PATCH` | `/notifications/read-all` | Mark all as read |

Query: `page`, `limit`, `unread=1` (where supported by the dashboard client).

---

## Rate limits

| Scope | Limit |
| --- | --- |
| Authentication | 30 requests / 15 minutes / IP |
| Complaint creation | 25 requests / 15 minutes / IP |
| Poll votes | 30 requests / 5 minutes / IP |
| Global API | 1200 requests / 15 minutes / IP |

Rate-limited responses return `429` with a JSON message.

---

## Quick curl examples

```bash
# Health
curl http://localhost:3000/api/health

# Register a citizen
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"full_name":"Amina Khan","email":"amina@example.com","password":"password123"}'

# Login and store the token
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"amina@example.com","password":"password123"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).data.token")

# Submit a complaint
curl -X POST http://localhost:3000/api/issues \
  -H "Authorization: Bearer $TOKEN" \
  -F 'title=Broken streetlight' \
  -F 'category=streetlight' \
  -F 'description=The light outside the library has been dark for three nights.' \
  -F 'address=Cedar Avenue, outside the library' \
  -F 'area=Cedar Ward'

# Officer queue
curl http://localhost:3000/api/officer/complaints?status=submitted \
  -H "Authorization: Bearer $OFFICER_TOKEN"
```
