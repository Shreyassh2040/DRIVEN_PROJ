CivicFlow frontend
==================

These are static HTML, CSS and vanilla JavaScript files.

Recommended: run the bundled Express server from ../backend and open
http://localhost:3000 — it serves this folder and the API together.

Standalone static hosting is also possible:

    python3 -m http.server 5500

Open http://localhost:5500/index.html. The API must be running on
http://localhost:3000 and http://localhost:5500 should be listed in
CLIENT_ORIGIN in backend/.env.

See ../README.md and ../docs/ for setup, API, database and testing details.
