# Family App

Gemeinsame Familien-App (Cloudflare Worker + D1 + Workers AI, iCloud-Kalender per CalDAV, Web Push).

- Quellcode: `src/` (server.js, app.html, sw.js)
- `python3 build.py` erzeugt `build/worker.js` (wird mit eingecheckt, Cloudflare stellt genau diese Datei bereit)
- Tests: `node test/api.test.mjs`, `roles`, `familie`, `erfassen`, `paketd`, `ui` (alle unter `test/`)
- Weitere Familie anlegen: siehe `FAMILIEN.md`
- Geheimnisse (SETUP_CODE, ICLOUD_USER, ICLOUD_PASS) liegen nur in Cloudflare, nie im Repository.
