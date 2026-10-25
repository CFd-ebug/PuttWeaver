// The Manager's Setup tab against a Host with the simulated camera (needs dist/test.html and WebGL): start the camera,
// receive the preview picture, calibrate, sample the ball, adjust the projection corners, measure the delay, start tracking,
// and check that the Host stops sending pictures once the Setup tab is closed.
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
  const room = (fake.get('pair') || {}) && await host.page.evaluate(() => localStorage.getItem('putt-lab-room'));
  const hostLive = () => host.page.evaluate(() => { const L = window.__lab.LIVE; return { src: L.src, cal: !!L.cal, check: L.cal && L.cal.checkAvg != null, sampled: !!L.sig.sampled, fitting: L.fitting, pin: L.pin, on: L.on, state: L.state, calib: !!L.calib, lat: L.latency, log: L.log.map(e => e.msg) }; });

  // ---- open Setup ----
  await unlockManager(mgr.page);
  await mgr.page.click('.mgr-tab[data-tab="setup"]');
  check(await mgr.page.locator('#mgrTabSetup').isVisible() && !await mgr.page.locator('#mgrTabRun').isVisible(), 'The Setup tab replaces the Run tab');
  check(await until(() => fake.get('rooms/' + room + '/want/preview')), 'Opening Setup tells the Host that pictures are wanted');
  check(await until(async () => /Off/.test(await txt(mgr.page, '[data-step="cam"] .st'))), 'The checklist shows the camera as off');
  check(await until(async () => await mgr.page.locator('#mgrSetupList').isVisible() && !!(fake.get('rooms/' + room + '/state') || {}).setup), 'The Host adds setup details to its state while Setup is open');

  // ---- camera and preview ----
  await mgr.page.click('[data-step="cam"] [data-args]');
  check(await until(async () => (await hostLive()).src === 'sim', 15000), 'Start camera from the console turns on the Host’s camera');
  check(await until(async () => /Simulated camera/.test(await txt(mgr.page, '[data-step="cam"] .st'))), 'The checklist shows the camera');
  check(await until(async () => Number(await mgr.page.locator('#mgrPv').getAttribute('data-seq')) >= 2, 15000), 'Camera pictures arrive on the Manager (' + Math.round(((fake.get('rooms/' + room + '/preview') || '').length) / 1000) + ' kB each)');
  const pv = fake.get('rooms/' + room + '/preview'); check(typeof pv === 'string' && pv.startsWith('data:image/jpeg') && pv.length < 120000, 'The picture is a JPEG small enough for the database rules');

  // ---- calibration ----
  await mgr.page.click('[data-cmd="calibrate"]');
  check(await until(async () => /Calibrating/.test(await txt(mgr.page, '#mgrBusy')), 10000), 'The Manager shows that calibration is running');
  check(await mgr.page.locator('[data-cmd="delay"]').isDisabled(), 'Other setup buttons are disabled while it runs');
  check(await until(async () => (await hostLive()).check, 120000, 500), 'Calibration finishes on the Host');
  check(await until(async () => /dots/.test(await txt(mgr.page, '[data-step="cal"] .st'))), 'The checklist shows the calibration result (' + (await txt(mgr.page, '[data-step="cal"] .st')) + ')');
  check(await until(async () => await mgr.page.locator('#mgrBusy').isHidden()), 'The busy banner clears');

  // ---- ball color: by the ring, then by tapping the picture ----
  await mgr.page.click('[data-cmd="sample"]');
  check(await until(async () => (await hostLive()).sampled && /sampled/.test(await txt(mgr.page, '[data-step="color"] .st')) && !/not sampled/.test(await txt(mgr.page, '[data-step="color"] .st')), 20000), 'Sample ball in the ring works from the console');
  const logsBefore = (await hostLive()).log.length;
  await mgr.page.locator('#mgrPv').scrollIntoViewIfNeeded();
  const box = await mgr.page.locator('#mgrPv').boundingBox();
  await mgr.page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  check(await until(async () => (await hostLive()).log.slice(logsBefore).some(m => /Ball sample/.test(m)), 10000), 'Tapping the picture asks the Host to sample there');

  // ---- projection corners ----
  await mgr.page.click('#mgrFitBtn');
  check(await until(async () => (await hostLive()).fitting && await mgr.page.locator('#mgrFitCard').isVisible(), 10000), 'Adjust corners turns on the Host’s test card and shows the corner handles');
  const pin0 = (await hostLive()).pin;
  await mgr.page.selectOption('#mgrFitSel', '0'); await mgr.page.check('#mgrFitCoarse');
  await mgr.page.click('[data-nudge="1,0"]');
  check(await until(async () => { const p = (await hostLive()).pin; return p && pin0 && p[0][0] > pin0[0][0] + 0.015; }), 'Nudging a corner moves it on the Host');
  await mgr.page.locator('#mgrFitCv').scrollIntoViewIfNeeded();
  const cv = await mgr.page.locator('#mgrFitCv').boundingBox(), pin1 = (await hostLive()).pin;
  const at = (px, py) => [cv.x + cv.width * (0.08 + px * 0.84), cv.y + cv.height * (0.08 + py * 0.84)];   // the picture is inset by 8%
  await mgr.page.mouse.move(...at(pin1[1][0], pin1[1][1])); await mgr.page.mouse.down();
  await mgr.page.mouse.move(...at(pin1[1][0] - 0.05, pin1[1][1] + 0.08), { steps: 6 }); await mgr.page.mouse.up();
  check(await until(async () => { const p = (await hostLive()).pin; return p && Math.abs(p[1][0] - (pin1[1][0] - 0.05)) < 0.02 && Math.abs(p[1][1] - (pin1[1][1] + 0.08)) < 0.02; }), 'Dragging a corner moves it on the Host (from ' + JSON.stringify(pin1[1]) + ' to ' + JSON.stringify(((await hostLive()).pin || [])[1]) + ', wanted -0.05, +0.08)');
  await mgr.page.click('[data-cmd="pinrot"]');
  check(await until(async () => { const p = (await hostLive()).pin; return p && p[0][0] > 0.5; }), 'Rotate 180° swaps the corners');
  await mgr.page.click('[data-cmd="pinreset"]');
  check(await until(async () => { const h = await hostLive(); return h.pin && Math.abs(h.pin[0][0] - pin0[0][0]) < 0.001; }), 'Reset corners goes back to square');
  await mgr.page.click('#mgrFitBtn');
  check(await until(async () => !(await hostLive()).fitting && await mgr.page.locator('#mgrFitCard').isHidden()), 'Done adjusting closes the test card');
  check(await until(async () => (await hostLive()).pin === null), 'Square corners are stored as no adjustment');

  // ---- delay, tracking ----
  await mgr.page.click('[data-cmd="delay"]');
  check(await until(async () => (await hostLive()).log.some(m => /^Delay \d+ ms/.test(m)), 60000, 500), 'Measure delay works from the console');
  // delay and corner changes invalidate nothing here, but calibration was cleared by the reset message only; start tracking
  await mgr.page.click('#mgrTrackBtn2');
  check(await until(async () => (await hostLive()).on, 15000), 'Start tracking from the Setup tab');
  check(await until(async () => /On/.test(await txt(mgr.page, '[data-step="track"] .st'))), 'The checklist shows tracking on');

  // ---- commands the Host cannot do ----
  await mgr.page.click('[data-cmd="camoff"]');
  check(await until(async () => (await hostLive()).src === null, 10000), 'Stop camera works');
  await mgr.page.click('[data-cmd="calibrate"]');
  check(await until(async () => /Start the camera first/.test(await txt(mgr.page, '#mgrCmdMsg2'))), 'Calibrate without a camera says why it cannot');

  // ---- leaving Setup stops the pictures ----
  await mgr.page.click('[data-cmd="cam"][data-args]'); await until(async () => (await hostLive()).src === 'sim', 15000);
  await mgr.page.click('.mgr-tab[data-tab="run"]');
  await sleep(15000);
  const n0 = fake.requests.filter(r => r.method === 'PUT' && /\/preview$/.test(r.path)).length; await sleep(3000);
  const n1 = fake.requests.filter(r => r.method === 'PUT' && /\/preview$/.test(r.path)).length;
  check(n1 === n0, 'The Host stops sending pictures after the Setup tab is closed (' + n0 + ' → ' + n1 + ')');
  check(!(fake.get('rooms/' + room + '/state') || {}).setup, 'The setup details leave the state again');

  await mgr.ctx.close(); await host.ctx.close(); await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
