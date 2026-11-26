import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeEnv, serve, calls } from './harness.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const worker = (await import('../build/worker.js')).default;
const env = makeEnv();
const { srv, flush } = await serve(worker, env, 8799);
const B = 'http://localhost:8799';
const browser = await chromium.launch();
const errors = [];
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
async function page(w = 390, intro = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, locale: 'de-DE', timezoneId: 'Europe/Berlin' });
  const p = await ctx.newPage();
  if (!intro) await p.addInitScript(() => { const g = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return String(k).startsWith('fa-intro-') ? '1' : g.call(this, k); }; });
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return p;
}
const closeToast = async (p) => { if (await p.locator('.toast').count()) await p.click('.toast [data-x=close]'); };
async function capture(p, text, waitFor) {
  await closeToast(p);
  await p.click('#fab'); await p.waitForSelector('#t');
  assert.ok(!/object/.test(await p.inputValue('#t')), 'Eingabefeld ohne Fremdtext');
  await p.fill('#t', text); await p.click('#go');
  await p.waitForSelector(waitFor ? `.toast:has-text("${waitFor}")` : '.toast');
  const t = (await p.textContent('.toast')).replace(/\s+/g, ' ');
  assert.equal(await p.locator('.sheet').count(), 0, 'Fenster schließt nach dem Merken');
  return t;
}
try {
  const ph = await page();
  await ph.goto(B);
  await ph.waitForSelector('#af input[name=code]');
  await ph.fill('[name=code]', 'geheim-123'); await ph.fill('[name=name]', 'Philippe'); await ph.fill('[name=password]', 'sicher123');
  await ph.click('#af [type=submit]');
  await ph.waitForSelector('.tab[data-v=heute]');
  assert.deepEqual((await ph.locator('.tab').allTextContents()).map((t) => t.replace(/\d+/g, '').trim()), ['Heute', 'Kalender', 'Einkauf', 'Ideen'], 'vier Reiter');
  await ph.waitForSelector('text=Müll rausbringen');
  assert.match(await ph.textContent('#counts'), /5\s*Einkauf/);
  await ph.screenshot({ path: 'test/shot-heute-leer.png', fullPage: true });

  // Erfassen über den Mikrofon-Knopf
  let t = await capture(ph, 'Zahnarzt Dienstag 15 Uhr, Conny muss den TÜV machen, Milch, im Frühjahr Hecke schneiden, Paket beim Nachbarn');
  console.log('Toast:', t);
  assert.match(t, /Termin: Zahnarzt/); assert.match(t, /Einkauf: Milch/); assert.match(t, /Neue Idee „Garten“/); assert.match(t, /Pinnwand/);
  assert.equal(await ph.locator('.pin').count(), 0, 'eigene Pinnwand-Notiz ist für mich schon gelesen');
  // Doppelter Einkauf wird erkannt
  t = await capture(ph, 'Milch'); assert.match(t, /Steht schon auf der Liste/);
  // Nicht sortierbar -> Eingang unter Ideen
  t = await capture(ph, 'kaputt, zweites Ding'); assert.match(t, /2 Notizen liegen im Eingang/);
  await closeToast(ph);
  assert.equal(await ph.locator('[data-badge=ideen]').textContent(), '2');
  await ph.click('.tab[data-v=ideen]');
  assert.equal(await ph.locator('.inbox').count(), 2);
  await ph.locator('.inbox').first().locator('[data-a=to-einkauf]').click();
  await ph.waitForTimeout(150);
  assert.equal(await ph.locator('.inbox').count(), 1);
  await ph.locator('.inbox [data-a=del]').click();
  assert.equal(await ph.locator('.inbox').count(), 0);
  await ph.click('.topic:has-text("Garten") summary');
  assert.match(await ph.textContent('.topic:has-text("Garten")'), /Hecke/);
  await ph.screenshot({ path: 'test/shot-ideen.png', fullPage: true });

  // Einkauf wie Bring!
  await ph.click('.tab[data-v=einkauf]');
  await ph.fill('#buyIn', 'Brot, Shampoo'); await ph.press('#buyIn', 'Enter');
  await ph.waitForSelector('.tile:has-text("Shampoo")');
  const heads = await ph.locator('#p .day').allTextContents();
  for (const h of ['Obst & Gemüse', 'Brot & Backwaren', 'Kühlregal', 'Drogerie']) assert.ok(heads.includes(h), 'Abteilung ' + h + ' in ' + heads);
  assert.ok(heads.indexOf('Obst & Gemüse') < heads.indexOf('Drogerie'), 'Ladenreihenfolge');
  assert.equal(await ph.locator('.tiles:below(.day:text("Obst & Gemüse")) >> nth=0').locator('.tile:has-text("Mandarinen")').count(), 1);
  await ph.screenshot({ path: 'test/shot-einkauf.png', fullPage: true });
  const milk = ph.locator('.tile').filter({ hasText: /^Milch$/ });
  await milk.click(); await ph.waitForTimeout(400);
  assert.equal(await milk.count(), 0, 'gekauft verschwindet');
  assert.match(await ph.textContent('.toast'), /Gekauft: Milch/);
  await ph.click('summary:has-text("Zuletzt gekauft")');
  await ph.click('[data-again]:has-text("Milch")'); await milk.waitFor();
  // Lange drücken = bearbeiten
  const tile = ph.locator('.tile').filter({ hasText: /^Brot$/ }); await ph.waitForTimeout(300);
  await tile.dispatchEvent('pointerdown'); await ph.waitForTimeout(700);
  await ph.waitForSelector('.sheet [name=menge]'); await ph.fill('.sheet [name=menge]', '2 Stück'); await ph.click('.sheet [type=submit]');
  await ph.waitForSelector('.tile:has-text("Brot") small:text("2 Stück")');

  // Einstellungen: Familie, Kalender, Zeiten
  await ph.click('#gear');
  await ph.click('summary:has-text("Neues Mitglied")');
  await ph.fill('#newu [data-k=name]', 'Conny');
  await ph.selectOption('#newu [data-k=role]', 'erwachsener');
  assert.equal(await ph.inputValue('#newu select[data-area=themen]'), 'edit');
  await ph.click('#newu [data-a=uadd]');
  await ph.waitForSelector('#newu [data-k=link] input');
  const link = await ph.inputValue('#newu [data-k=link] input'); assert.match(link, /einladung=/);
  await ph.click('[data-a=calfind]'); await ph.waitForSelector('[data-a=calpick]'); await ph.click('[data-a=calpick]');
  await ph.waitForSelector('text=Verbunden mit'); await flush();
  assert.ok([...calls.events.keys()].some((k) => k.endsWith('.ics')), 'Termine im Kalender');
  await ph.fill('[name=ruheVon]', '21:30'); await ph.click('#prefs [type=submit]'); await ph.waitForSelector('.toast:has-text("Zeiten gespeichert")');
  assert.equal(JSON.parse((await env.DB.prepare("SELECT prefs FROM users WHERE name='Philippe'").first()).prefs).ruheVon, '21:30');
  await ph.screenshot({ path: 'test/shot-einstellungen.png', fullPage: true });

  // Kalender: App-Termine + iPhone-Termine, Bearbeiten-Fenster
  await ph.waitForTimeout(4200);
  await ph.click('.tab[data-v=kalender]'); await ph.waitForSelector('.ev.ext:has-text("Training Max")');
  assert.ok(await ph.locator('.ev:has-text("Zahnarzt")').count() >= 1);
  await ph.screenshot({ path: 'test/shot-kalender.png', fullPage: true });
  await ph.locator('.ev:has-text("Zahnarzt")').first().click();
  await ph.waitForSelector('.sheet [name=erinnerung]');
  assert.equal(await ph.inputValue('.sheet [name=erinnerung]'), '60', 'Standard 1 Stunde');
  await ph.selectOption('.sheet [name=erinnerung]', '15'); await ph.fill('.sheet [name=z]', '16:30'); await ph.click('.sheet [type=submit]');
  await ph.waitForTimeout(200);
  const zr = await env.DB.prepare("SELECT data FROM docs WHERE data LIKE '%Zahnarzt%' AND deleted=0").first();
  const zd = JSON.parse(zr.data); assert.equal(zd.erinnerung, 15); assert.match(zd.start, /T16:30$/);
  await ph.locator('.ev.ext:has-text("Training Max")').first().click(); await ph.waitForSelector('.sheet:has-text("iPhone-Kalender")'); await ph.click('.sheet [data-close]');

  // Aufgabe an Conny
  t = await capture(ph, 'Conny muss den TÜV machen', 'TÜV'); assert.match(t, /Aufgabe für Conny: TÜV machen/);

  // Conny
  const co = await page();
  await co.goto(link.replace(/^https?:\/\/[^/]+/, B));
  await co.waitForSelector('text=Willkommen, Conny');
  await co.fill('[name=password]', 'conny-pw-1'); await co.click('#af [type=submit]');
  await co.waitForSelector('.tab[data-v=heute]');
  await co.waitForSelector('.pin:has-text("Paket")');
  assert.equal(await co.locator('[data-badge=heute]').textContent(), '1');
  await co.click('.pin [data-a=pinread]'); await co.waitForTimeout(150);
  assert.equal(await co.locator('.pin').count(), 0, 'Pinnwand nach Lesen weg');
  await co.click('#gear'); assert.equal(await co.locator('text=Neues Mitglied').count(), 0, 'Conny sieht keine Familienverwaltung');
  await co.click('.tab[data-v=heute]');
  await co.waitForSelector('.task:has-text("TÜV machen")');
  // Abhaken: verschwindet, landet unter "heute erledigt", Rückgängig geht
  const nTasks = await co.locator('#p > .card:has-text("Zu erledigen") > .task').count();
  await co.locator('.task:has-text("TÜV machen") input').first().click(); await co.waitForTimeout(200);
  assert.equal(await co.locator('#p > .card:has-text("Zu erledigen") > .task').count(), nTasks - 1, 'erledigte Aufgabe verschwindet');
  assert.match(await co.textContent('#p'), /1 heute erledigt/);
  await co.click('.toast [data-x=undo]'); await co.waitForTimeout(200);
  assert.equal(await co.locator('#p > .card:has-text("Zu erledigen") > .task').count(), nTasks, 'Rückgängig');
  await co.screenshot({ path: 'test/shot-heute.png', fullPage: true });

  // Kind
  await ph.click('#gear'); if (!(await ph.isVisible('#newu [data-k=name]'))) await ph.click('summary:has-text("Neues Mitglied")');
  await ph.fill('#newu [data-k=name]', 'Max');
  assert.equal(await ph.inputValue('#newu [data-k=role]'), 'kind');
  await ph.click('#newu [data-a=uadd]'); await ph.waitForSelector('#newu [data-k=link] input');
  const link2 = await ph.inputValue('#newu [data-k=link] input');
  const kid = await page();
  await kid.goto(link2.replace(/^https?:\/\/[^/]+/, B)); await kid.fill('[name=password]', 'max-pw-123'); await kid.click('#af [type=submit]');
  await kid.waitForSelector('.tab[data-v=einkauf]');
  assert.deepEqual((await kid.locator('.tab').allTextContents()).map((x) => x.replace(/\d+/g, '').trim()), ['Heute', 'Kalender', 'Einkauf'], 'Kind ohne Ideen');
  t = await capture(kid, 'Zahnarzt Dienstag 15 Uhr und Milch');
  console.log('Kind-Toast:', t);
  assert.match(t, /Vorschlag: Zahnarzt/); assert.match(t, /Steht schon auf der Liste: Milch/);
  await kid.click('.tab[data-v=kalender]'); assert.match(await kid.textContent('#p'), /Vorschlag von Ich/);
  assert.equal(await kid.locator('.ev.ext').count(), 0, 'Kind (nur meins) sieht keine iPhone-Termine');
  await kid.screenshot({ path: 'test/shot-kind.png', fullPage: true });
  // Philippe bestätigt
  await ph.reload(); await ph.waitForSelector('.card:has-text("Vorschläge zum Bestätigen")');
  const before = calls.events.size;
  await ph.locator('.ev.prop').first().click(); await ph.click('.sheet [data-a=approve]'); await ph.waitForTimeout(300); await flush();
  assert.equal(calls.events.size, before + 1, 'bestätigter Vorschlag im Kalender');

  // Paket A: Neu-Markierung, Umwandeln, Profil ohne Anmeldung, Farben
  await ph.evaluate(() => { localStorage.setItem('fa-seen-' + 'x', '1'); });
  await co.reload(); await co.waitForSelector('.tab[data-v=heute]');
  await ph.waitForTimeout(50);
  await capture(ph, 'Conny muss den TÜV machen', 'TÜV');
  await co.reload(); await co.waitForSelector('.tab[data-v=heute]'); await co.waitForTimeout(500);
  await co.waitForSelector('.card:has-text("Neu seit deinem letzten Besuch")');
  assert.match(await co.textContent('.card:has-text("Neu seit")'), /TÜV machen/);
  assert.ok(await co.locator('.task.new').count() >= 1, 'neue Aufgabe markiert');
  assert.ok(await co.locator('.task i.dot').count() >= 1, 'Farbpunkt der Person');
  await co.click('[data-a=seen]'); await co.waitForTimeout(100);
  assert.equal(await co.locator('.card:has-text("Neu seit")').count(), 0);
  await ph.click('.tab[data-v=kalender]'); await ph.locator('.ev:has-text("Zahnarzt")').first().click();
  await ph.selectOption('.sheet [name=kind]', 'aufgabe'); await ph.waitForTimeout(300);
  assert.equal(await ph.inputValue('.sheet [name=faellig]'), '2026-12-01', 'Datum wird übernommen');
  await ph.click('.sheet [data-close]');
  const conv = JSON.parse((await env.DB.prepare("SELECT data FROM docs WHERE data LIKE '%Zahnarzt%' AND data LIKE '%aufgabe%'").first()).data); assert.equal(conv.kind, 'aufgabe');
  await ph.click('#gear'); if (!(await ph.isVisible('#newu [data-k=name]'))) await ph.click('summary:has-text("Neues Mitglied")');
  await ph.fill('#newu [data-k=name]', 'Lina'); await ph.check('#newu [data-k=profil]'); await ph.click('#newu [data-a=uadd]');
  await ph.waitForSelector('#newu :text("Lina ist angelegt")');
  await ph.screenshot({ path: 'test/shot-einstellungen2.png', fullPage: true });

  // Paket B: Zeile in der Meldung öffnet den Eintrag, Serie Termin/Aufgabe, Vorkommen absagen, Kurzbefehl-Link
  await ph.click('.tab[data-v=heute]');
  t = await capture(ph, 'Max hat jeden Dienstag 17:30 Training', 'Serientermin');
  await ph.click('.toast [data-x=ask]'); await ph.waitForSelector('.toast:has-text("wiederkehrende Aufgabe")');
  await ph.click('.toast [data-x=open]'); await ph.waitForSelector('.sheet [name=rhythmus]'); await ph.click('.sheet [data-close]');
  await capture(ph, 'Max hat jeden Dienstag 17:30 Training', 'Serientermin');
  await ph.click('.tab[data-v=kalender]');
  assert.ok(await ph.locator('.ev:has-text("Training Max")').count() >= 4, 'Serie erscheint jede Woche');
  assert.match(await ph.locator('.ev:not(.ext):has-text("Training Max")').first().textContent(), /jede Woche/);
  await ph.locator('.ev:not(.ext):has-text("Training Max")').nth(1).click(); await ph.click('.sheet [data-a=skip]'); await ph.waitForTimeout(200);
  const nSerie = await ph.locator('.ev:not(.ext):has-text("Training Max")').count();
  assert.ok(nSerie >= 3, 'ein Termin abgesagt, Rest bleibt');
  await ph.click('#gear'); await ph.click('[data-a=qnew]'); await ph.waitForSelector('[aria-label="Dein persönlicher Link"]');
  const qlink = await ph.inputValue('[aria-label="Dein persönlicher Link"]'); assert.match(qlink, /\/q\//);
  const qr = await fetch(qlink.replace(/^https?:\/\/[^/]+/, B), { method: 'POST', body: 'Milch' }); assert.match(await qr.text(), /Milch/);

  // Paket C: Woche/Tag, Suche, Kommentar, Ideen, Familien-Infos, Family Wall, Einführung
  await ph.click('.tab[data-v=kalender]'); await ph.click('[data-a=calmode][data-m=woche]');
  assert.equal(await ph.locator('.wday').count(), 7); await ph.click('[data-a=calnext]');
  assert.ok(await ph.locator('.wday .ev:has-text("Training Max")').count() >= 1, 'Woche zeigt Serie');
  await ph.screenshot({ path: 'test/shot-woche.png', fullPage: true });
  await ph.click('[data-a=calmode][data-m=tag]'); assert.ok(await ph.locator('.calnav').count() === 1);
  await ph.click('[data-a=calmode][data-m=liste]');
  await ph.click('#find'); await ph.fill('#sq', 'Hecke'); await ph.waitForSelector('.card:has-text("Ideen (")');
  await ph.fill('#sq', 'TÜV'); await ph.waitForSelector('.card:has-text("Aufgaben (")');
  await ph.locator('.task:has-text("TÜV") .tb').first().click(); await ph.fill('#cmtf [name=c]', 'Termin beim TÜV ist Montag'); await ph.click('#cmtf [type=submit]');
  await ph.waitForSelector('.cmt:has-text("Termin beim TÜV ist Montag")'); await ph.click('.sheet [data-close]');
  await ph.click('.tab[data-v=ideen]'); await ph.click('.topic:has-text("Garten") summary'); await ph.click('.topic:has-text("Garten") [data-a=later]');
  await ph.click('.sheet [data-n=m3]'); await ph.waitForSelector('.toast:has-text("Meldet sich am")');
  await ph.screenshot({ path: 'test/shot-ideen.png', fullPage: true });
  await ph.click('#gear'); await ph.click('[data-go=infos]'); await ph.click('[data-a=infoadd]');
  await ph.fill('#infof [name=titel]', 'Kinderarzt Dr. Meier'); await ph.fill('#infof [name=text]', 'Tel. 0211 123456'); await ph.selectOption('#infof [name=kat]', 'Ärzte'); await ph.click('#infof [type=submit]');
  await ph.waitForSelector('.info:has-text("Kinderarzt") a[href^="tel:"]');
  await ph.click('[data-a=infoadd]'); await ph.fill('#infof [name=titel]', 'Bank'); await ph.fill('#infof [name=text]', 'PIN 1234'); await ph.click('#infof [type=submit]');
  await ph.waitForSelector('.toast:has-text("gehören nicht in die App")'); await ph.click('.sheet [data-close]');
  // Tablet mit Family Wall
  await ph.click('#gear'); if (!(await ph.isVisible('#newu [data-k=name]'))) await ph.click('summary:has-text("Neues Mitglied")');
  await ph.fill('#newu [data-k=name]', 'Küche'); await ph.selectOption('#newu [data-k=role]', 'tablet'); await ph.uncheck('#newu [data-k=profil]'); await ph.click('#newu [data-a=uadd]');
  await ph.waitForSelector('#newu [data-k=link] input'); const tlink = await ph.inputValue('#newu [data-k=link] input');
  const tab = await page(1024);
  await tab.goto(tlink.replace(/^https?:\/\/[^/]+/, B)); await tab.fill('[name=password]', 'kueche-pw-1'); await tab.click('#af [type=submit]');
  await tab.waitForSelector('.wall'); assert.deepEqual((await tab.locator('.tab').allTextContents()).map((x) => x.replace(/\d+/g, '').trim()), ['Wand', 'Kalender', 'Einkauf']);
  assert.ok(await tab.locator('.pcol').count() >= 4, 'eine Spalte pro Person + Alle');
  assert.ok(await tab.locator('.pcol:has-text("Lina")').count() === 1, 'Kind ohne iPhone hat eine Spalte');
  assert.equal(await tab.locator('text=Hecke').count(), 0, 'keine Erwachsenen-Ideen auf dem Tablet');
  await tab.screenshot({ path: 'test/shot-wand.png', fullPage: true });
  // Breite Ansicht für Erwachsene
  const wideP = await page(1280); await wideP.goto(B); await wideP.fill('[name=name]', 'Philippe'); await wideP.fill('[name=password]', 'sicher123'); await wideP.click('#af [type=submit]');
  await wideP.waitForSelector('.cols'); await wideP.screenshot({ path: 'test/shot-ipad.png' });
  // Einführung beim ersten Start
  const fresh = await page(390, true); await fresh.goto(B); await fresh.fill('[name=name]', 'Philippe'); await fresh.fill('[name=password]', 'sicher123'); await fresh.click('#af [type=submit]');
  await fresh.waitForSelector('.sheet:has-text("Willkommen")'); await fresh.screenshot({ path: 'test/shot-intro.png' });
  await fresh.click('.sheet [data-a=startcap]'); await fresh.waitForSelector('#t');

  // Von Hand anlegen: Termin, Aufgabe, Idee
  await ph.click('.tab[data-v=kalender]'); await ph.click('[data-a=new][data-k=termin]');
  await ph.fill('#newf [name=titel]', 'Elternsprechtag'); await ph.fill('#newf [name=d]', '2026-12-03'); await ph.fill('#newf [name=z]', '18:00'); await ph.click('#newf [type=submit]');
  await ph.waitForSelector('.toast:has-text("Termin: Elternsprechtag")'); await ph.click('[data-a=calmode][data-m=liste]');
  await ph.waitForSelector('.ev:has-text("Elternsprechtag")');
  await ph.click('.tab[data-v=ideen]'); await ph.click('[data-a=new][data-k=gedanke]');
  await ph.fill('#newf [name=thema]', 'Weihnachten'); await ph.fill('#newf [name=text]', 'Plätzchen mit den Kindern backen'); await ph.click('#newf [type=submit]');
  await ph.waitForSelector('.topic:has-text("Weihnachten")'); assert.match(await ph.textContent('.topic:has-text("Weihnachten")'), /Plätzchen/);
  await ph.click('.tab[data-v=heute]'); await ph.click('.card:has-text("Zu erledigen") [data-a=new]');
  await ph.fill('#newf [name=titel]', 'Winterreifen aufziehen'); await ph.click('#newf [type=submit]');
  await ph.waitForSelector('.task:has-text("Winterreifen")');

  // Pinnwand: anpinnen, Übersicht, abnehmen
  await ph.click('.tab[data-v=heute]'); await ph.click('[data-a=pinnew]');
  await ph.fill('#pinf textarea', 'Oma kommt Sonntag zum Kaffee'); await ph.click('#pinf [type=submit]');
  await ph.waitForSelector('.toast:has-text("Angepinnt")');
  await ph.click('[data-go=pinnwand]'); await ph.waitForSelector('.pin:has-text("Oma kommt Sonntag")');
  await ph.screenshot({ path: 'test/shot-pinnwand.png', fullPage: true });
  await ph.locator('.pin:has-text("Oma kommt Sonntag") [data-a=pinoff]').click(); await ph.waitForTimeout(200);
  assert.equal(await ph.locator('.pin:has-text("Oma kommt Sonntag")').count(), 0, 'abgenommen');

  // Paket D: Listen, Einkaufs-Hinweis, Wochenvorschau, Face ID
  await ph.click('.tab[data-v=einkauf]'); await ph.click('[data-a=listadd]');
  await ph.fill('#listf [name=name]', 'Packliste Urlaub'); await ph.selectOption('#listf [name=typ]', 'liste'); await ph.click('#listf [type=submit]');
  await ph.waitForSelector('.card:has-text("Packliste Urlaub")');
  await ph.fill('#buyIn', 'Sonnencreme, Pässe'); await ph.press('#buyIn', 'Enter'); await ph.waitForSelector('.task:has-text("Pässe")');
  await ph.locator('.task:has-text("Pässe") input').click(); await ph.waitForTimeout(150);
  assert.equal(await ph.locator('.task.done:has-text("Pässe")').count(), 1, 'Haken bleibt sichtbar');
  await ph.click('[data-a=listreset]'); await ph.waitForTimeout(150); assert.equal(await ph.locator('.task.done').count(), 0);
  await ph.screenshot({ path: 'test/shot-packliste.png', fullPage: true });
  await ph.click('[data-a=list][data-l=""]'); assert.equal(await ph.locator('.tile:has-text("Sonnencreme")').count(), 0, 'Listen getrennt');
  await ph.click('[data-a=shopgo]'); await ph.waitForSelector('.toast');
  await ph.click('#gear'); await ph.check('[name=wocheAus]'); await ph.click('#prefs [type=submit]'); await ph.waitForSelector('.toast:has-text("Zeiten gespeichert")');
  assert.equal(JSON.parse((await env.DB.prepare("SELECT prefs FROM users WHERE name='Philippe'").first()).prefs).woche, 'aus');
  // Face ID mit virtuellem Authenticator
  const cdp = await ph.context().newCDPSession(ph);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true } });
  await ph.click('#gear'); await ph.click('[data-a=fidadd]'); await ph.waitForSelector('.toast:has-text("Face ID ist eingerichtet")');
  await ph.click('[data-a=logout]'); await ph.waitForSelector('#fidlogin'); await ph.click('#fidlogin');
  await ph.waitForSelector('.tab[data-v=heute]'); assert.match(await ph.textContent('#hello'), /Philippe/);

  // Essensplan + Zutaten
  await ph.click('.tab[data-v=einkauf]'); await ph.click('summary:has-text("Essensplan")');
  const meal = ph.locator(`[data-d="${today}"] input`); await meal.fill('Lasagne'); await meal.press('Enter');
  await ph.waitForSelector("[data-a=zutaten]", { timeout: 5000 }).catch(async (e) => { await ph.screenshot({ path: "/tmp/fail.png", fullPage: true }); console.log("F", JSON.stringify(await env.DB.prepare("SELECT data FROM docs WHERE coll='essen'").all())); throw e; }); await ph.click("[data-a=zutaten]");
  await ph.waitForSelector('#zutf'); await ph.click('#zutf [type=submit]');
  await ph.waitForSelector('.toast:has-text("Zutaten")');
  // Liste mit Einkaufstag (Tag vor dem Essen) wird vorgeschlagen; gleiche Zutaten werden zusammengeführt
  const d2 = new Date(today + 'T12:00:00'); d2.setDate(d2.getDate() + 2); const day2 = d2.toISOString().slice(0, 10);
  const shopTag = String((d2.getDay() + 6) % 7);
  await ph.click('[data-a=listadd]'); await ph.fill('#listf [name=name]', 'Frisch'); await ph.selectOption('#listf [name=tag]', shopTag); await ph.click('#listf [type=submit]');
  await ph.waitForTimeout(200); await ph.click('[data-a=list][data-l=""]');
  if (!(await ph.isVisible(`[data-d="${day2}"] input`))) await ph.click('summary:has-text("Essensplan")');
  const meal2 = ph.locator(`[data-d="${day2}"] input`); await meal2.fill('Lasagne'); await meal2.press('Enter');
  await ph.locator(`[data-d="${day2}"] [data-a=zutaten]`).click(); await ph.waitForSelector('#zutf');
  const fr = await ph.inputValue('#zutf [name=liste]'); assert.notEqual(fr, '', 'Liste mit passendem Einkaufstag vorgeschlagen');
  await ph.selectOption('#zutf [name=liste]', ''); await ph.uncheck('#zutf [name=z1]'); await ph.click('#zutf [type=submit]');
  await ph.waitForSelector('.toast:has-text("zusammengeführt")');
  const hack = JSON.parse((await env.DB.prepare("SELECT data FROM docs WHERE data LIKE '%Hackfleisch%' AND data NOT LIKE '%\"done\":true%'").first()).data);
  assert.equal(hack.menge, '1 kg', '500 g + 500 g'); assert.equal(hack.quellen.length, 2);
  await ph.fill('#buyIn', '200g Hackfleisch'); await ph.press('#buyIn', 'Enter'); await ph.waitForTimeout(200);
  const hack2 = JSON.parse((await env.DB.prepare("SELECT data FROM docs WHERE data LIKE '%Hackfleisch%' AND data NOT LIKE '%\"done\":true%'").first()).data); assert.equal(hack2.menge, '1,2 kg', 'Hand-Eintrag wird mitgezählt');
  // Rezept-Link: lesen, anzeigen, Zutaten aus dem echten Rezept (auf Personen umgerechnet)
  const d3 = new Date(today + 'T12:00:00'); d3.setDate(d3.getDate() + 3); const day3 = d3.toISOString().slice(0, 10);
  const meal3 = ph.locator(`[data-d="${day3}"] input`); await meal3.fill('Curry'); await meal3.press('Enter');
  await ph.locator(`[data-d="${day3}"] [data-a=rezept]`).click();
  await ph.fill('#rezf [name=url]', 'https://www.rezepte.example/curry'); await ph.click('#rezf [type=submit]');
  await ph.waitForSelector(`[data-d="${day3}"] a.recipe:has-text("Hähnchen-Curry & Reis")`);
  assert.equal(await ph.getAttribute(`[data-d="${day3}"] a.recipe`, 'href'), 'https://www.rezepte.example/curry');
  await ph.locator(`[data-d="${day3}"] [data-a=zutaten]`).click(); await ph.waitForSelector('#zutf');
  assert.ok(await ph.locator('.sheet a.recipe').count() === 1, 'Rezept im Zutaten-Fenster verlinkt');
  const ppl = Number(await ph.inputValue('#zutf [name=personen]'));
  assert.equal(await ph.inputValue('#zutf [name=m0]'), (300 * ppl / 2 >= 1000 ? (300 * ppl / 2000).toLocaleString('de-DE') + ' kg' : 300 * ppl / 2 + ' g'), 'auf Personenzahl umgerechnet');
  await ph.fill('#zutf [name=personen]', '2'); assert.equal(await ph.inputValue('#zutf [name=m0]'), '300 g');
  assert.equal(await ph.isChecked('#zutf [name=z3]'), false, 'Öl ist abgewählt'); assert.equal(await ph.isChecked('#zutf [name=z4]'), false, 'Salz ist abgewählt');
  await ph.screenshot({ path: 'test/shot-rezept.png', fullPage: true });
  await ph.click('#zutf [type=submit]'); await ph.waitForSelector('.toast:has-text("Zutaten")');
  const hb = JSON.parse((await env.DB.prepare("SELECT data FROM docs WHERE coll='eintraege' AND data LIKE '%Hähnchenbrust%'").first()).data);
  assert.equal(hb.menge, '300 g'); assert.equal(hb.rezepte[0].url, 'https://www.rezepte.example/curry');
  await ph.screenshot({ path: 'test/shot-zutaten.png', fullPage: true });

  // Offline im Laden: abhaken, später nachholen
  await ph.context().setOffline(true);
  await ph.click('.tile:has-text("Bananen")'); await ph.waitForTimeout(500);
  assert.match(await ph.textContent('#banner'), /Offline/);
  let bd = JSON.parse((await env.DB.prepare("SELECT data FROM docs WHERE data LIKE '%Bananen%'").first()).data); assert.equal(bd.done, false, 'noch nicht beim Server');
  await ph.context().setOffline(false); await ph.evaluate(() => window.dispatchEvent(new Event('online'))); await ph.waitForTimeout(800);
  bd = JSON.parse((await env.DB.prepare("SELECT data FROM docs WHERE data LIKE '%Bananen%'").first()).data); assert.equal(bd.done, true, 'nachgeholt');

  // Erledigtes löschen: Aufgaben und Ideen
  await ph.click('.tab[data-v=heute]'); await ph.click('[data-go=aufgaben]');
  await ph.locator('.task:has-text("Winterreifen") input').first().click(); await ph.waitForTimeout(150);
  await ph.click('summary:has-text("Zuletzt erledigt")');
  await ph.locator('.task.done:has-text("Winterreifen") [data-a=del]').click(); await ph.waitForTimeout(150);
  assert.equal(await ph.locator('.task:has-text("Winterreifen")').count(), 0, 'einzeln gelöscht');
  if (await ph.locator('[data-a=deldone]').count()) { await ph.click('[data-a=deldone]'); await ph.click('[data-a=deldone]'); await ph.waitForTimeout(200); }
  assert.equal(await ph.locator('summary:has-text("Zuletzt erledigt")').count(), 0, 'alle erledigten gelöscht');
  await ph.click('.tab[data-v=ideen]');
  if (!(await ph.isVisible('.topic:has-text("Weihnachten") [data-a=tdone]'))) await ph.click('.topic:has-text("Weihnachten") summary');
  // Einzelnen Gedanken im Thema löschen (Thema bleibt)
  const nL = await ph.locator('.topic:has-text("Weihnachten") .lines li').count();
  assert.ok(nL >= 1, 'Gedanken sichtbar');
  const li0 = ph.locator('.topic:has-text("Weihnachten") .lines li').first();
  const gtxt = (await li0.locator('.ltxt').innerText()).split(' ·')[0].trim();
  await li0.locator('[data-a=edel]').click(); await ph.waitForTimeout(100);
  assert.equal(await ph.locator('.topic:has-text("Weihnachten") .lines li').count(), nL, 'erster Tipp fragt nur nach');
  if (!(await ph.isVisible('.topic:has-text("Weihnachten") [data-a=edel]'))) await ph.click('.topic:has-text("Weihnachten") summary');
  await ph.locator('.topic:has-text("Weihnachten") .lines li').first().locator('[data-a=edel]').click(); await ph.waitForTimeout(250);
  assert.equal(await ph.locator('.topic:has-text("Weihnachten") .lines li').count(), nL - 1, 'Gedanke gelöscht');
  assert.equal(await ph.locator('.topic:has-text("Weihnachten")').count(), 1, 'Thema bleibt');
  if (!(await ph.isVisible('.topic:has-text("Weihnachten") [data-a=tdone]'))) await ph.click('.topic:has-text("Weihnachten") summary');
  await ph.click('.topic:has-text("Weihnachten") [data-a=tdone]'); await ph.waitForTimeout(150);
  await ph.click('summary:has-text("Erledigt (")'); if (!(await ph.isVisible('.topic:has-text("Weihnachten") [data-a=tdel]'))) await ph.click('.topic:has-text("Weihnachten") summary');
  await ph.click('.topic:has-text("Weihnachten") [data-a=tdel]'); await ph.click('.topic:has-text("Weihnachten") [data-a=tdel]'); await ph.waitForTimeout(200);
  assert.equal(await ph.locator('.topic:has-text("Weihnachten")').count(), 0, 'erledigte Idee gelöscht');
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM docs WHERE data LIKE '%Plätzchen%' AND deleted=0").first()).n, 0, 'Gedanken mit gelöscht');

  // Breiten
  const wide = await page(1280); await wide.goto(B); await wide.fill('[name=name]', 'Philippe'); await wide.fill('[name=password]', 'sicher123'); await wide.click('#af [type=submit]');
  await wide.waitForSelector('.tab'); await wide.screenshot({ path: 'test/shot-desktop.png' });
  assert.ok(await wide.evaluate(() => document.documentElement.scrollWidth) <= 1280);
  for (const p of [ph, co, kid]) assert.ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, 'kein Querscrollen am Handy');
  assert.deepEqual(errors, []);
  console.log('ALLE UI-TESTS OK');
} finally {
  await browser.close(); srv.close();
}
