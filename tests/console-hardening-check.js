// Phase 4 of the console: the event lock on the Manager, the Host's screen wake lock, the Host getting back to work after the phone
// restarts, and the Host tidying its room in the database. Needs dist/test.html and WebGL; the real-camera part uses Chromium's fake camera.
const { chromium } = require('playwright');
const { dist, unlockManager } = require('./lib');
const { startFake } = require('./fake-rtdb');
const fails = [], notes = [];
const check = (ok, what) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const fake = await startFake();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  async function phone(file, role, vp, init) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(url => { try { if (!localStorage.getItem('putt-lab-relay-url')) localStorage.setItem('putt-lab-relay-url', url); } catch (e) {} }, fake.url);
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(role + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(role + ' console: ' + m.text()); });
    await page.goto(dist(file, role)); await page.waitForTimeout(400);
    return { ctx, page };
  }
  const txt = (p, sel) => p.locator(sel).first().innerText();
  const until = async (fn, ms = 8000, step = 150) => { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > ms) return false; await sleep(step); } };

  // a stand-in wake lock that counts requests and can be taken away like the system does
  const wakeStub = () => {
    window.__wake = { n: 0, locks: [] };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      const l = new EventTarget(); l.released = false;
      l.release = async () => { l.released = true; l.dispatchEvent(new Event('release')); };
      window.__wake.n++; window.__wake.locks.push(l); return l; } } });
  };
  const host = await phone('test.html', 'host', { width: 1280, height: 720 }, wakeStub);
  const mgr = await phone('index.html', 'manage', { width: 430, height: 900 });
  await host.page.click('#btnPair');
  const code = await until(async () => { const t = (await txt(host.page, '#pairCode')).replace('-', '').trim(); return t.length === 8 && t; });
  check(await until(() => host.page.evaluate(() => localStorage.getItem('putt-lab-pair'))), 'The Host remembers an open pairing code so it can clean it up');
  await mgr.page.fill('#mgrCodeIn', code); await mgr.page.click('#mgrJoinBtn');
  check(await until(() => mgr.page.locator('#mgrRun').isVisible()), 'Manager paired with the test Host');
  await host.page.click('#pairClose');
  check(!await host.page.evaluate(() => localStorage.getItem('putt-lab-pair')), 'The saved pairing code is forgotten once the code is used or closed');
  const room = await host.page.evaluate(() => localStorage.getItem('putt-lab-room'));
  const R = p => 'rooms/' + room + '/' + p;
  const tabVisible = n => mgr.page.locator('.mgr-tab[data-tab="' + n + '"]').isVisible();

  // ---------- event lock ----------
  check(!await tabVisible('setup') && !await tabVisible('debug') && await tabVisible('run'), 'Setup and Debug are hidden until the lock is held');
  check(/Hold to unlock/.test(await txt(mgr.page, '#mgrLock')), 'The lock button says how to unlock');
  await mgr.page.locator('#mgrLock').click();
  check(!await tabVisible('setup'), 'A tap is not enough to unlock');
  const bb = await mgr.page.locator('#mgrLock').boundingBox();
  await mgr.page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await mgr.page.mouse.down(); await sleep(350); await mgr.page.mouse.up(); await sleep(900);
  check(!await tabVisible('setup'), 'A short press does not unlock either');
  await mgr.page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await mgr.page.mouse.down(); await sleep(400); await mgr.page.mouse.move(5, 5); await sleep(900); await mgr.page.mouse.up();
  check(!await tabVisible('setup'), 'Sliding off the button cancels the hold');
  await unlockManager(mgr.page);
  check(await until(() => tabVisible('setup')) && await tabVisible('debug'), 'Holding the lock shows Setup and Debug');
  check(/^Lock$/.test(await txt(mgr.page, '#mgrLock')), 'The button now offers to lock again');
  await mgr.page.reload(); await mgr.page.waitForTimeout(600);
  check(await until(() => tabVisible('setup')), 'The unlock survives a page reload in the same browser session');

  // ---------- wake lock ----------
  check(await until(() => host.page.evaluate(() => window.__wake.n >= 1)), 'The Host asks for a screen wake lock at start-up, before any camera');
  await mgr.page.click('.mgr-tab[data-tab="debug"]');
  check(await until(async () => /Screen kept awake\s*yes/.test((await txt(mgr.page, '#mgrKv')).replace(/\s+/g, ' ')), 10000), 'The Debug tab reports that the screen is kept awake');
  await host.page.evaluate(() => window.__wake.locks[0].release());
  check(await until(async () => /Screen kept awake\s*no · released by the system/.test((await txt(mgr.page, '#mgrKv')).replace(/\s+/g, ' ')), 10000), 'A lock taken away by the system shows as a warning');
  await host.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  check(await until(() => host.page.evaluate(() => window.__wake.n >= 2)), 'The Host asks again when the page returns to the front');
  check(await until(async () => /Screen kept awake\s*yes/.test((await txt(mgr.page, '#mgrKv')).replace(/\s+/g, ' ')), 10000), 'The console shows it is back on');

  // ---------- locking again ----------
  await mgr.page.locator('#mgrLock').click();
  check(await until(async () => !await tabVisible('debug') && !await tabVisible('setup')), 'Tapping the unlocked button locks again');
  check(await mgr.page.locator('#mgrTabRun').isVisible() && !await mgr.page.locator('#mgrTabDebug').isVisible(), 'Locking from the Debug tab returns to Run');
  await unlockManager(mgr.page);

  // ---------- the Host phone restarts ----------
  await mgr.page.click('.mgr-tab[data-tab="setup"]');
  await mgr.page.click('button[data-cmd="cam"]:not([data-args])');
  check(await until(() => host.page.evaluate(() => window.__lab.LIVE.src === 'camera'), 15000), 'The phone camera (Chromium’s fake camera) is switched on from the Manager');
  check(await until(() => host.page.evaluate(() => (JSON.parse(localStorage.getItem('putt-lab-resume') || '{}')).cam === true)), 'The Host remembers that its camera is on');
  await host.page.reload();
  check(await until(() => host.page.evaluate(() => window.__lab.LIVE.src === 'camera'), 15000), 'After the Host page restarts, the camera comes back on by itself');
  check(await until(() => (fake.get(R('state')) || {}).live && fake.get(R('state')).live.src === 'camera', 10000), 'The restarted Host reconnects to its room and says so');
  check(await until(async () => /Host online/.test(await txt(mgr.page, '#mgrHostTxt')), 10000), 'The Manager shows the Host online again');
  const log = await host.page.evaluate(() => window.__lab.LIVE.log.map(e => e.msg).join('\n'));
  check(/Phone restarted: switching the camera back on/.test(log), 'The Host log says why the camera came on');
  await mgr.page.click('button[data-cmd="camoff"]');
  check(await until(() => host.page.evaluate(() => window.__lab.LIVE.src === null)), 'Stopping the camera from the Manager works');
  check(await until(() => host.page.evaluate(() => (JSON.parse(localStorage.getItem('putt-lab-resume') || '{}')).cam === false)), 'A stopped camera is remembered as stopped');
  await host.page.reload(); await sleep(5000);
  check(await host.page.evaluate(() => !window.__lab.LIVE.src), 'A camera that was switched off stays off after a restart');
  // tracking is not resumed with a calibration from another camera
  await host.page.evaluate(() => { localStorage.setItem('putt-lab-resume', JSON.stringify({ cam: true, track: true })); });
  await host.page.reload();
  check(await until(() => host.page.evaluate(() => window.__lab.LIVE.src === 'camera'), 15000), 'Camera resumes when it was on…');
  check(await host.page.evaluate(() => !window.__lab.LIVE.on) && /Tracking not resumed: not calibrated/.test(await host.page.evaluate(() => window.__lab.LIVE.log.map(e => e.msg).join('\n'))), '…but tracking waits when there is no calibration');
  await mgr.page.click('button[data-cmd="camoff"]'); await sleep(500);

  // ---------- tidying the room ----------
  const now = Date.now();
  await host.page.evaluate(() => localStorage.setItem('putt-lab-pair', 'ABCDEFGH'));
  fake.put('pair/ABCDEFGH', { room, exp: 1 });
  fake.put(R('ack/old1'), { ok: true, ts: now - 600000 });
  fake.put(R('ack/fresh1'), { ok: true, ts: now });
  fake.put(R('hb/mgr/ghost'), now - 3600000);
  fake.put(R('want/preview'), now - 3600000);
  fake.put(R('want/debug'), now - 3600000);
  fake.put(R('preview'), 'data:image/jpeg;base64,AAAA');
  await host.page.reload();
  check(await until(() => !fake.get(R('ack/old1')) && !fake.get(R('hb/mgr/ghost')) && !fake.get(R('want/preview')) && !fake.get(R('want/debug')) && !fake.get(R('preview')), 10000), 'A restarted Host removes old answers, ghost controllers, old wants and a stale picture');
  check(!fake.get('pair/ABCDEFGH'), 'It also removes a pairing code it left behind');
  check(!!fake.get(R('ack/fresh1')), 'It keeps a recent answer');
  const mgrBeats = Object.keys(fake.get(R('hb/mgr')) || {});
  check(mgrBeats.length === 1, 'The connected Manager’s heartbeat stays (' + mgrBeats.length + ' entry)');

  // a picture does not linger once nobody is looking
  await mgr.page.click('.mgr-tab[data-tab="setup"]');
  await mgr.page.click('button[data-cmd="cam"][data-args]');
  check(await until(() => typeof fake.get(R('preview')) === 'string', 20000), 'A camera picture appears while Setup is open');
  await mgr.page.click('.mgr-tab[data-tab="run"]');
  check(await until(() => !fake.get(R('preview')), 25000, 500), 'The picture is deleted once the Manager stops asking for it');

  // unpairing removes the Manager’s own heartbeat
  const before = Object.keys(fake.get(R('hb/mgr')) || {}).length;
  await mgr.page.click('#mgrUnpair'); await mgr.page.click('#mgrUnpair');
  check(await until(() => Object.keys(fake.get(R('hb/mgr')) || {}).length === before - 1), 'Unpairing removes the Manager’s heartbeat');

  await mgr.ctx.close(); await host.ctx.close(); await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
