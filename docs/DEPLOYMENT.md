# Deployment and free-use guide

CivicFlow consists of a long-running Node.js process, a MySQL database and static frontend files. It does not require Docker, a bundler or a paid runtime.

---

## 1. Completely free local setup

This is the recommended way to run and evaluate the project.

| Component | Free option |
| --- | --- |
| Runtime | Node.js 18.18+ (Node 20/22 recommended) |
| Database | MySQL Community Server 8+ installed locally |
| Backend | Express, installed with `npm install` |
| Frontend | Served by the same Express process |
| Maps | Optional; omit the key and use the coordinate/directions fallback |

```bash
# 1. Create the database
mysql -u root -p -e "CREATE DATABASE smart_city CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p smart_city < database/schema.sql

# 2. Configure
cd backend
cp .env.example .env
# edit .env: DB_PASSWORD and JWT_SECRET

# 3. Install and run
npm install
npm start
```

Open **http://localhost:3000**.

No paid service is contacted at runtime when `GOOGLE_MAPS_API_KEY` is empty. Fonts are loaded from Google Fonts; if you need a fully offline deployment, self-host the Inter and Manrope font files and update `frontend/css/base.css` plus the `<link>` tags.

---

## 2. Local network access

To let another device on the same network use the app:

```bash
# Find your LAN address (macOS)
ipconfig getifaddr en0
```

Then open `http://<your-lan-ip>:3000` from the other device. Ensure the firewall allows port 3000. This is appropriate for a demonstration, not for exposing personal data to the public internet.

For local multi-device access, the frontend served from port 5500 works as long as the API is on port 3000 and `CLIENT_ORIGIN` includes the frontend origin:

```bash
# Terminal 1
cd backend && npm start

# Terminal 2
cd frontend && python3 -m http.server 5500
```

---

## 3. Google Maps (optional)

Without a key, CivicFlow displays the recorded address, coordinates and a Google Maps directions link. It never fabricates a map.

To enable interactive maps:

1. Create a Google Cloud project and billing account.
2. Enable **Maps JavaScript API** and, if needed, **Geocoding API**.
3. Create a **browser** API key.
4. Restrict the key by HTTP referrer to your domains, for example:
   - `http://localhost:3000/*`
   - `https://your-domain.example/*`
5. Set `GOOGLE_MAPS_API_KEY=...` in `backend/.env` and restart the API.
6. Verify `GET /api/config` reports `maps.enabled: true`.

Google Maps Platform includes a recurring free usage allowance, but it requires a billing account and its pricing/allowance can change. Check the current [Google Maps Platform pricing](https://mapsplatform.google.com/pricing/) before enabling it. Never commit a key.

---

## 4. Public hosting

Choose a host that supports:

- A long-running Node.js process (not only static/serverless functions).
- A reachable MySQL 8 database.
- Persistent disk for `backend/uploads/`, or object storage if you adapt the upload controller.
- Environment variables and HTTPS.

### Hosting patterns

| Pattern | Notes |
| --- | --- |
| Small VPS / always-free VM | Run Node, MySQL, Nginx and backups on one machine. Lowest cost, most maintenance. |
| PaaS web service + managed MySQL | Simpler operations; free tiers change frequently and managed databases may not be free. Check current limits. |
| Static frontend CDN + Node API | Possible, but configure `CLIENT_ORIGIN`, HTTPS and the frontend's API base. The bundled app assumes same-origin `:3000` unless served on 3000/80/443. |

There is no guarantee that any third-party free tier will remain free. The project itself has no license fees; hosting and Google Maps are the only potential costs.

### Minimum production environment

```dotenv
NODE_ENV=production
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=civicflow_app
DB_PASSWORD=a-long-random-password
DB_NAME=smart_city
JWT_SECRET=a-long-random-secret-at-least-32-characters
JWT_EXPIRES_IN=8h
CLIENT_ORIGIN=https://your-domain.example
GOOGLE_MAPS_API_KEY=optional-browser-key
MAX_UPLOAD_MB=5
```

Generate secrets with:

```bash
openssl rand -hex 32
```

Use a dedicated MySQL user with only the privileges the app needs:

```sql
CREATE USER 'civicflow_app'@'localhost' IDENTIFIED BY 'a-long-random-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON smart_city.* TO 'civicflow_app'@'localhost';
FLUSH PRIVILEGES;
```

Run schema migrations with a separate administrative account.

### Provision the first administrator

```bash
cd backend
ADMIN_PASSWORD='use-a-password-manager' npm run create-admin -- \
  --email admin@your-domain.example \
  --name "City Administrator"
```

Do not seed administrators in SQL or expose a public admin registration path.

---

## 5. Reverse proxy and HTTPS

Example Nginx configuration:

```nginx
server {
  listen 80;
  server_name your-domain.example;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name your-domain.example;

  ssl_certificate     /etc/letsencrypt/live/your-domain.example/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain.example/privkey.pem;

  client_max_body_size 6m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

In production Express sets `trust proxy`, so rate limiting and IP audit fields use the forwarded address. Keep `CLIENT_ORIGIN` limited to the real origin.

---

## 6. Process supervision

Example systemd unit:

```ini
[Unit]
Description=CivicFlow API and portal
After=network.target mysql.service

[Service]
Type=simple
User=civicflow
WorkingDirectory=/opt/civicflow/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now civicflow
sudo journalctl -u civicflow -f
```

`pm2` is a valid alternative if you prefer it.

---

## 7. Storage and backups

Back up both the database and uploaded photos:

```bash
# Database
mysqldump -u root -p --single-transaction smart_city | gzip > smart_city_$(date +%F).sql.gz

# Uploads
tar -czf civicflow_uploads_$(date +%F).tar.gz backend/uploads/
```

- Store backups off the application server.
- Test a restore before relying on the backup.
- Restrict `backend/uploads/` permissions; it is not served by Express.
- Complaint photos are delivered through `GET /api/issues/:id/photo` with an authenticated, owner/staff check.

---

## 8. Production checklist

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` is random and at least 32 characters
- [ ] Database uses a least-privilege user
- [ ] HTTPS terminates at the proxy and redirects from HTTP
- [ ] `CLIENT_ORIGIN` lists only trusted origins
- [ ] Google Maps key is browser-restricted and API-restricted
- [ ] `backend/.env` is not readable by other users and is not in version control
- [ ] Uploads directory is outside the web root and backed up
- [ ] Rate limits are appropriate for your traffic
- [ ] Backups are scheduled and restore-tested
- [ ] Error logs are monitored
- [ ] Administrator and officer accounts use strong, unique passwords
- [ ] Inactive accounts are deactivated rather than deleted
- [ ] Dependency updates are reviewed (`npm audit`, `npm outdated`)
- [ ] The smoke suite passes against a staging database

---

## 9. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Server exits immediately | `JWT_SECRET` missing or shorter than 32 characters |
| `ER_ACCESS_DENIED_ERROR` | Wrong `DB_USER`/`DB_PASSWORD` or missing grants |
| `ECONNREFUSED` to MySQL | MySQL not running or wrong host/port |
| Login works locally but not through proxy | Check HTTPS, `CLIENT_ORIGIN` and forwarded headers |
| Maps do not render | Key missing, referrer restriction wrong, or API not enabled |
| Photos fail in production | Upload directory not writable or lost after redeploy; mount persistent storage |
| Rate limits trigger too early | Proxy IPs are not being forwarded, or the limit is too low for the deployment |

For application-level problems, see [TESTING.md](TESTING.md).
