// Paket D: Einkaufen-Hinweis, Listen, Wochenvorschau, Datenspalten, Face ID (Passkey)
import assert from 'node:assert/strict';
import { webcrypto as wc, createHash } from 'node:crypto';
import { makeEnv, calls } from './harness.mjs';
const mod = await import('../build/worker.js');
const worker = mod.default, T = mod._test;
const env = makeEnv();
const pending = []; const ctx = { waitUntil: (p) => pending.push(p) };
const flush = async () => { while (pending.length) await pending.shift(); };
const O = 'https://fam4.example.workers.dev', HOST = 'fam4.example.workers.dev';
function client() {
  let cookie = '';
  const f = async (path, body, method) => {
    const r = await worker.fetch(new Request(O + path, { method: method || (body !== undefined ? 'POST' : 'GET'), headers: { 'content-type': 'application/json', origin: O, ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env, ctx);
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, data: await r.json().catch(() => null) };
  };
  f.reset = () => { cookie = ''; };
  return f;
}
const ad = client(), co = client();
let r;
await ad('/api/setup', { code: 'geheim-123', name: 'Philippe', password: 'sicher123' });
r = await ad('/api/admin/users', { name: 'Conny', role: 'erwachsener' });
await co('/api/invite', { t: new URL(r.data.link).searchParams.get('einladung'), password: 'conny-pw-1' });
await co('/api/push/subscribe', { endpoint: 'https://web.push.apple.com/conny' });
await ad('/api/push/subscribe', { endpoint: 'https://web.push.apple.com/phil' });
// Einkaufen-Hinweis: an die anderen, höchstens alle 30 Min.
await ad('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 'k1', data: { kind: 'einkauf', titel: 'Milch', done: false } }] });
calls.push.length = 0; await ad('/api/prefs', { ruheVon: '00:00', ruheBis: '00:00' }); await co('/api/prefs', { ruheVon: '00:00', ruheBis: '00:00' });
r = await ad('/api/einkaufen', {}); assert.equal(r.data.sent, 1); assert.equal(calls.push.length, 1);
r = await co('/api/notify'); assert.equal(r.data.title, 'Philippe geht einkaufen'); assert.match(r.data.body, /Aktuell \d+ Artikel/);
r = await ad('/api/einkaufen', {}); assert.equal(r.data.again, true); assert.equal(calls.push.length, 1, 'nicht doppelt');
// Listen (eigene Sammlung)
r = await ad('/api/write', { ops: [{ op: 'set', coll: 'listen', id: 'l-pack', data: { name: 'Packliste Urlaub', typ: 'liste' } }, { op: 'set', coll: 'eintraege', id: 'k2', data: { kind: 'einkauf', titel: 'Sonnencreme', liste: 'l-pack', done: false } }] }); assert.equal(r.status, 200);
r = await co('/api/data?since=0'); assert.ok(r.data.docs.find((d) => d.coll === 'listen'));
// Datenspalten und gezielte Abfrage
const row = await env.DB.prepare("SELECT kind,due,rec,done FROM docs WHERE id='k1'").first(); assert.equal(row.kind, 'einkauf');
await ad('/api/write', { ops: [{ op: 'set', coll: 'eintraege', id: 't1', data: { kind: 'termin', titel: 'Turnen', start: '2026-12-02T16:00', wdh: 'woechentlich' } }, { op: 'set', coll: 'eintraege', id: 't2', data: { kind: 'termin', titel: 'Oma', start: '2026-12-05' } }] });
const t1 = await env.DB.prepare("SELECT due,rec FROM docs WHERE id='t1'").first(); assert.equal(t1.due, '2026-12-02'); assert.equal(t1.rec, 1);
// Wochenvorschau Sonntag 18:00
calls.push.length = 0;
await env.DB.prepare("INSERT INTO settings(k,v) VALUES('tick',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(JSON.stringify('2026-11-29T17:55')).run();
await worker.scheduled({ scheduledTime: Date.parse('2026-11-29T17:00:00Z') }, env, ctx); await flush();
assert.equal(calls.push.length, 2, 'Wochenvorschau an beide');
r = await co('/api/notify'); assert.equal(r.data.title, 'Deine Woche'); assert.match(r.data.body, /Mi: 16:00 Turnen/); assert.match(r.data.body, /Sa: Oma/);
await co('/api/prefs', { woche: 'aus' }); r = await co('/api/me'); assert.equal(r.data.user.prefs.woche, 'aus');
// Face ID: Registrierung + Anmeldung mit nachgebautem Passkey
const b64u = (b) => Buffer.from(b).toString('base64url');
const enc = (v) => { // minimaler CBOR-Encoder
  const head = (mt, n) => n < 24 ? [mt << 5 | n] : n < 256 ? [mt << 5 | 24, n] : [mt << 5 | 25, n >> 8, n & 255];
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const b = [...Buffer.from(v)]; return [...head(3, b.length), ...b]; }
  if (v instanceof Uint8Array || Buffer.isBuffer(v)) return [...head(2, v.length), ...v];
  if (v instanceof Map) { let o = head(5, v.size); for (const [k, x] of v) o = o.concat(enc(k), enc(x)); return o; }
  throw new Error('enc');
};
const kp = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await wc.subtle.exportKey('jwk', kp.publicKey);
const credId = Buffer.from(wc.getRandomValues(new Uint8Array(16)));
const rpHash = createHash('sha256').update(HOST).digest();
const cose = enc(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
const authReg = Buffer.concat([rpHash, Buffer.from([0x45, 0, 0, 0, 0]), Buffer.alloc(16), Buffer.from([0, credId.length]), credId, Buffer.from(cose)]);
const attObj = Buffer.from(enc(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authReg]])));
r = await ad('/api/passkey/options'); assert.equal(r.data.rp.id, HOST);
let cd = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: r.data.challenge, origin: O }));
r = await ad('/api/passkey/register', { id: b64u(credId), clientDataJSON: b64u(cd), attestationObject: b64u(attObj) }); assert.equal(r.status, 200, JSON.stringify(r.data));
r = await ad('/api/passkey'); assert.equal(r.data.count, 1);
// erneute Verwendung derselben Challenge geht nicht
r = await ad('/api/passkey/register', { id: b64u(credId), clientDataJSON: b64u(cd), attestationObject: b64u(attObj) }); assert.equal(r.status, 400);
const toDer = (raw) => { const p = (x) => { let v = [...x]; while (v.length > 1 && v[0] === 0 && v[1] < 128) v.shift(); if (v[0] >= 128) v.unshift(0); return [2, v.length, ...v]; }; const body = [...p(raw.slice(0, 32)), ...p(raw.slice(32))]; return Buffer.from([0x30, body.length, ...body]); };
async function login(counter, tamper) {
  const anon = client();
  const o = await anon('/api/passkey/login-options');
  const cdj = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: o.data.challenge, origin: O }));
  const authData = Buffer.concat([rpHash, Buffer.from([0x05, 0, 0, 0, counter])]);
  const sig = Buffer.from(await wc.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Buffer.concat([authData, createHash('sha256').update(cdj).digest()])));
  if (tamper) sig[5] ^= 1;
  const res = await anon('/api/passkey/login', { id: b64u(credId), clientDataJSON: b64u(cdj), authenticatorData: b64u(authData), signature: b64u(toDer(sig)) });
  return { res, me: res.status === 200 ? await anon('/api/me') : null };
}
let L = await login(1); assert.equal(L.res.status, 200, JSON.stringify(L.res.data)); assert.equal(L.me.data.user.name, 'Philippe');
L = await login(2, true); assert.equal(L.res.status, 401, 'falsche Signatur');
L = await login(2); assert.equal(L.res.status, 200);
L = await login(2); assert.equal(L.res.status, 401, 'Zähler darf nicht zurückgehen');
await ad('/api/passkey', undefined, 'DELETE'); L = await login(5); assert.equal(L.res.status, 401, 'nach dem Entfernen ungültig');
console.log('ALLE PAKET-D-TESTS OK');
