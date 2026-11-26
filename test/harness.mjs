// Lokale Nachbildung: D1 (node:sqlite), Workers AI (Attrappe), iCloud CalDAV + Apple Push (Attrappen)
import { DatabaseSync } from 'node:sqlite';
import http from 'node:http';

export const calls = { caldav: [], push: [], events: new Map() };

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.db, this.sql, a); }
  async first() { const r = this.db.prepare(this.sql).get(...this.args); return r ? { ...r } : null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args).map((r) => ({ ...r })) }; }
  async run() { this.db.prepare(this.sql).run(...this.args); return { success: true }; }
}
export function makeEnv() {
  const db = new DatabaseSync(':memory:');
  return {
    DB: { prepare: (sql) => new Stmt(db, sql), batch: async (ss) => { const out = []; for (const s of ss) out.push(await s.run()); return out; } },
    AI: { run: async (model, a) => (a.audio ? { text: 'Milch und Brot' } : { response: fakeAI(a.messages.at(-1).content) }) },
    SETUP_CODE: 'geheim-123',
    ICLOUD_USER: 'philippe@example.com',
    ICLOUD_PASS: 'abcd-efgh-ijkl-mnop',
  };
}

function fakeAI(prompt) {
  if (prompt.includes('"zutaten"')) return JSON.stringify({ zutaten: ['500 g Hackfleisch', 'Lasagneplatten', 'Tomaten passiert'] });
  const m = prompt.match(/"""([\s\S]*?)"""/);
  const text = m ? m[1] : '';
  const out = [];
  if (/Zahnarzt/i.test(text)) out.push({ art: 'termin', titel: 'Zahnarzt', text: 'Zahnarzt', start: '2026-12-01T15:00', ende: '', ganztags: false });
  if (/TÜV/i.test(text)) out.push({ art: 'aufgabe', titel: 'TÜV machen', text: 'Conny muss den TÜV machen.', zustaendig: 'Conny', faellig: '' });
  if (/Training/i.test(text)) out.push({ art: 'serie', titel: 'Training Max', text: 'Jeden Dienstag 17:30 Training', rhythmus: 'woechentlich', naechstes: '2026-12-01', serienart: 'termin', zeit: '17:30', zustaendig: 'Max' });
  if (/Restmüll/i.test(text)) out.push({ art: 'serie', titel: 'Restmüll rausstellen', text: 'Jeden Dienstag Restmüll', rhythmus: 'woechentlich', naechstes: '2026-12-01', serienart: 'muell', zustaendig: 'wir' });
  if (/Lasagne/i.test(text)) out.push({ art: 'essen', titel: 'Lasagne', datum: '2026-11-27', gericht: 'Lasagne' });
  if (/Milch/i.test(text)) out.push({ art: 'einkauf', titel: 'Milch', text: 'Milch kaufen' });
  if (/Hecke/i.test(text)) out.push({ art: 'gedanke', titel: 'Hecke schneiden', text: 'Im Frühjahr die Hecke schneiden lassen.', thema: 'Garten', wiedervorlage: '2027-03-01' });
  if (/Paket/i.test(text)) out.push({ art: 'nachricht', titel: 'Paket', text: 'Das Paket liegt beim Nachbarn.' });
  if (/kaputt/i.test(text)) return 'Entschuldigung, das verstehe ich nicht.';
  return '```json\n' + JSON.stringify({ eintraege: out }) + '\n```';
}

const realFetch = globalThis.fetch;
const MS = '<?xml version="1.0" encoding="UTF-8"?>';
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const u = new URL(url);
  if (u.hostname === 'www.rezepte.example') {
    const ld = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebPage' }, { '@type': 'Recipe', name: 'Hähnchen-Curry &amp; Reis', recipeYield: ['2', '2 Portionen'], image: ['https://img.rezepte.example/curry.jpg'], recipeIngredient: ['300 g Hähnchenbrust', '1 Dose Kokosmilch', '2 Zwiebeln', '1 EL Öl', 'Salz', '200 g Reis'] }] };
    if (u.pathname === '/kaputt') return new Response('<html><title>Nur Text</title></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    return new Response(`<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(ld)}</script></head></html>`, { status: 200, headers: { 'content-type': 'text/html' } });
  }
  if (u.hostname.endsWith('icloud.com')) {
    const method = init.method || 'GET';
    calls.caldav.push({ method, url, auth: init.headers && init.headers.authorization });
    const ok = init.headers && init.headers.authorization === 'Basic ' + Buffer.from('philippe@example.com:abcd-efgh-ijkl-mnop').toString('base64');
    if (!ok) return new Response('no', { status: 401 });
    if (u.hostname === 'caldav.icloud.com' && u.pathname === '/' && method === 'PROPFIND')
      return new Response(`${MS}<multistatus xmlns="DAV:"><response><href>/</href><propstat><prop><current-user-principal><href>/123456/principal/</href></current-user-principal></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`, { status: 207 });
    if (u.hostname === 'caldav.icloud.com' && u.pathname === '/123456/principal/')
      return new Response(null, { status: 301, headers: { location: 'https://p42-caldav.icloud.com:443/123456/principal/' } });
    if (u.hostname === 'p42-caldav.icloud.com' && u.pathname === '/123456/principal/')
      return new Response(`${MS}<multistatus xmlns="DAV:"><response><href>/123456/principal/</href><propstat><prop><calendar-home-set xmlns="urn:ietf:params:xml:ns:caldav"><href xmlns="DAV:">https://p42-caldav.icloud.com:443/123456/calendars/</href></calendar-home-set></prop><status>HTTP/1.1 200 OK</status></propstat></response></multistatus>`, { status: 207 });
    if (u.pathname === '/123456/calendars/' && method === 'PROPFIND')
      return new Response(`${MS}<multistatus xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav"><response><href>/123456/calendars/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response><response><href>/123456/calendars/home/</href><propstat><prop><displayname>Familie &amp; Wir</displayname><resourcetype><collection/><cal:calendar/></resourcetype><cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set></prop></propstat></response><response><href>/123456/calendars/tasks/</href><propstat><prop><displayname>Erinnerungen</displayname><resourcetype><collection/><cal:calendar/></resourcetype><cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set></prop></propstat></response></multistatus>`, { status: 207 });
    if (method === 'REPORT') {
      const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:abc-1', 'RECURRENCE-ID:20261126T163000Z', 'DTSTART:20261126T163000Z', 'DTEND:20261126T180000Z', 'SUMMARY:Training Max', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:abc-1', 'RECURRENCE-ID:20261203T163000Z', 'DTSTART:20261203T163000Z', 'DTEND:20261203T180000Z', 'SUMMARY:Training Max', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const ics2 = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x2', 'DTSTART;TZID=Europe/Berlin:20261201T190000', 'SUMMARY:Eltern', ' abend 6b', 'LOCATION:Schule\\, Raum 4', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const ics3 = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:e-t9@family-app', 'DTSTART:20261201T100000Z', 'SUMMARY:Eigener', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:u4', 'DTSTART;VALUE=DATE:20261220', 'DTEND;VALUE=DATE:20261227', 'SUMMARY:Urlaub', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const resp = (h, x) => `<response><href>${h}</href><propstat><prop><C:calendar-data>${x.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</C:calendar-data></prop></propstat></response>`;
      return new Response(`${MS}<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">${resp('/a.ics', ics)}${resp('/b.ics', ics2)}${resp('/c.ics', ics3)}</multistatus>`, { status: 207 });
    }
    if (method === 'PUT') { calls.events.set(u.pathname, init.body); return new Response(null, { status: 201 }); }
    if (method === 'DELETE') { calls.events.delete(u.pathname); return new Response(null, { status: 204 }); }
    return new Response('?', { status: 404 });
  }
  if (u.hostname === 'web.push.apple.com') { calls.push.push({ url, auth: init.headers.Authorization }); return new Response(null, { status: 201 }); }
  return realFetch(input, init);
};

export async function serve(worker, env, port) {
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(p) };
  const srv = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await worker.fetch(new Request('http://localhost:' + port + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env, ctx);
    const h = {};
    r.headers.forEach((v, k) => { h[k] = v; });
    if (h['set-cookie']) h['set-cookie'] = h['set-cookie'].replace('; Secure', '');
    res.writeHead(r.status, h);
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  await new Promise((ok) => srv.listen(port, ok));
  return { srv, flush: async () => { while (pending.length) await pending.shift(); } };
}
