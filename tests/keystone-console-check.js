// The projection controls on the Manager's Setup tab: angle buttons, marking the sheet's corners by tapping the camera picture,
// Fit to the sheet, and that the Setup tab still fits a 2960 x 1848 tablet with them. Needs dist/test.html and WebGL.
const { chromium } = require('playwright');
const { dist, out, unlockManager } = require('./lib');
const { startFake } = require('./fake-rtdb');
const fails = [], notes = [];
const check = (ok, what) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const fake = await startFake();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  async function phone(file, role, vp) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(url => { try { if (!localStorage.getItem('putt-lab-relay-url')) localStorage.setItem('putt-lab-relay-url', url); } catch (e) {} }, fake.url);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(role + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(role + ' console: ' + m.text()); });
    await page.goto(dist(file, role)); await page.waitForTimeout(400);
    return page;
  }
  const until = async (fn, ms = 8000, step = 150) => { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > ms) return false; await sleep(step); } };
  const host = await phone('test.html', 'host', { width: 1280, height: 720 });
  const mgr = await phone('index.html', 'manage', { width: 2960, height: 1848 });
  await host.click('#btnPair');
  const code = await until(async () => { const t = (await host.locator('#pairCode').innerText()).replace('-', '').trim(); return t.length === 8 && t; });
  await mgr.fill('#mgrCodeIn', code); await mgr.click('#mgrJoinBtn');
  check(await until(() => mgr.locator('#mgrRun').isVisible()), 'Manager paired with the test Host');
  await host.click('#pairClose');
  const geo = { proj: [[0.12,0.08],[0.86,0.10],[0.97,0.95],[0.03,0.93]], sheet: [[0.30,0.20],[0.70,0.24],[0.88,0.82],[0.10,0.78]] };
  await unlockManager(mgr); await mgr.click('.mgr-tab[data-tab="setup"]');
  await mgr.click('[data-step="cam"] [data-args]');
  check(await until(() => host.evaluate(() => window.__lab.LIVE.src === 'sim'), 15000), 'The camera starts from the console');
  await host.evaluate(g => { const L = window.__lab; L.simCam.noise = 0.02; L.simCam.quad = g.proj; L.simCam.sheet = g.sheet; }, geo);
  check(await until(async () => Number(await mgr.locator('#mgrPv').getAttribute('data-seq')) >= 2, 15000), 'Camera pictures arrive');
  const ks = () => host.evaluate(() => ({ ...window.__lab.LIVE.ks }));

  // ---- angle buttons ----
  for (let i = 0; i < 3; i++) await mgr.click('[data-ks="v,0.5"]');
  check(await until(async () => (await ks()).v === 1.5), 'Three + taps on Top / bottom set 1.5° on the Host (quick taps add up)');
  check(/1\.5° top narrower/.test(await mgr.locator('#mgrKsV').innerText()), 'The console says what the angle does');
  await mgr.click('[data-ks="h,-2"]'); await mgr.click('[data-ks="r,2"]');
  check(await until(async () => { const k = await ks(); return k.h === -2 && k.r === 2; }), 'Left / right and Turn follow too');
  check(await host.evaluate(() => !!window.__lab.LIVE.pin), 'The Host now has an angled picture');
  await mgr.click('[data-cmd="ksreset"]');
  check(await until(async () => { const k = await ks(); return !k.v && !k.h && !k.r; }), 'Zero angles puts them back');
  check(await host.evaluate(() => !window.__lab.LIVE.pin), 'The picture is square to the screen again');

  // ---- mark the sheet's corners by tapping the picture, then fit ----
  await mgr.click('#mgrMarkBtn');
  const box = await mgr.locator('#mgrPv').boundingBox();
  for (const [u, v] of geo.sheet) await mgr.mouse.click(box.x + u * box.width, box.y + v * box.height);
  check(await until(() => host.evaluate(() => window.__lab.LIVE.sheetHand && window.__lab.LIVE.sheet && window.__lab.LIVE.sheet.length === 4)), 'Four taps on the picture mark the sheet on the Host');
  check(await until(async () => !(await mgr.locator('#mgrMarkClr').isHidden())), 'A button to clear the marked corners appears');
  await mgr.click('[data-cmd="autofit"]');
  check(await until(async () => /Fitting/.test(await mgr.locator('#mgrBusy').innerText()), 10000), 'The console shows that the fit is running');
  check(await until(() => host.evaluate(() => window.__lab.LIVE.fitInfo), 150000, 500), 'Fit to the sheet finishes on the Host');
  const fi = await host.evaluate(() => window.__lab.LIVE.fitInfo); check(fi && fi.err < 1.5, `The picture's corners are within ${fi ? fi.err : '-'} in of the sheet's`);
  check(await until(async () => /lands on the sheet/.test(await mgr.locator('[data-step="fit"] .note').first().innerText())), 'The console shows the result');
  check(await until(async () => /fitted to the sheet/.test(await mgr.locator('[data-step="fit"] .st').innerText())), 'The checklist says the projection was fitted');
  await mgr.click('#mgrMarkClr');
  check(await until(() => host.evaluate(() => !window.__lab.LIVE.sheet)), 'Clearing the marked corners works');

  // ---- the tab still fits the tablet ----
  await sleep(1500);
  const r = await mgr.evaluate(() => { const d = document.documentElement; return { sh: d.scrollHeight, ih: innerHeight, sw: d.scrollWidth, iw: innerWidth }; });
  check(r.sh <= r.ih && r.sw <= r.iw, `Setup with the projection controls fits 2960 x 1848 (${r.sw}x${r.sh})`);
  await mgr.screenshot({ path: out + '/keystone-setup.png' });
  await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
