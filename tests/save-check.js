// When the database refuses the shot replays or the statistics (rules from before they existed), the Host keeps playing but says so,
// the console shows it, and Test connection names the step that fails. Once the database accepts them again the warning goes away.
const { chromium } = require('playwright');
const { dist } = require('./lib');
const { startFake } = require('./fake-rtdb');
const fails = [], notes = [];
const check = (ok, what) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 100) => { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > ms) return false; await sleep(step); } };

(async () => {
  const fake = await startFake();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  async function phone(role, file, vp) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(url => { try { if (!localStorage.getItem('putt-lab-relay-url')) localStorage.setItem('putt-lab-relay-url', url); } catch (e) {} }, fake.url);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(role + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(role + ' console: ' + m.text()); });
    await page.goto(dist(file, role)); await page.waitForTimeout(400);
    return { ctx, page };
  }
  const host = await phone('host', 'test.html', { width: 1280, height: 720 });
  await host.page.locator('#btnPair').click();
  const code = await until(async () => { const t = (await host.page.locator('#pairCode').innerText()).replace('-', '').trim(); return t.length === 8 && t; });
  const room = fake.get('pair/' + code).room;
  const mgr = await phone('manage', 'index.html', { width: 1600, height: 1000 });
  await mgr.page.fill('#mgrCodeIn', code); await mgr.page.click('#mgrJoinBtn');
  check(await until(() => mgr.page.locator('#mgrRun').isVisible()), 'The Manager joins');
  await host.page.locator('#pairClose').click();
  const H = fn => host.page.evaluate(fn);
  await H(() => { const L = window.__lab; L.select(1); L.enterProj(); });
  const putt = () => H(() => { const L = window.__lab, a = L.game.autoPutt(); L.putt(a.angle, a.frac); for (let i = 0; i < 4000 && L.mode !== 'result' && L.mode !== 'over'; i++) L.tick(1 / 60); });
  const next = () => H(() => window.__lab.advance());

  // ---- a database with older rules ----
  fake.refuse = ['shots', 'stats'];
  await putt(); await sleep(2800);
  check(await until(() => H(() => !!window.__lab.saveProblem())), 'The Host notices that the database refused a shot');
  check(await until(async () => await mgr.page.locator('#mgrSaveStrip').isVisible()), 'The console says that replays and statistics are not being saved');
  check(/not being saved/.test(await mgr.page.locator('#mgrSaveStrip').innerText()), 'The warning says what is wrong');
  check(await H(() => window.__lab.LIVE.log.some(e => /did not accept the shot replays/.test(e.msg))), 'The Host log says it too');
  await mgr.page.screenshot({ path: require('./lib').out + '/save-warning.png' });
  await mgr.page.click('#mgrTest');
  check(await until(async () => (await mgr.page.locator('#mgrSteps li').allInnerTexts()).some(t => /Save a shot replay and statistics/.test(t)), 15000), 'Test connection has a step for shot replays and statistics');
  check(await until(async () => await mgr.page.locator('#mgrSteps .dot[data-s="bad"]').count() >= 1, 15000), 'It fails against the older rules');
  check((await mgr.page.locator('#mgrSteps').innerText()).includes('docs/console-plan.md'), 'and points to the rules to use');

  // ---- the database accepts them again ----
  fake.refuse = null; await next(); await putt(); await sleep(2800);
  check(await until(() => H(() => !window.__lab.saveProblem())), 'Once the database accepts a shot the problem is cleared');
  check(await until(async () => !(await mgr.page.locator('#mgrSaveStrip').isVisible())), 'and the warning goes away');
  const shots = fake.get('rooms/' + room + '/shots'); check(shots && Object.keys(shots).length >= 1, 'The shot is saved');
  await mgr.page.click('#mgrTest');
  check(await until(async () => (await mgr.page.locator('#mgrSteps li').count()) >= 9, 15000), 'Test connection now has nine steps');
  await sleep(1500);
  check(await mgr.page.locator('#mgrSteps .dot[data-s="bad"]').count() === 0, 'and every one passes');

  await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
