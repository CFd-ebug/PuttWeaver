// What the players see: the three banners, the "Pick your game" screen between games, and how the controller answers it.
const { chromium } = require('playwright');
const { dist, out } = require('./lib');
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
  const mgr = await phone('manage', 'index.html', { width: 2560, height: 1600 });
  await mgr.page.fill('#mgrCodeIn', code); await mgr.page.click('#mgrJoinBtn');
  check(await until(() => mgr.page.locator('#mgrRun').isVisible()), 'The Manager joins');
  await host.page.locator('#pairClose').click();
  const H = fn => host.page.evaluate(fn);
  await H(() => { const L = window.__lab; L.select(1); L.enterProj(); L.LIVE.on = true; });          // tracking "on" without a camera: enough to draw what the players see
  await sleep(500);
  const setLive = (st, extra) => host.page.evaluate(([st, extra]) => { const L = window.__lab; L.LIVE.state = st; Object.assign(L.LIVE, extra || {}); }, [st, extra]);

  // ---- banners ----
  await setLive('arming');
  check(await H(() => window.__lab.flowStep()) === 1, 'While the round is set up the players see banner 1, Ball at start');
  await setLive('ready');
  await H(() => { const L = window.__lab; L.LIVE.readyAt = 1e9; });
  check(await H(() => window.__lab.flowStep()) === 2, 'A fresh Ready shows banner 2, Putt now');
  await H(() => { const L = window.__lab; L.LIVE.readyAt = -1e9; });
  check(await H(() => window.__lab.flowStep()) === 0, 'Banner 2 is gone once its time has passed');
  await mgr.page.waitForTimeout(100);
  fake.put('rooms/' + room + '/cmd/-Ncfg', { type: 'cfg', args: { banner: 9 }, ts: Date.now(), ttl: 8000 });
  check(await until(() => { const s = fake.get('rooms/' + room + '/state'); return s && s.banner === 9; }), 'The console can change how long Putt now stays up');
  check(await H(() => JSON.parse(localStorage.getItem('putt-lab-flow')).bannerSecs) === 9, 'The Host remembers it');
  fake.put('rooms/' + room + '/cmd/-Ncfg2', { type: 'cfg', args: { banner: 5 }, ts: Date.now(), ttl: 8000 });
  await H(() => { const L = window.__lab, a = L.game.autoPutt(); L.LIVE.on = false; L.putt(a.angle, a.frac); for (let i = 0; i < 4000 && L.mode !== 'result' && L.mode !== 'over'; i++) L.tick(1 / 60); L.LIVE.on = true; L.LIVE.state = 'collect'; L.LIVE.lastSeen = 1e9; });
  check(await H(() => window.__lab.flowStep()) === 3, 'With the ball still on the sheet after a result the players see banner 3, Reset ball');
  await H(() => { window.__lab.LIVE.lastSeen = -1e9; });
  check(await H(() => window.__lab.flowStep()) === 0, 'Once the ball is picked up there is no banner');
  await sleep(500); await host.page.screenshot({ path: out + '/flow-banner.png' });

  // ---- picking the next game ----
  await H(() => { const L = window.__lab; L.select(1); L.LIVE.on = true; L.flowSelectStart(); });
  check(await until(() => { const s = fake.get('rooms/' + room + '/state'); return s && s.phase === 'select' && s.pj === 'Pick your game'; }), 'The Host tells the console it is waiting for a pick');
  check(await until(() => mgr.page.locator('#mgrPick').isVisible()), 'The picker opens by itself on the console');
  check(await until(async () => /pick your game/i.test(await mgr.page.locator('#mgrPickPj').innerText())), 'The console says what is on the projector');
  check(await mgr.page.locator('.gk-hc canvas').count() === 3 && await mgr.page.locator('#mgrPerson').count() === 1, 'The overlay has the three how-to pictures and the person');
  const ink = sel => mgr.page.locator(sel).evaluate(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4 * 61) if (d[i] < 60 && d[i + 1] < 60 && d[i + 2] < 90) n++; return n; });
  check(await ink('#mgrPerson') > 20, 'The person is drawn');
  const frames = new Set(); for (let i = 0; i < 8; i++) { frames.add(await mgr.page.locator('#mgrPerson').evaluate(c => c.toDataURL())); await sleep(350); }
  check(frames.size >= 5, 'The person moves (' + frames.size + ' different frames)');
  await sleep(1500); await mgr.page.screenshot({ path: out + '/flow-picker.png' });
  await host.page.screenshot({ path: out + '/flow-projector-select.png' });
  const tile = mgr.page.locator('#mgrPickGrid .gk', { hasText: 'Bowling' });
  await tile.click();
  check(await until(() => H(() => window.__lab.FLOW.hover)) !== false && await until(async () => (await H(() => window.__lab.FLOW.hover)) === 7), 'Tapping a tile once outlines it on the projector');
  await tile.click();
  check(await until(async () => (await H(() => window.__lab.game.id)) === 'bowling'), 'The second tap starts that game');
  check(await until(async () => (await H(() => window.__lab.FLOW.phase)) === 'play'), 'The projector goes back to playing');
  check(await until(async () => !(await mgr.page.locator('#mgrPick').isVisible())), 'The picker closes');
  check(await H(() => window.__lab.FLOW.hover) === -1, 'The outline is cleared');

  // an armed tile that times out clears the outline on the projector too
  check(await until(() => { const s = fake.get('rooms/' + room + '/state'); return s && s.phase === 'play'; }), 'The console is told that play has resumed');
  await H(() => { const L = window.__lab; L.LIVE.on = true; L.flowSelectStart(); });
  check(await until(() => mgr.page.locator('#mgrPick').isVisible()), 'The picker opens again for the next game');
  await mgr.page.locator('#mgrPickGrid .gk', { hasText: 'Timeline' }).click();
  check(await until(async () => (await H(() => window.__lab.FLOW.hover)) === 2), 'Arming Timeline outlines it');
  await host.page.screenshot({ path: out + '/flow-projector-hover.png' });      // can outlast the arm window, so it is taken last
  check(await until(async () => (await H(() => window.__lab.FLOW.hover)) === -1, 6000), 'Letting it time out clears the outline');
  // the controller leaves; nobody can pick
  await H(() => { const L = window.__lab; L.LIVE.on = true; L.flowSelectStart(); });
  await mgr.ctx.close(); fake.put('rooms/' + room + '/hb/mgr', null);
  check(await until(() => H(() => window.__lab.FLOW.phase === 'select' && window.__lab.FLOW.lost >= 0)), 'Waiting for a pick');
  await sleep(1500);
  await H(() => { const L = window.__lab; L.flowTick(); for (let i = 0; i < 700; i++) L.tick(1 / 60); L.flowTick(); });
  check(await H(() => window.__lab.FLOW.phase) === 'play', 'With nobody left to pick, the same game starts again');

  await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
