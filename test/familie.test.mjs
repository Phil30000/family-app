// Paket A: Zugang in der App, Profile ohne Anmeldung, Farben, Tablet-Rolle, Sicherung, Aufräumen
import assert from 'node:assert/strict';
import { makeEnv, calls } from './harness.mjs';
const mod = await import('../build/worker.js');
const worker = mod.default, T = mod._test;
const env = makeEnv();
delete env.ICLOUD_USER; delete env.ICLOUD_PASS; // neue Familie: kein Zugang als Cloudflare-Geheimnis
const pending = []; const ctx = { waitUntil: (p) => pending.push(p) };
const flush = async () => { while (pending.length) await pending.shift(); };
const O = 'https://fam2.example.workers.dev';
function client() {
  let cookie = '';
  return async (path, body, method) => {
    const r = await worker.fetch(new Request(O + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', origin: O, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, ctx);
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, data: ct.includes('json') && !ct.includes('attachment') ? await r.json() : await r.text() };
  };
}
const ad = client(), tab = client();
let r;
r = await ad('/api/setup', { code: 'geheim-123', name: 'Anna', password: 'sicher123' }); assert.equal(r.status, 200);
// Familienname
r = await ad('/api/admin/family', { name: 'Familie Muster' }); assert.equal(r.status, 200);
r = await ad('/api/me'); assert.equal(r.data.family, 'Familie Muster'); assert.deepEqual(r.data.warnings, []);
assert.match(r.data.users[0].color, /^#[0-9a-f]{6}$/);
// Kalender ohne Zugang -> klare Meldung
r = await ad('/api/admin/calendars'); assert.equal(r.status, 502); assert.match(r.data.error, /iCloud-Zugang fehlt/);
r = await ad('/api/admin/calcred'); assert.equal(r.data.configured, false);
// falsches Passwort wird abgelehnt und nicht gespeichert
r = await ad('/api/admin/calcred', { user: 'philippe@example.com', pass: 'falsch-falsch' }); assert.equal(r.status, 502);
r = await ad('/api/admin/calcred'); assert.equal(r.data.configured, false);
r = await ad('/api/admin/calcred', { user: 'keine-mail', pass: 'abcd-efgh-ijkl-mnop' }); assert.equal(r.status, 400);
// richtiges Passwort (Leerzeichen wie bei Apple angezeigt werden entfernt)
r = await ad('/api/admin/calcred', { user: 'philippe@example.com', pass: 'abcd-efgh-ijkl-mnop' }); assert.equal(r.status, 200, JSON.stringify(r.data));
r = await ad('/api/admin/calcred'); assert.equal(r.data.configured, true); assert.equal(r.data.user, 'ph…@example.com', 'Passwort und volle Adresse kommen nie zurück');
const stored = await env.DB.prepare("SELECT v FROM settings WHERE k='calcred'").first();
assert.ok(!stored.v.includes('abcd-efgh'), 'Passwort liegt verschlüsselt');
r = await ad('/api/admin/calendars'); assert.equal(r.status, 200); assert.ok(r.data.calendars.length >= 1);
// mit anderem Schlüssel (andere Familie) nicht lesbar
const env2 = { ...env, SETUP_CODE: 'anderer-code' }; assert.equal(await T.getCred(env2), null);
// Profil ohne Anmeldung (Kind ohne iPhone) + Farbe
r = await ad('/api/admin/users', { name: 'Lina', role: 'kind', profil: true }); assert.equal(r.status, 200); assert.equal(r.data.link, ''); const lina = r.data.id;
r = await ad('/api/admin/users'); const L = r.data.users.find((u) => u.id === lina); assert.equal(L.profil, true); assert.equal(L.invited, false); assert.match(L.color, /^#/);
assert.notEqual(L.color, r.data.users.find((u) => u.name === 'Anna').color, 'jede Person eine eigene Farbe');
r = await ad('/api/admin/users/' + lina, { color: '#1f8a80', name: 'Lina M.' }); assert.equal(r.status, 200);
r = await ad('/api/me'); const L2 = r.data.users.find((u) => u.id === lina); assert.equal(L2.color, '#1f8a80'); assert.equal(L2.name, 'Lina M.'); assert.equal(L2.profil, true);
r = await ad('/api/prefs', { color: '#c8613a' }); r = await ad('/api/me'); assert.equal(r.data.users.find((u) => u.name === 'Anna').color, '#c8613a');
// Aufgabe an Profil zuweisen geht, Profil kann sich nicht anmelden
r = await ad('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'e-l1', data: { kind: 'aufgabe', titel: 'Zimmer aufräumen', fuer: lina, done: false } }] }); assert.equal(r.status, 200);
r = await ad('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'e-g1', data: { kind: 'gedanke', titel: 'Geheim', thema: 'Urlaub', sicht: 'erwachsene' } }] });
r = await client()('/api/login', { name: 'Lina M.', password: 'irgendwas1' }); assert.equal(r.status, 401);
// Tablet-Rolle (Family Wall): sieht Familienaufgaben, nicht die Erwachsenen-Ideen, darf abhaken
r = await ad('/api/admin/users', { name: 'Küchen-Tablet', role: 'tablet' }); assert.ok(r.data.link);
const t = new URL(r.data.link).searchParams.get('einladung');
r = await tab('/api/invite', { t, password: 'tablet-pw-1' }); assert.equal(r.status, 200);
r = await tab('/api/me'); assert.equal(r.data.user.role, 'tablet'); assert.equal(r.data.user.perms.aufgaben, 'edit');
r = await tab('/api/data?since=0'); const ids = r.data.docs.map((d) => d.id);
assert.ok(ids.includes('e-l1')); assert.ok(!ids.includes('e-g1'), 'keine Erwachsenen-Themen auf dem Tablet');
assert.ok(r.data.docs.every((d) => typeof d.u === 'number'), 'Änderungszeit für "Neu"-Markierung');
r = await tab('/api/write', { ops: [{ op: 'update', coll: 'eintraege', id: 'e-l1', data: { done: true, doneAt: new Date().toISOString() } }] }); assert.equal(r.status, 200);
// Sicherung: Download, Wiederherstellen, wöchentliche Kopie
r = await ad('/api/admin/export'); assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /family-app-sicherung/);
const backup = typeof r.data === 'string' ? JSON.parse(r.data) : r.data; assert.equal(backup.app, 'family-app'); assert.ok(backup.docs.find((d) => d.id === 'e-l1'));
assert.ok(!JSON.stringify(backup).includes('hash'), 'keine Passwörter in der Sicherung');
r = await tab('/api/admin/export'); assert.equal(r.status, 403);
await ad('/api/write', { ops: [{ op: 'delete', coll: 'eintraege', id: 'e-l1' }] });
r = await ad('/api/admin/restore', { data: backup }); assert.equal(r.status, 200); assert.ok(r.data.restored > 5);
r = await ad('/api/data?since=0'); assert.ok(r.data.docs.find((d) => d.id === 'e-l1'), 'wiederhergestellt');
r = await ad('/api/admin/restore', { data: { foo: 1 } }); assert.equal(r.status, 400);
await T.weeklyBackup(env); await T.weeklyBackup(env);
r = await ad('/api/admin/backups'); assert.ok(r.data.backups.length >= 2);
r = await ad('/api/admin/restore', { backup: r.data.backups[0].id }); assert.equal(r.status, 200);
// Aufräumen: alte erledigte Aufgaben weg, gekaufte Artikel je Titel einmal
const old = new Date(Date.now() - 90 * 86400000).toISOString();
await ad('/api/write', { ops: [
  { op: 'set', coll: 'eintraege', id: 'e-alt', data: { kind: 'aufgabe', titel: 'Alt', done: true, doneAt: old } },
  { op: 'set', coll: 'eintraege', id: 'e-neu', data: { kind: 'aufgabe', titel: 'Neu', done: true, doneAt: new Date().toISOString() } },
  { op: 'set', coll: 'eintraege', id: 'k1', data: { kind: 'einkauf', titel: 'Milch', done: true, doneAt: '2026-11-01T10:00:00Z' } },
  { op: 'set', coll: 'eintraege', id: 'k2', data: { kind: 'einkauf', titel: 'milch', done: true, doneAt: '2026-11-20T10:00:00Z' } },
] });
const n = await T.housekeeping(env); assert.ok(n >= 2);
r = await ad('/api/data?since=0'); const left = r.data.docs.map((d) => d.id);
assert.ok(!left.includes('e-alt')); assert.ok(left.includes('e-neu')); assert.ok(left.includes('k2')); assert.ok(!left.includes('k1'));
// Warnung bei dauerhaftem Kalenderfehler
await env.DB.prepare("INSERT INTO settings(k,v) VALUES('cal',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify({ url: 'https://p01-caldav.icloud.com/123/calendars/fam/', name: 'Familie' })).run();
await env.DB.prepare("INSERT INTO settings(k,v) VALUES('calstatus',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify({ ok: false, fails: 3, err: '401' })).run();
r = await ad('/api/me'); assert.match(r.data.warnings[0], /klappt seit 3 Versuchen nicht/);
r = await tab('/api/me'); assert.deepEqual(r.data.warnings, [], 'Warnung nur für Admins');
console.log('ALLE FAMILIEN-TESTS OK');
