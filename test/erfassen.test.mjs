// Paket B: Erfassen auf dem Server, persönlicher Kurzbefehl-Link, Serientermine
import assert from 'node:assert/strict';
import { makeEnv, calls } from './harness.mjs';
const mod = await import('../build/worker.js');
const worker = mod.default, T = mod._test;
const env = makeEnv();
const pending = []; const ctx = { waitUntil: (p) => pending.push(p) };
const flush = async () => { while (pending.length) await pending.shift(); };
const O = 'https://fam3.example.workers.dev';
function client() {
  let cookie = '';
  return async (path, body, method, raw) => {
    const r = await worker.fetch(new Request(O + path, { method: method || (body !== undefined ? 'POST' : 'GET'), headers: raw ? { 'content-type': raw } : { 'content-type': 'application/json', origin: O, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) }), env, ctx);
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, data: ct.includes('json') ? await r.json() : await r.text() };
  };
}
const ad = client(), anon = client();
let r;
await ad('/api/setup', { code: 'geheim-123', name: 'Philippe', password: 'sicher123' });
r = await ad('/api/admin/users', { name: 'Max', role: 'kind', profil: true }); const max = r.data.id;
// Erfassen über den Server
r = await ad('/api/capture', { text: 'Zahnarzt Dienstag 15 Uhr, Milch und im Frühjahr Hecke schneiden' }); assert.equal(r.status, 200, JSON.stringify(r.data));
const L = r.data.lines.map((l) => l.text).join(' | ');
assert.match(L, /Termin: Zahnarzt/); assert.match(L, /Einkauf: Milch/); assert.match(L, /Neue Idee „Garten“/);
assert.ok(r.data.lines.every((l) => !l.open || /^[est]:/.test(l.open)), 'jede Zeile öffnet ihren Eintrag');
assert.equal(r.data.undo.length, 4, 'Termin, Einkauf, Idee, Thema');
r = await ad('/api/data?since=0'); const ids = r.data.docs.map((d) => d.id);
for (const [, id] of (await ad('/api/capture', { text: 'Milch' })).data.undo) assert.ok(false, 'doppelte Milch darf nichts anlegen: ' + id);
// Serie mit Uhrzeit -> Serientermin, Frage "Termin oder Aufgabe?"
r = await ad('/api/capture', { text: 'Max hat jeden Dienstag 17:30 Training' });
assert.match(r.data.lines[0].text, /Serientermin: Training Max, jede Woche 17:30/); assert.deepEqual(r.data.ask[0].is, 'termin');
const trainId = r.data.ask[0].id;
r = await ad('/api/data?since=0'); const tr = r.data.docs.find((d) => d.id === trainId).data;
assert.equal(tr.wdh, 'woechentlich'); assert.equal(tr.start, '2026-12-01T17:30'); assert.equal(tr.fuer, max, 'Max als Profil zuweisbar');
// Serie ohne Uhrzeit -> wiederkehrende Aufgabe
r = await ad('/api/capture', { text: 'Jeden Dienstag Restmüll' }); assert.match(r.data.lines[0].text, /Wiederkehrende Aufgabe/); assert.equal(r.data.ask[0].is, 'aufgabe');
// Vorkommen von Serien
assert.equal(T.onDay(tr, '2026-12-08'), '2026-12-08T17:30'); assert.equal(T.onDay(tr, '2026-12-09'), null); assert.equal(T.onDay(tr, '2026-11-24'), null, 'nicht vor dem Start');
assert.equal(T.onDay({ ...tr, wdhBis: '2026-12-10' }, '2026-12-15'), null);
assert.equal(T.onDay({ ...tr, ausnahmen: ['2026-12-22'] }, '2026-12-22'), null, 'Ausnahme (z. B. Ferien)');
assert.equal(T.onDay({ start: '2026-01-31', wdh: 'monatlich' }, '2026-02-28'), '2026-02-28', 'Monatsende');
assert.equal(T.onDay({ start: '2026-03-03', wdh: 'jaehrlich' }, '2028-03-03'), '2028-03-03');
assert.match(T.buildIcs('x@family-app', tr, 'Philippe'), /RRULE:FREQ=WEEKLY\r\n/);
assert.match(T.buildIcs('x@family-app', { ...tr, wdh: 'zweiwoechentlich', wdhBis: '2027-06-30' }, ''), /RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20270630T235959Z/);
// Kalender: Serie wird mit RRULE geschrieben
await ad('/api/admin/calendar', { url: 'https://p01-caldav.icloud.com/123/calendars/fam/', name: 'Familie' }); await flush();
const ics = [...calls.events.entries()].find(([k]) => k.includes(trainId));
assert.ok(ics && /RRULE:FREQ=WEEKLY/.test(ics[1]), 'Serientermin im iPhone-Kalender');
// Erinnerung für Serientermin am 8.12. um 16:30
await ad('/api/push/subscribe', { endpoint: 'https://web.push.apple.com/abc' });
calls.push.length = 0;
await env.DB.prepare("INSERT INTO settings(k,v) VALUES('tick',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify('2026-12-08T16:25')).run();
await worker.scheduled({ scheduledTime: Date.parse('2026-12-08T15:30:00Z') }, env, ctx); await flush();
assert.equal(calls.push.length, 1, 'Erinnerung 1 Std. vor dem Training');
r = await ad('/api/notify'); assert.equal(r.data.title, 'Termin um 17:30 Uhr');
// Persönlicher Link für den Kurzbefehl
r = await ad('/api/token'); assert.equal(r.data.exists, false);
r = await ad('/api/token', {}); const link = r.data.link; assert.match(link, /\/q\/[\w-]{20,}$/);
const path = new URL(link).pathname;
r = await anon(path); assert.match(r.data, /Hallo Philippe/);
r = await anon(path, 'Zahnarzt Dienstag 15 Uhr', 'POST', 'text/plain'); assert.equal(r.status, 200); assert.match(r.data, /Termin: Zahnarzt/);
r = await anon(path, JSON.stringify({ text: 'Milch' }), 'POST', 'application/json'); assert.match(r.data, /Steht schon auf der Liste: Milch/);
r = await anon('/q/falsch-falsch-falsch-falsch', 'x', 'POST', 'text/plain'); assert.equal(r.status, 403);
r = await ad('/api/token', {}); assert.notEqual(r.data.link, link, 'neuer Link');
r = await anon(path, 'Milch', 'POST', 'text/plain'); assert.equal(r.status, 403, 'alter Link ungültig');
r = await ad('/api/token', undefined, 'DELETE'); r = await anon(new URL(r.data ? link : link).pathname); assert.equal(r.status, 403);
// Kind mit eigenem Gerät: Termin wird Vorschlag
console.log('ALLE ERFASSEN-TESTS OK');
