import assert from 'node:assert/strict';
import { makeEnv, calls } from './harness.mjs';
const worker = (await import('../build/worker.js')).default;
const env = makeEnv();
const pending = []; const ctx = { waitUntil: (p) => pending.push(p) };
const flush = async () => { while (pending.length) await pending.shift(); };
const O = 'https://fam.example.workers.dev';
function client() { let cookie = ''; return async (path, body, method) => {
  const r = await worker.fetch(new Request(O + path, { method: method || (body ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', origin: O, ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, ctx);
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return { status: r.status, data: await r.json() }; }; }
const W = (c, ops) => c('/api/write', { ops });
const ids = async (c) => (await c('/api/data?since=0')).data.docs.map((d) => d.id).filter((i) => !i.startsWith('e-mwu'));
const ph = client(), co = client(), lina = client(), oma = client();
await ph('/api/setup', { code: 'geheim-123', name: 'Philippe', password: 'sicher123' });
const pid = (await ph('/api/me')).data.user.id;
async function invite(c, name, role, perms) { const r = await ph('/api/admin/users', { name, role, perms }); assert.equal(r.status, 200, JSON.stringify(r.data)); await c('/api/invite', { t: new URL(r.data.link).searchParams.get('einladung'), password: name.toLowerCase() + '-pw-123' }); return (await c('/api/me')).data.user; }
const conny = await invite(co, 'Conny', 'admin'); const lu = await invite(lina, 'Lina', 'kind'); const ou = await invite(oma, 'Oma', 'gast');
assert.deepEqual(lu.perms, { termine: 'mine', aufgaben: 'mine', einkauf: 'edit', essen: 'view', themen: 'off', pinnwand: 'edit' });
assert.equal(ou.perms.aufgaben, 'off');
await ph('/api/admin/calendar', { url: 'https://p42-caldav.icloud.com/123456/calendars/home/', name: 'Familie' }); await flush();
// Eltern legen Einträge an
let r = await W(ph, [
  { op: 'set', coll: 'eintraege', id: 'a-lina', data: { kind: 'aufgabe', titel: 'Zimmer aufräumen', fuer: lu.id, done: false } },
  { op: 'set', coll: 'eintraege', id: 'a-wir', data: { kind: 'aufgabe', titel: 'Steuer', fuer: 'wir', done: false } },
  { op: 'set', coll: 'eintraege', id: 't-lina', data: { kind: 'termin', titel: 'Lina Zahnarzt', start: '2026-12-02T10:00', fuer: lu.id } },
  { op: 'set', coll: 'eintraege', id: 't-eltern', data: { kind: 'termin', titel: 'Elternabend', start: '2026-12-03T19:00', fuer: 'wir' } },
  { op: 'set', coll: 'eintraege', id: 'g-geschenk', data: { kind: 'gedanke', titel: 'Fahrrad für Lina', thema: 'Geschenke', sicht: 'erwachsene' } },
  { op: 'set', coll: 'eintraege', id: 'k-milch', data: { kind: 'einkauf', titel: 'Milch', done: false } },
  { op: 'set', coll: 'eintraege', id: 'n-paket', data: { kind: 'nachricht', text: 'Paket beim Nachbarn', done: false } },
  { op: 'set', coll: 'essen', id: 'd-2026-11-24', data: { datum: '2026-11-24', gericht: 'Pizza' } },
  { op: 'set', coll: 'themen', id: 't-geschenke', data: { name: 'Geschenke', due: '2026-12-01', sicht: 'erwachsene' } },
]); assert.equal(r.status, 200);
await flush();
// Kind sieht nur seins + Einkauf, Pinnwand, Essen
let li = await ids(lina);
assert.deepEqual(li.sort(), ['a-lina', 'd-2026-11-24', 'k-milch', 'n-paket', 't-lina'].sort(), 'Kind-Sicht: ' + li);
// Oma: Termine sehen (familie), Essen, Pinnwand; keine Aufgaben, kein Einkauf
let om = await ids(oma); assert.deepEqual(om.sort(), ['d-2026-11-24', 'n-paket', 't-eltern', 't-lina'].sort(), 'Gast-Sicht: ' + om);
// Kind darf eigene zugewiesene Aufgabe abhaken, aber nicht umbenennen / löschen
assert.equal((await W(lina, [{ op: 'update', coll: 'eintraege', id: 'a-lina', data: { done: true, doneAt: 'x' } }])).status, 200);
assert.equal((await W(lina, [{ op: 'update', coll: 'eintraege', id: 'a-lina', data: { titel: 'Nix' } }])).status, 403);
assert.equal((await W(lina, [{ op: 'delete', coll: 'eintraege', id: 'a-lina' }])).status, 403);
assert.equal((await W(lina, [{ op: 'update', coll: 'eintraege', id: 'a-wir', data: { done: true } }])).status, 403, 'fremde Aufgabe');
assert.equal((await W(lina, [{ op: 'update', coll: 'essen', id: 'd-2026-11-24', data: { gericht: 'Eis' } }])).status, 403, 'Essen nur sehen');
// Kind legt eigene Aufgabe + Termin an -> Termin wird Vorschlag, kein Kalender
assert.equal((await W(lina, [{ op: 'set', coll: 'eintraege', id: 'a-own', data: { kind: 'aufgabe', titel: 'Hausaufgaben', fuer: lu.id } }])).status, 200);
assert.equal((await W(lina, [{ op: 'set', coll: 'eintraege', id: 't-ben', data: { kind: 'termin', titel: 'Geburtstag bei Ben', start: '2026-12-05T15:00', fuer: lu.id } }])).status, 200);
assert.equal((await W(lina, [{ op: 'set', coll: 'eintraege', id: 'x-adult', data: { kind: 'aufgabe', titel: 'x', sicht: 'erwachsene' } }])).status, 403, 'Kind kann nichts nur für Erwachsene anlegen');
assert.equal((await W(lina, [{ op: 'set', coll: 'themen', id: 't-x', data: { name: 'X' } }])).status, 403, 'Themen aus');
await flush();
let d = (await ph('/api/data?since=0')).data.docs.find((x) => x.id === 't-ben').data; assert.equal(d.vorschlag, true); assert.ok(!d.kalender);
assert.ok(!calls.events.has('/123456/calendars/home/t-ben.ics'), 'Vorschlag nicht im Kalender');
assert.equal((await W(lina, [{ op: 'update', coll: 'eintraege', id: 't-ben', data: { vorschlag: false } }])).status, 200);
d = (await ph('/api/data?since=0')).data.docs.find((x) => x.id === 't-ben').data; assert.equal(d.vorschlag, true, 'Kind kann sich nicht selbst bestätigen');
// Elternteil bestätigt -> Kalender
assert.equal((await W(co, [{ op: 'update', coll: 'eintraege', id: 't-ben', data: { vorschlag: false } }])).status, 200); await flush();
assert.ok(calls.events.has('/123456/calendars/home/t-ben.ics'), 'nach Bestätigung im Kalender');
// Privat: Connys private Notiz sieht Philippe nicht; privater Termin nicht im Kalender
await W(co, [{ op: 'set', coll: 'eintraege', id: 'p-conny', data: { kind: 'termin', titel: 'Überraschung', start: '2026-12-10', sicht: 'privat' } }]); await flush();
assert.ok(!(await ids(ph)).includes('p-conny')); assert.ok((await ids(co)).includes('p-conny'));
assert.ok(!calls.events.has('/123456/calendars/home/p-conny.ics'));
// Termin nachträglich privat -> aus Kalender
assert.ok(calls.events.has('/123456/calendars/home/t-eltern.ics'));
await W(ph, [{ op: 'update', coll: 'eintraege', id: 't-eltern', data: { sicht: 'privat' } }]); await flush();
assert.ok(!calls.events.has('/123456/calendars/home/t-eltern.ics'), 'privat -> aus Kalender entfernt');
// Gast schreibt nicht
assert.equal((await W(oma, [{ op: 'set', coll: 'eintraege', id: 'o1', data: { kind: 'nachricht', text: 'Hallo' } }])).status, 403);
assert.equal((await oma('/api/ai', { prompt: 'x' })).status, 403);
assert.equal((await lina('/api/ai', { prompt: 'Eingabe von Lina: """Milch"""' })).status, 200);
// Sicht-Änderung propagiert inkrementell (Kind verliert Zugriff)
const s0 = (await lina('/api/data?since=0')).data.now;
await W(ph, [{ op: 'update', coll: 'eintraege', id: 'a-lina', data: { sicht: 'erwachsene' } }]);
const inc = (await lina('/api/data?since=' + s0)).data.docs; assert.ok(inc.some((x) => x.id === 'a-lina' && x.deleted), 'versteckt -> beim Kind entfernt');
// Admin ändert Kind-Stufen
r = await ph('/api/admin/users/' + lu.id, { role: 'kind', perms: { ...lu.perms, essen: 'edit' } }); assert.equal(r.status, 200);
assert.equal((await W(lina, [{ op: 'update', coll: 'essen', id: 'd-2026-11-24', data: { gericht: 'Eis' } }])).status, 200);
// Rollenwechsel ohne perms -> Vorlage
await ph('/api/admin/users/' + ou.id, { role: 'erwachsener' }); assert.equal((await oma('/api/me')).data.user.perms.aufgaben, 'edit');
// Briefing Kind
r = await lina('/api/briefing'); console.log('Briefing Lina:\n' + r.data.body); assert.doesNotMatch(r.data.body, /Steuer|Fahrrad|Ben/);
// Altdaten: mitglied/areas-Array
await env.DB.prepare("UPDATE users SET role='mitglied', areas=? WHERE id=?").bind(JSON.stringify(['einkauf']), conny.id).run();
const cm = (await co('/api/me')).data.user; assert.equal(cm.role, 'erwachsener'); assert.equal(cm.perms.einkauf, 'edit'); assert.equal(cm.perms.termine, 'off');
console.log('ALLE ROLLEN-TESTS OK');
