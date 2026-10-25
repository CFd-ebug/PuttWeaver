// The Manager's Debug tab against a Host with the simulated camera (needs dist/test.html and WebGL): live numbers, overlay and
// detection switches, tuning sliders, the log, the report, the picture switch, and that details stop when the tab is left.
const { chromium } = require('playwright');
const { dist, unlockManager } = require('./lib');
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
    return { ctx, page };
  }
  const txt = (p, sel) => p.locator(sel).first().innerText();
  const until = async (fn, ms = 8000, step = 150) => { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > ms) return false; await sleep(step); } };

  const host = await phone('test.html', 'host', { width: 1280, height: 720 });
  const mgr = await phone('index.html', 'manage', { width: 430, height: 900 });
  await host.page.click('#btnPair');
  const code = await until(async () => { const t = (await txt(host.page, '#pairCode')).replace('-', '').trim(); return t.length === 8 && t; });
  await mgr.page.fill('#mgrCodeIn', code); await mgr.page.click('#mgrJoinBtn');
  check(await until(() => mgr.page.locator('#mgrRun').isVisible()), 'Manager paired with the test Host');
  await host.page.click('#pairClose');
  const room = await host.page.evaluate(() => localStorage.getItem('putt-lab-room'));
  const H = () => host.page.evaluate(() => { const L = window.__lab.LIVE; return { src: L.src, dbg: L.dbg, fps: L.fpsHud, mark: L.mark, method: L.method, zone: L.startZone, proc: L.pwTarget, res: L.res, corner: L.dbgCorner, hue: L.color.dh, still: L.rest.t, cut: L.sig.cut, guard: L.busyThr, log: L.log.map(e => e.msg) }; });

  // start the simulated camera from Setup, then go to Debug
  check(!await mgr.page.locator('.mgr-tab[data-tab="debug"]').isVisible(), 'Setup and Debug start out hidden behind the lock');
  await unlockManager(mgr.page);
  await mgr.page.click('.mgr-tab[data-tab="setup"]'); await mgr.page.click('[data-args]');
  check(await until(async () => (await H()).src === 'sim', 15000), 'Simulated camera is on');
  await mgr.page.click('.mgr-tab[data-tab="debug"]');
  check(await mgr.page.locator('#mgrTabDebug').isVisible() && !await mgr.page.locator('#mgrTabSetup').isVisible(), 'The Debug tab replaces the Setup tab');
  check(await until(() => fake.get('rooms/' + room + '/want/debug')), 'Opening Debug tells the Host that details are wanted');
  check(await until(() => (fake.get('rooms/' + room + '/state') || {}).debug), 'The Host adds debug details to its state');
  const state = fake.get('rooms/' + room + '/state'); check(JSON.stringify(state).length < 20000, 'The state stays small (' + (JSON.stringify(state).length / 1000).toFixed(1) + ' kB)');

  // ---- numbers ----
  check(await until(async () => /\d+ display/.test(await txt(mgr.page, '#mgrKv')) && /\d+ analyzed/.test(await txt(mgr.page, '#mgrKv')), 10000), 'Frame rates are shown (' + (await txt(mgr.page, '#mgrKv dd:nth-of-type(2)')) + ')');
  check(/still|MOVING/.test(await txt(mgr.page, '#mgrKv')), 'The movement guard row is shown');
  check(await until(async () => /Simulated camera on/.test(await txt(mgr.page, '#mgrDbgLog'))), 'The Host log appears on the Manager');

  // ---- switches ----
  await mgr.page.check('[data-opt="dbg"]'); check(await until(async () => (await H()).dbg === true), 'Match overlay switch turns on the Host overlay');
  await mgr.page.check('[data-opt="fps"]'); check(await until(async () => (await H()).fps === true), 'Frame rate switch turns on the Host overlay');
  const mark0 = (await H()).mark; await mgr.page.locator('[data-opt="mark"]').setChecked(!mark0); check(await until(async () => (await H()).mark === !mark0), 'Tracking marker switch works');
  const c0 = (await H()).corner; await mgr.page.click('button[data-opt="dbgmove"]'); check(await until(async () => (await H()).corner !== c0), 'Move overlay switches corners');
  await mgr.page.selectOption('select[data-opt="method"]', 'hue'); check(await until(async () => (await H()).method === 'hue'), 'Detection method can be changed');
  await mgr.page.selectOption('select[data-opt="zone"]', 'anywhere'); check(await until(async () => (await H()).zone === 'anywhere'), 'Shot start zone can be changed');
  await mgr.page.selectOption('select[data-opt="proc"]', '640'); check(await until(async () => (await H()).proc === 640), 'Detail level can be changed');
  await mgr.page.selectOption('select[data-opt="res"]', '1920'); check(await until(async () => (await H()).res === 1920), 'Camera resolution can be changed');
  await mgr.page.selectOption('select[data-opt="method"]', 'ref'); await until(async () => (await H()).method === 'ref');
  check(await until(async () => await mgr.page.locator('[data-opt="method"]').inputValue() === 'ref'), 'The switches show the Host’s current values');

  // ---- tuning ----
  check(await mgr.page.locator('#mgrSliders input').count() === 8, 'Eight tuning sliders are listed');
  const setRange = (id, v) => mgr.page.locator('#mgrSliders input[data-id="' + id + '"]').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await setRange('lpHue', 40); check(await until(async () => (await H()).hue === 40), 'Hue width slider changes the Host’s color match');
  await setRange('lpRestT', 0.9); check(await until(async () => Math.abs((await H()).still - 0.9) < 0.001), 'Still-for slider changes the shot rule');
  await setRange('lpCut', 0.5); check(await until(async () => Math.abs((await H()).cut - 0.5) < 0.001), 'Blue limit slider changes the detection limit');
  await setRange('lpGuard', 4); check(await until(async () => Math.abs((await H()).guard - 0.04) < 0.0005), 'Movement guard slider changes the guard');
  await sleep(2200);
  check(await until(async () => /40/.test(await txt(mgr.page, '#mgrSliders b[data-val="lpHue"]'))), 'The slider label shows the Host’s formatted value (' + (await txt(mgr.page, '#mgrSliders b[data-val="lpHue"]')) + ')');
  check(await mgr.page.locator('#mgrCamSliders').isHidden() || await mgr.page.locator('#mgrCamSliders input').count() === 0, 'No camera sliders for a simulated camera');

  // ---- picture and its switch ----
  await mgr.page.locator('#mgrPv2').scrollIntoViewIfNeeded();
  check(await until(async () => Number(await mgr.page.locator('#mgrPv2').getAttribute('data-seq')) >= 2, 15000), 'The Debug picture arrives');
  await mgr.page.uncheck('#mgrPvOn'); await sleep(5000);
  const w0 = fake.get('rooms/' + room + '/want/preview'); await sleep(6000);
  check(fake.get('rooms/' + room + '/want/preview') === w0, 'The picture switch stops asking for pictures');
  await mgr.page.check('#mgrPvOn');

  // ---- report ----
  await mgr.page.click('#mgrReportBtn');
  check(await until(async () => await mgr.page.locator('#mgrReportText').isVisible() && /live tracking report/.test(await mgr.page.locator('#mgrReportText').inputValue()), 10000), 'Copy report brings back the Host’s full report');
  const rep = await mgr.page.locator('#mgrReportText').inputValue();
  check(/Detection:/.test(rep) && /Movement guard:/.test(rep) && /Log:/.test(rep) && /Simulated camera on/.test(rep), 'The report has the detection, guard and log sections');
  check(await until(async () => (await txt(mgr.page, '#mgrReportMsg')).length > 0), 'The Manager says whether it could copy (' + (await txt(mgr.page, '#mgrReportMsg')).slice(0, 40) + '…)');
  check(!fake.get('rooms/' + room + '/ack'), 'Reports do not pile up in the relay');

  // ---- leaving the tab ----
  await mgr.page.click('.mgr-tab[data-tab="run"]'); await sleep(16000);
  check(!(fake.get('rooms/' + room + '/state') || {}).debug, 'The debug details leave the state after the tab is closed');

  await mgr.ctx.close(); await host.ctx.close(); await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
