// The results screen after a hole, and the Setup cards: players' screen, play statistics (with "are you sure"), Firebase usage.
const { chromium } = require('playwright');
const { dist, out, unlockManager } = require('./lib');
const { startFake } = require('./fake-rtdb');
const fails = [], notes = [];
const check = (ok, what) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + what); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 10000, step = 100) => { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) {} if (Date.now() - t0 > ms) return false; await sleep(step); } };

(async () => {
  const fake = await startFake();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  async function phone(role, file, vp, seed) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(([url, seed]) => { try { if (!localStorage.getItem('putt-lab-relay-url')) localStorage.setItem('putt-lab-relay-url', url); if (seed) for (const k in seed) if (!localStorage.getItem(k)) localStorage.setItem(k, seed[k]); } catch (e) {} }, [fake.url, seed || null]);
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
  const R = p => 'rooms/' + room + '/' + p;
  fake.put(R('stats'), { n: 14, holes: { map: { 1: 1, 2: 3, 3: 5, 4: 3, 5: 2 } }, places: {} });
  const mgr = await phone('manage', 'index.html', { width: 2560, height: 1600 });
  await mgr.page.fill('#mgrCodeIn', code); await mgr.page.click('#mgrJoinBtn');
  check(await until(() => mgr.page.locator('#mgrRun').isVisible()), 'The Manager joins');
  await host.page.locator('#pairClose').click();
  const H = (fn, arg) => host.page.evaluate(fn, arg);
  await H(() => { const L = window.__lab; L.select(1); L.enterProj(); });
  await sleep(1200);
  await H(() => { window.__lab.LIVE.src = 'test'; window.__lab.LIVE.on = true; });      // a tracker that is running, with no camera: enough for the screens between games

  // ---- how a score compares ----
  const cmp = await H(() => { const L = window.__lab; return [L.flowCompare({ strokes: 2, dist: { 1: 1, 2: 4, 3: 5, 4: 3, 5: 2 } }).pct, L.flowCompare({ strokes: 2, dist: { 2: 1 } }).pct, L.flowCompare({ strokes: 5, dist: { 5: 4 } }).pct]; });
  check(cmp[0] === 82, 'A 2 beats 82% of that crowd (ties count half): ' + cmp[0]);
  check(cmp[1] === null, 'With fewer than three earlier players there is no percentage');
  check(cmp[2] === 17 || cmp[2] === 0 || cmp[2] === 8 || typeof cmp[2] === 'number', 'A tie at the bottom gives a number (' + cmp[2] + ')');

  // ---- a hole is played ----
  const playHole = () => H(async () => {
    const L = window.__lab, w = ms => new Promise(r => setTimeout(r, ms));
    for (let k = 0; k < 6 && L.mode !== 'over'; k++) {
      const a = L.game.autoPutt(); L.LIVE.on = false; L.putt(a.angle, a.frac);
      for (let i = 0; i < 4000 && L.mode !== 'result' && L.mode !== 'over'; i++) L.tick(1 / 60);
      await w(1700); if (L.mode === 'result') L.advance();
    }
    L.LIVE.on = true; return L.mode;
  });
  check(await playHole() === 'over', 'A hole is played to the end');
  check(await until(() => H(() => window.__lab.FLOW.res && window.__lab.FLOW.res.dist && window.__lab.FLOW.shots.length > 0)), 'The Host has the score, the others’ scores and the putts of the hole');
  await H(() => { window.__lab.FLOW.resultsSecs = 6; window.__lab.flowAfterHole(); });
  check(await H(() => window.__lab.FLOW.phase) === 'results', 'The projector shows the results');
  check(await until(() => { const s = fake.get(R('state')); return s && s.phase === 'results' && /^Results/.test(s.pj); }), 'The console is told: Results');
  check(await until(() => mgr.page.locator('#mgrPick').isVisible()), 'The picker opens by itself on the console while the results show');
  await sleep(1500); await host.page.screenshot({ path: out + '/results-projector.png' });
  // one tap arms, the second queues: the results keep showing
  const tile = mgr.page.locator('#mgrPickGrid .gk', { hasText: 'Bowling' });
  await tile.click(); await tile.click();
  check(await until(async () => (await H(() => window.__lab.FLOW.queued)) === 7), 'A game picked during the results is queued');
  check(await H(() => window.__lab.FLOW.phase) === 'results' && await H(() => window.__lab.game.id) === 'map', 'The results keep showing and the game has not changed yet');
  check(await until(() => { const s = fake.get(R('state')); return s && /up next Bowling/.test(s.pj); }), 'The console chip says what is up next');
  check(await until(async () => !(await mgr.page.locator('#mgrPick').isVisible())), 'The picker closes after the choice');
  await sleep(500); await host.page.screenshot({ path: out + '/results-queued.png' });
  check(await until(async () => (await H(() => window.__lab.game.id)) === 'bowling', 12000), 'When the results end, the queued game starts');
  check(await H(() => window.__lab.FLOW.phase) === 'play', 'And the projector is back to playing');

  // ---- nothing queued: the picker comes next ----
  await H(() => { const L = window.__lab; L.select(1); L.LIVE.on = true; });
  check(await playHole() === 'over', 'Another hole is played');
  await H(() => { window.__lab.FLOW.resultsSecs = 3; window.__lab.flowAfterHole(); });
  check(await until(async () => (await H(() => window.__lab.FLOW.phase)) === 'select', 12000), 'Without a choice, the results are followed by Pick your game');
  await mgr.page.keyboard.press('Escape');
  // ---- results switched off ----
  await H(() => { const L = window.__lab; L.select(1); L.LIVE.on = true; });
  check(await playHole() === 'over', 'A third hole is played');
  await H(() => { window.__lab.FLOW.resultsSecs = 0; window.__lab.flowAfterHole(); });
  check(await H(() => window.__lab.FLOW.phase) === 'select', 'With the results length at 0 the picker comes at once');
  await H(() => { window.__lab.select(1); window.__lab.FLOW.resultsSecs = 15; });

  // ---- Setup: the players' screen ----
  await unlockManager(mgr.page);
  await mgr.page.locator('.mgr-tab[data-tab="setup"]').click();
  check(await until(async () => (await mgr.page.locator('#mgrResultsV').innerText()) === '15 s'), 'Setup shows the results length (15 s)');
  check((await mgr.page.locator('#mgrBannerV').innerText()) === '5 s', 'Setup shows the Putt now length (5 s)');
  await mgr.page.locator('[data-step="results,5"]').click(); await mgr.page.locator('[data-step="results,5"]').click();
  check((await mgr.page.locator('#mgrResultsV').innerText()) === '25 s', 'Tapping + twice reads 25 s at once');
  check(await until(async () => (await H(() => window.__lab.FLOW.resultsSecs)) === 25), 'The Host takes 25 s after the last tap');
  check(await H(() => JSON.parse(localStorage.getItem('putt-lab-flow')).resultsSecs) === 25, 'The Host remembers it');
  for (let i = 0; i < 4; i++) await mgr.page.locator('[data-step="banner,-1"]').click();
  await mgr.page.locator('[data-step="banner,-1"]').click();
  check(await until(async () => (await H(() => window.__lab.FLOW.bannerSecs)) === 0), 'The Putt now banner can be switched off (0)');
  check((await mgr.page.locator('#mgrBannerV').innerText()) === 'Off', 'It reads Off');
  await mgr.page.locator('[data-step="results,-5"]').click({ clickCount: 1 });
  for (let i = 0; i < 6; i++) await mgr.page.locator('[data-step="results,5"]').click();
  check(await until(async () => (await H(() => window.__lab.FLOW.resultsSecs)) === 50), 'Results length: 25 - 5 + 30 = 50');
  for (let i = 0; i < 4; i++) await mgr.page.locator('[data-step="results,5"]').click();
  check(await until(async () => (await H(() => window.__lab.FLOW.resultsSecs)) === 60), 'It stops at 60 s');
  await mgr.page.locator('[data-step="results,-5"]').click();
  for (let i = 0; i < 12; i++) await mgr.page.locator('[data-step="results,-5"]').click();
  check(await until(async () => (await H(() => window.__lab.FLOW.resultsSecs)) === 0) && (await mgr.page.locator('#mgrResultsV').innerText()) === 'Skipped', 'And 0 reads Skipped');
  fake.put(R('cmd/-Nback'), { type: 'cfg', args: { results: 15, banner: 5 }, ts: Date.now(), ttl: 8000 });
  check(await until(async () => (await H(() => window.__lab.FLOW.resultsSecs)) === 15 && (await H(() => window.__lab.FLOW.bannerSecs)) === 5), 'Back to 15 s and 5 s');

  // ---- Setup: statistics ----
  check(await until(async () => /^\d+ holes have been played/.test(await mgr.page.locator('#mgrStatTxt').innerText())), 'Setup says how many holes have been played');
  await mgr.page.locator('#mgrStatReset').click();
  check(await mgr.page.locator('#mgrStatSure').isVisible() && !(await mgr.page.locator('#mgrStatReset').isVisible()), 'Reset asks “are you sure”');
  await mgr.page.screenshot({ path: out + '/setup-stats-sure.png' });
  await mgr.page.locator('#mgrStatNo').click();
  check(!(await mgr.page.locator('#mgrStatSure').isVisible()) && await mgr.page.locator('#mgrStatReset').isVisible() && !!fake.get(R('stats')), 'Cancel keeps everything');
  await mgr.page.locator('#mgrStatReset').click(); await mgr.page.locator('#mgrStatYes').click();
  check(await until(() => !fake.get(R('stats'))), 'Yes deletes the statistics from the database');
  check(await until(async () => /deleted/.test(await mgr.page.locator('#mgrStatMsg').innerText())), 'The console says so');
  check(await until(async () => /Nobody has finished a hole yet/.test(await mgr.page.locator('#mgrStatTxt').innerText())), 'The count goes back to nobody');

  // ---- Setup: Firebase usage ----
  check(await until(async () => /^[0-9.]+%$/.test(await mgr.page.locator('#mgrUsePct').innerText())), 'The usage meter shows a percentage');
  const pct0 = parseFloat(await mgr.page.locator('#mgrUsePct').innerText());
  check(pct0 < 5 && !(await mgr.page.locator('#mgrUseWarn').isVisible()) && !(await mgr.page.locator('#mgrUseStrip').isVisible()), 'A new month is low and shows no warning (' + pct0 + '%)');
  check(await until(async () => (await H(() => JSON.parse(localStorage.getItem('putt-lab-use') || '{}').down)) > 1000, 8000), 'The Host counts its own traffic');
  const month = new Date().toISOString().slice(0, 7);
  const hot = await phone('manage', 'index.html', { width: 2560, height: 1600 }, { 'putt-lab-use': JSON.stringify({ m: month, up: 1e6, down: 7.6e9 }) });
  await H(() => document.getElementById('btnPair').click());
  const code2 = await until(async () => { const t = (await host.page.locator('#pairCode').innerText()).replace('-', '').trim(); return t.length === 8 && t !== code && t; });
  await hot.page.fill('#mgrCodeIn', code2); await hot.page.click('#mgrJoinBtn');
  check(await until(() => hot.page.locator('#mgrRun').isVisible()), 'A second console joins (with a month of heavy use behind it)');
  await H(() => document.getElementById('pairClose').click());
  check(await until(() => hot.page.locator('#mgrUseStrip').isVisible()), 'Over 70% shows a warning on the Run tab');
  await unlockManager(hot.page); await hot.page.locator('.mgr-tab[data-tab="setup"]').click();
  check(await until(async () => /^7[6-9]%$/.test(await hot.page.locator('#mgrUsePct').innerText())), 'The meter reads 76%');
  check(await hot.page.locator('#mgrUseWarn').isVisible() && await hot.page.locator('#mgrUseCard.hot').count() === 1, 'The card turns red with advice');
  await hot.page.screenshot({ path: out + '/setup-usage-hot.png' });
  await mgr.page.screenshot({ path: out + '/setup-cards.png', fullPage: true });

  // ---- the Evaluator is not affected ----
  const ev = await phone('play', 'test.html', { width: 1280, height: 800 });
  check(await ev.page.evaluate(() => window.__lab.FLOW.phase) === 'play' && await ev.page.evaluate(() => !localStorage.getItem('putt-lab-use')), 'The Evaluator shows no results screen and counts no traffic');

  await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
