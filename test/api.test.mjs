import assert from 'node:assert/strict';
import { makeEnv, calls } from './harness.mjs';
const worker = (await import('../build/worker.js')).default;
const env = makeEnv();
const pending = []; const ctx = { waitUntil: (p) => pending.push(p) };
const flush = async () => { while (pending.length) await pending.shift(); };
const O = 'https://fam.example.workers.dev';
function client() {
  let cookie = '';
  return async (path, body, method) => {
    const r = await worker.fetch(new Request(O + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', origin: O, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, ctx);
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() };
  };
}
const ph = client(), co = client(), kid = client(), anon = client();
let r;
// Seite + Assets
r = await anon('/'); assert.equal(r.status, 200); assert.match(r.data, /Family App/);
r = await anon('/icon-180.png'); assert.equal(r.status, 200);
r = await anon('/manifest.webmanifest'); assert.equal(r.status, 200);
// Setup
r = await anon('/api/me'); assert.equal(r.status, 401); assert.equal(r.data.setup, true);
r = await ph('/api/setup', { code: 'falsch', name: 'Philippe', password: 'sicher123' }); assert.equal(r.status, 403);
r = await ph('/api/setup', { code: 'geheim-123', name: 'Philippe', password: 'sicher123' }); assert.equal(r.status, 200, JSON.stringify(r.data));
r = await anon('/api/setup', { code: 'geheim-123', name: 'X', password: 'sicher123' }); assert.equal(r.status, 403);
r = await ph('/api/me'); assert.equal(r.data.user.role, 'admin'); const pid = r.data.user.id;
// Seed übernommen + Besitzer umgeschrieben
r = await ph('/api/data?since=0'); assert.equal(r.data.docs.length, 11);
assert.ok(r.data.docs.every((d) => !d.data.by || d.data.by === pid));
assert.equal(r.data.docs.find((d) => d.id === 'e-mwuveta94qzx3').data.fuer, pid);
// Conny einladen
r = await ph('/api/admin/users', { name: 'Conny', role: 'erwachsener' }); assert.equal(r.status, 200);
const tok = new URL(r.data.link).searchParams.get('einladung');
r = await co('/api/invite?t=' + tok); assert.equal(r.data.name, 'Conny');
r = await co('/api/invite', { t: tok, password: 'kurz' }); assert.equal(r.status, 400);
r = await co('/api/invite', { t: tok, password: 'conny-pw-1' }); assert.equal(r.status, 200);
r = await co('/api/invite', { t: tok, password: 'conny-pw-2' }); assert.equal(r.status, 404, 'Link nur einmal');
r = await co('/api/me'); assert.equal(r.data.user.name, 'Conny'); assert.equal(r.data.user.perms.themen, 'edit'); const cid = r.data.user.id; assert.equal(r.data.users.length, 2);
r = await co('/api/admin/users'); assert.equal(r.status, 403, 'Conny ist kein Admin');
// Login
const co2 = client();
r = await co2('/api/login', { name: 'conny', password: 'falsch' }); assert.equal(r.status, 401);
r = await co2('/api/login', { name: 'conny', password: 'conny-pw-1' }); assert.equal(r.status, 200);
// Rollen werden in Tests unten geprüft (roles.test.mjs)
// KI
r = await co('/api/ai', { prompt: 'Eingabe von Conny: """Zahnarzt Dienstag 15 Uhr, Philippe muss TÜV machen, Milch"""' });
assert.equal(r.data.json.eintraege.length, 3);
r = await co('/api/ai', { prompt: 'Eingabe von Conny: """kaputt"""' }); assert.equal(r.data.json, null);
// Kalender verbinden
r = await ph('/api/admin/calendars'); assert.equal(r.status, 200, JSON.stringify(r.data));
assert.deepEqual(r.data.calendars.map((c) => c.name), ['Familie & Wir'], 'nur VEVENT-Kalender');
const cal = r.data.calendars[0]; assert.equal(cal.url, 'https://p42-caldav.icloud.com/123456/calendars/home/');
r = await ph('/api/admin/calendar', { url: cal.url, name: cal.name }); assert.equal(r.status, 200);
await flush();
assert.ok(calls.events.has('/123456/calendars/home/e-mwuur293jx44p.ics'), 'Seed-Termin eingetragen');
const ics = calls.events.get('/123456/calendars/home/e-mwuur293jx44p.ics');
assert.match(ics, /DTSTART;TZID=Europe\/Berlin:20261127T194400/); assert.match(ics, /DTEND;TZID=Europe\/Berlin:20261127T204400/); assert.doesNotMatch(ics, /VALARM/); assert.match(ics, /Eingetragen von Philippe/);
// Neuer Termin von Conny -> automatisch
r = await co('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'e-t1', data: { kind: 'termin', titel: 'Zahnarzt, Kontrolle; Lina', text: 'Bitte\nKarte mitnehmen', start: '2026-12-01T15:00', ende: '', ganztags: false, kalender: true } }] });
assert.equal(r.status, 200); await flush();
let ev = calls.events.get('/123456/calendars/home/e-t1.ics'); assert.ok(ev); assert.ok(ev.includes(String.raw`SUMMARY:Zahnarzt\, Kontrolle\; Lina`)); assert.ok(ev.includes('Bitte' + String.fromCharCode(92) + 'nKarte'));
r = await co('/api/data?since=0'); let t1 = r.data.docs.find((d) => d.id === 'e-t1').data; assert.equal(t1.kalender, true); assert.ok(t1.calUrl);
// Ganztägig
await co('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'e-t2', data: { kind: 'termin', titel: 'Weihnachtsfeier', start: '2026-12-12', ganztags: true } }] }); await flush();
ev = calls.events.get('/123456/calendars/home/e-t2.ics'); assert.match(ev, /DTSTART;VALUE=DATE:20261212/); assert.match(ev, /DTEND;VALUE=DATE:20261213/); assert.doesNotMatch(ev, /VTIMEZONE/);
// Änderung -> neu geschrieben, Kalenderfelder bleiben erhalten
await co('/api/write', { ops: [{ op: 'update', coll: 'eintraege', id: 'e-t1', data: { start: '2026-12-01T16:00' } }] }); await flush();
assert.match(calls.events.get('/123456/calendars/home/e-t1.ics'), /T160000/);
// Löschen -> aus Kalender
await co('/api/write', { ops: [{ op: 'delete', coll: 'eintraege', id: 'e-t1' }] }); await flush();
assert.ok(!calls.events.has('/123456/calendars/home/e-t1.ics'), 'aus Kalender gelöscht');
r = await co('/api/data?since=0'); assert.ok(!r.data.docs.find((d) => d.id === 'e-t1'));
// Inkrementelles Laden mit Löschung
const s0 = r.data.now; await ph('/api/write', { ops: [{ op: 'delete', coll: 'eintraege', id: 'e-t2' }] });
r = await co('/api/data?since=' + s0); assert.ok(r.data.docs.some((d) => d.id === 'e-t2' && d.deleted));
// Push
r = await co('/api/push/key'); assert.ok(r.data.key.length > 80);
await co('/api/push/subscribe', { endpoint: 'https://web.push.apple.com/abc' });
await ph('/api/push/subscribe', { endpoint: 'https://web.push.apple.com/def' });
r = await co('/api/push/test', {}); assert.deepEqual(r.data.results, [201]);
assert.match(calls.push.at(-1).auth, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
// JWT prüfen
const [, k] = calls.push.at(-1).auth.match(/k=([\w-]+)/); const jwt = calls.push.at(-1).auth.match(/t=([^,]+)/)[1].split('.');
const b = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const key = await crypto.subtle.importKey('raw', b(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, b(jwt[2]), new TextEncoder().encode(jwt[0] + '.' + jwt[1])), 'VAPID-Signatur gültig');
const claims = JSON.parse(b(jwt[1])); assert.equal(claims.aud, 'https://web.push.apple.com'); assert.equal(claims.sub, O);
// Briefing
r = await co('/api/briefing'); assert.equal(r.status, 200); console.log('Briefing Conny:\n' + r.data.body);
// Cron: Mittwoch 25.11.2026 05:30 UTC = 06:30 Berlin
calls.push.length = 0;
await worker.scheduled({ scheduledTime: Date.parse('2026-11-25T05:30:00Z') }, env, ctx); await flush();
assert.equal(calls.push.length, 2, 'Morgen-Push an beide');
calls.push.length = 0;
await worker.scheduled({ scheduledTime: Date.parse('2026-11-25T04:30:00Z') }, env, ctx); await flush();
assert.equal(calls.push.length, 0, '05:30 Berlin: kein Push');
await env.DB.prepare("DELETE FROM settings WHERE k='tick'").run();
await worker.scheduled({ scheduledTime: Date.parse('2026-11-28T08:00:00Z') }, env, ctx); await flush();
assert.equal(calls.push.length, 2, 'Samstag 9:00 Push');
calls.push.length = 0;
await env.DB.prepare("DELETE FROM settings WHERE k='tick'").run();
await worker.scheduled({ scheduledTime: Date.parse('2026-07-04T07:00:00Z') }, env, ctx); await flush();
assert.equal(calls.push.length, 2, 'Sommerzeit Samstag 9:00');
// Mitteilungs-Inhalt kommt über /api/notify
r = await ph('/api/notify'); assert.match(r.data.title, /Guten Morgen, Philippe/);
// --- Neue Push-Regeln ---
const T = (iso) => worker.scheduled({ scheduledTime: Date.parse(iso) }, env, ctx).then(flush);
const resetTick = (iso) => env.DB.prepare("INSERT INTO settings(k,v) VALUES('tick',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify(iso)).run();
// Termin 10.12. 15:00 -> Erinnerung 14:00 (Standard 1 Std.), auch in der Ruhezeit
await co('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'e-r1', data: { kind: 'termin', titel: 'Kinderarzt', start: '2026-12-10T15:00', fuer: 'wir' } }] }); await flush();
await env.DB.prepare('UPDATE notes SET seen=1').run();
calls.push.length = 0; await resetTick('2026-12-10T13:50'); await T('2026-12-10T12:55:00Z');
assert.equal(calls.push.length, 0, '13:55 noch nicht');
await T('2026-12-10T13:00:00Z'); assert.equal(calls.push.length, 2, '14:00 an beide');
r = await co('/api/notify'); assert.equal(r.data.title, 'Termin um 15:00 Uhr'); assert.equal(r.data.body, 'Kinderarzt');
await T('2026-12-10T13:05:00Z'); assert.equal(calls.push.length, 2, 'nicht doppelt');
// Eigene Vorlaufzeit 15 Min. und Ruhezeit: Termin 06:00 -> 05:45 klingelt trotzdem
await co('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'e-r2', data: { kind: 'termin', titel: 'Flughafen', start: '2026-12-11T06:00', erinnerung: 15, fuer: cid } }] }); await flush();
calls.push.length = 0; await resetTick('2026-12-11T05:40'); await T('2026-12-11T04:45:00Z');
assert.equal(calls.push.length, 1, 'nur Conny (für Conny, von Conny)');
// Erinnerung aus
await co('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'e-r3', data: { kind: 'termin', titel: 'Still', start: '2026-12-12T11:00', erinnerung: 'aus' } }] }); await flush();
calls.push.length = 0; await resetTick('2026-12-12T09:55'); await T('2026-12-12T09:00:00Z'); assert.equal(calls.push.length, 0, 'aus = kein Push');
// Aufgabe mit Uhrzeit
await ph('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'e-r4', data: { kind: 'aufgabe', titel: 'Müll raus', faellig: '2026-12-13', zeit: '19:00', fuer: pid, done: false } }] }); await flush();
calls.push.length = 0; await resetTick('2026-12-13T18:58'); await T('2026-12-13T18:00:00Z'); assert.equal(calls.push.length, 1, 'Aufgabe 19:00 an Philippe');
// Pinnwand sofort an die anderen, aber nicht in der Ruhezeit
r = await ph('/api/prefs', { ruheVon: '21:00', ruheBis: '07:00', morgenWerktag: '06:45' }); assert.equal(r.data.prefs.ruheVon, '21:00'); assert.equal(r.data.prefs.morgenWerktag, '06:45');
r = await ph('/api/prefs', { ruheVon: 'quatsch' }); assert.equal(r.data.prefs.ruheVon, '21:00', 'ungültige Zeit ignoriert');
r = await ph('/api/me'); assert.equal(r.data.user.prefs.ruheBis, '07:00');
const { inQuiet } = (await import('../build/worker.js'))._test;
assert.ok(inQuiet({ ruheVon: '22:00', ruheBis: '06:30' }, '23:10')); assert.ok(inQuiet({ ruheVon: '22:00', ruheBis: '06:30' }, '05:00')); assert.ok(!inQuiet({ ruheVon: '22:00', ruheBis: '06:30' }, '12:00'));
calls.push.length = 0; await env.DB.prepare('UPDATE notes SET seen=1').run();
await co('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'e-pin1', data: { kind: 'nachricht', titel: 'Oma', text: 'Oma kommt Sonntag' } }] }); await flush();
const quietNow = inQuiet({ ruheVon: '21:00', ruheBis: '07:00' }, new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
assert.equal(calls.push.length, quietNow ? 0 : 1, 'Pinnwand an Philippe (nicht an Conny selbst)');
if (!quietNow) { r = await ph('/api/notify'); assert.equal(r.data.title, 'Pinnwand · Conny'); }
// Zuweisung
calls.push.length = 0;
await ph('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'e-z1', data: { kind: 'aufgabe', titel: 'Geschenk kaufen', fuer: cid, done: false } }] }); await flush();
const coQuiet = inQuiet({ ruheVon: '22:00', ruheBis: '06:30' }, new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()));
assert.equal(calls.push.length, coQuiet ? 0 : 1, 'Zuweisung an Conny');
// iCloud lesen (eigene Family-App-Termine werden ausgelassen, Serien sind aufgelöst)
r = await co('/api/calendar/events?force=1'); assert.equal(r.status, 200, JSON.stringify(r.data));
assert.deepEqual(r.data.events.map((e) => e.titel), ['Training Max', 'Elternabend 6b', 'Training Max', 'Urlaub']);
assert.equal(r.data.events[0].start, '2026-11-26T17:30', 'UTC nach Berliner Zeit');
assert.equal(r.data.events[3].ganztags, true);
r = await ph('/api/briefing'); assert.ok(typeof r.data.body === 'string');
// Admin: letzter Admin bleibt, Sperren beendet Sitzung
r = await ph('/api/admin/users/' + pid, { role: 'erwachsener' }); assert.equal(r.status, 400);
r = await ph('/api/admin/users/' + cid, { active: false }); assert.equal(r.status, 200);
r = await co('/api/me'); assert.equal(r.status, 401, 'gesperrt');
r = await ph('/api/admin/users/' + cid, { active: true }); r = await co2('/api/me'); assert.equal(r.status, 401, 'alte Sitzung bleibt ungültig');
r = await co2('/api/login', { name: 'Conny', password: 'conny-pw-1' }); assert.equal(r.status, 200);
// Passwort zurücksetzen
r = await ph('/api/admin/users/' + cid + '/invite', {}); assert.ok(r.data.link);
r = await co2('/api/me'); assert.equal(r.status, 401);
// Fremde Herkunft
r = await worker.fetch(new Request(O + '/api/logout', { method: 'POST', headers: { origin: 'https://evil.example' } }), env, ctx); assert.equal(r.status, 403);
// Sperre nach Fehlversuchen
const x = client(); for (let i = 0; i < 8; i++) await x('/api/login', { name: 'Philippe', password: 'nein' });
r = await x('/api/login', { name: 'Philippe', password: 'sicher123' }); assert.equal(r.status, 429);
console.log('ALLE API-TESTS OK');
