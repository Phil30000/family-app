import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { makeEnv, serve } from './harness.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const worker = (await import('../build/worker.js')).default;
const { srv } = await serve(worker, makeEnv(), 8797);
const B='http://localhost:8797';
const browser = await chromium.launch();const errs=[];
const np=async(w=390)=>{const c=await browser.newContext({viewport:{width:w,height:900},locale:'de-DE'});const p=await c.newPage();p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push(m.text())});await p.addInitScript(()=>{const g=Storage.prototype.getItem;Storage.prototype.getItem=function(k){return String(k).startsWith('fa-intro-')?'1':g.call(this,k)}});return p};
try{
const p=await np();await p.goto(B);await p.waitForSelector('#af input[name=code]');
await p.fill('[name=code]','geheim-123');await p.fill('[name=name]','Philippe');await p.fill('[name=password]','sicher123');await p.click('#af [type=submit]');
await p.waitForSelector('.tab[data-v=heute]');
await p.click('#gear');await p.waitForSelector('#newu',{state:'attached'});
await p.click('summary:has-text("Neues Mitglied")');
await p.fill('#newu [data-k=name]','Family');await p.selectOption('#newu [data-k=role]','tablet');
await p.click('[data-a=uadd]');await p.waitForTimeout(500);
const link=await p.evaluate(()=>{const i=document.querySelector('#newu [data-k=link] input');return i&&i.value});
assert.ok(link,'Einladungslink');
// edit tablet user
const u=p.locator('details.user:has-text("Family")');await u.locator('summary').first().click();await u.locator('summary:has-text("Rechte")').click();

await u.locator('select[data-area=termine]').selectOption('edit');await u.locator('select[data-area=themen]').selectOption('view');
await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await p.waitForTimeout(400);assert.ok(await u.locator('select[data-area=termine]').isVisible(),'Rechte bleiben offen');assert.equal(await u.locator('select[data-area=termine]').inputValue(),'edit','Auswahl bleibt nach Neuzeichnen');
await u.locator('[data-a=usave]').click();await p.waitForTimeout(500);
const fam=(await (await p.request.get(B+'/api/admin/users')).json()).users.find(x=>x.name==='Family');assert.equal(fam.perms.termine,'edit');assert.equal(fam.perms.themen,'view');
// tablet login
if(link){const t=await np(1100);await t.goto(link);await t.waitForTimeout(800);
 const pw=t.locator('input[type=password]');
 if(await pw.count()){await pw.first().fill('tablet1234');if(await pw.count()>1)await pw.nth(1).fill('tablet1234');await t.click('#af [type=submit]');}
 await t.waitForTimeout(1200);
 await t.click('#gear');await t.waitForTimeout(400);await t.screenshot({path:'test/shot-tablet-einstellungen.png',fullPage:true});assert.equal(await t.textContent('#hello'),'Unsere Familie');
}
assert.deepEqual(errs.filter(e=>!/401/.test(e)),[]);console.log('tablet ok');
}finally{await browser.close();srv.close()}
