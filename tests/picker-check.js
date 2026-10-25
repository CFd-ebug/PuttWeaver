// The Manager's game picker (overlay with tiles) and the Setup switch for which games are shown.
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
  async function phone(role, file, vp) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(url => { try { if (!localStorage.getItem('putt-lab-relay-url')) localStorage.setItem('putt-lab-relay-url', url); } catch (e) {} }, fake.url);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(role + ' pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_|Failed to load resource/.test(m.text())) errors.push(role + ' console: ' + m.text()); });
    await page.goto(dist(file, role)); await page.waitForTimeout(400);
    return { ctx, page };
  }
  const host = await phone('host', 'test.html', { width: 1280, height: 800 });
  await host.page.locator('#btnPair').click();
  const code = await until(async () => { const t = (await host.page.locator('#pairCode').innerText()).replace('-', '').trim(); return t.length === 8 && t; });
  const room = fake.get('pair/' + code).room;
  const mgr = await phone('manage', 'index.html', { width: 2560, height: 1600 });
  await mgr.page.fill('#mgrCodeIn', code); await mgr.page.click('#mgrJoinBtn');
  check(await until(() => mgr.page.locator('#mgrRun').isVisible()), 'The Manager joins');
  await host.page.locator('#pairClose').click();
  await host.page.evaluate(() => window.__lab.select(1));          // Map Quest
  const hostGame = () => host.page.evaluate(() => window.__lab.game.id);

  // ---- what the Host offers ----
  const st = await until(() => { const s = fake.get('rooms/' + room + '/state'); return s && s.gids && s; });
  const arr = v => Array.isArray(v) ? v.filter(x => x != null) : Object.values(v || {});
  check(arr(st.gids).length === 10, 'The Host lists all ten games');
  check(JSON.stringify(arr(st.shown)) === '[1,2,3,5,7,8]', 'By default six games are shown (not: accuracy test, crowd search, star sweep, paint wars)');

  // ---- the picker ----
  await mgr.page.locator('#mgrPickBtn').click();
  check(await until(() => mgr.page.locator('#mgrPick').isVisible()), 'Pick a game opens the overlay');
  const names = await mgr.page.locator('#mgrPickGrid .gk-l').allInnerTexts();
  check(JSON.stringify(names) === JSON.stringify(['Map Quest', 'Timeline', 'Periodic Table', 'Tic-Tac-Toe', 'Bowling', 'Shooting Gallery']), 'The overlay offers the six shown games (' + names.join(', ') + ')');
  const nums = await mgr.page.locator('#mgrPickGrid .gk-n').allInnerTexts();
  check(JSON.stringify(nums) === JSON.stringify(['02', '03', '04', '06', '08', '09']), 'Tiles keep their numbers in the full list');
  const imgs = await mgr.page.locator('#mgrPickGrid .gk-pv img').evaluateAll(a => a.map(i => i.complete && i.naturalWidth > 100));
  check(imgs.length === 6 && imgs.every(Boolean), 'Every tile shows a picture of the game');
  check(await mgr.page.locator('#mgrPickGrid .gk-pv svg').count() === 6, 'Every tile has its looping ball animation');
  check(await mgr.page.locator('#mgrPickGrid .gk[aria-pressed="true"] .gk-l').innerText() === 'Map Quest', 'The game in play is marked');
  const box = await mgr.page.locator('#mgrPickGrid').boundingBox(), card = await mgr.page.locator('.gk-card').boundingBox();
  check(card.y + card.height <= 1600 && box.width > 1500, 'The overlay fits a wide screen (' + Math.round(card.height) + ' px tall)');
  await sleep(1500); await mgr.page.screenshot({ path: out + '/picker.png' });

  const tl = mgr.page.locator('#mgrPickGrid .gk', { hasText: 'Timeline' });
  await tl.click(); await sleep(500);
  check(/pend/.test(await tl.getAttribute('class')) && await tl.locator('.gk-p').isVisible(), 'One tap arms a tile (dashed outline, TAP AGAIN)');
  check((await hostGame()) === 'map', 'One tap does not change the game');
  await tl.click();
  check(await until(async () => (await hostGame()) === 'timeline'), 'A second tap changes the game on the Host');
  check(await until(async () => !(await mgr.page.locator('#mgrPick').isVisible())), 'The overlay closes after choosing');

  await mgr.page.locator('#mgrPickBtn').click(); await sleep(300);
  await mgr.page.locator('#mgrPickGrid .gk', { hasText: 'Bowling' }).click(); await sleep(200);
  await mgr.page.screenshot({ path: out + '/picker-armed.png' });                                 // a picture of an armed tile (this can outlast the three seconds it stays armed)
  await mgr.page.keyboard.press('Escape');
  check(await until(async () => !(await mgr.page.locator('#mgrPick').isVisible())), 'Escape closes the overlay');
  await mgr.page.locator('#mgrPickBtn').click(); await sleep(300);
  await mgr.page.mouse.click(8, 800);
  check(await until(async () => !(await mgr.page.locator('#mgrPick').isVisible())), 'A tap on the dark area closes the overlay');
  await mgr.page.locator('#mgrPickBtn').click(); await sleep(300);
  const t2 = mgr.page.locator('#mgrPickGrid .gk', { hasText: 'Bowling' });
  await t2.click(); await sleep(3400);
  check(!/pend/.test(await t2.getAttribute('class')), 'An armed tile disarms after a few seconds');
  await mgr.page.keyboard.press('Escape');

  // ---- Next and Previous skip games that are not shown ----
  await host.page.evaluate(() => window.__lab.select(3));          // Periodic Table; crowd search (next in the full list) is not shown
  await sleep(700);
  const tap2 = async sel => { const h = await mgr.page.locator(sel).elementHandle(); await h.click(); await sleep(250); await h.click(); };
  await tap2('[data-cmd="next"]');
  check(await until(async () => (await hostGame()) === 'ttt'), 'Next game skips a game that is not shown');
  await tap2('[data-cmd="prev"]');
  check(await until(async () => (await hostGame()) === 'periodic'), 'Previous game comes back');

  // ---- Setup: Games shown ----
  await unlockManager(mgr.page);
  await mgr.page.locator('.mgr-tab[data-tab="setup"]').click();
  check(await until(async () => (await mgr.page.locator('#mgrShownList .gs-row').count()) === 10), 'Setup lists every game with an On/Off switch');
  check((await mgr.page.locator('#mgrShownN').innerText()) === '6 of 10 on', 'The count reads 6 of 10 on');
  const rowOn = async name => mgr.page.locator('#mgrShownList .gs-row', { hasText: name }).locator('.gs-k.on').count();
  check(await rowOn('Bowling') === 1 && await rowOn('Paint Wars') === 0, 'Bowling is on and Paint Wars is off');
  await mgr.page.screenshot({ path: out + '/games-shown.png', fullPage: true });
  await mgr.page.locator('#mgrShownList .gs-row', { hasText: 'Paint Wars' }).locator('.gs-k', { hasText: 'On' }).click();
  check(await until(async () => (await mgr.page.locator('#mgrShownN').innerText()) === '7 of 10 on'), 'Switching a game on updates the count at once');
  check(await until(() => host.page.evaluate(() => JSON.parse(localStorage.getItem('putt-lab-shown') || '[]').includes('paint'))), 'The Host saves the choice');
  check(await until(() => { const s = fake.get('rooms/' + room + '/state'); return s && arr(s.shown).includes(9); }), 'The Host publishes the new list');
  await mgr.page.locator('#mgrShownRec').click();
  check(await until(async () => (await mgr.page.locator('#mgrShownN').innerText()) === '6 of 10 on' && await rowOn('Paint Wars') === 0), 'Recommended restores the usual six');
  await mgr.page.locator('#mgrShownAll').click();
  check(await until(async () => (await mgr.page.locator('#mgrShownN').innerText()) === '10 of 10 on'), 'All on shows every game');
  for (const n of ['Accuracy Test', 'Map Quest', 'Timeline', 'Periodic Table', 'Crowd Search', 'Tic-Tac-Toe', 'Star Sweep', 'Bowling', 'Shooting Gallery']) await mgr.page.locator('#mgrShownList .gs-row', { hasText: n }).locator('.gs-k', { hasText: 'Off' }).click();
  await sleep(300);
  check((await mgr.page.locator('#mgrShownN').innerText()) === '1 of 10 on', 'Nine games switched off leave one');
  await mgr.page.locator('#mgrShownList .gs-row', { hasText: 'Paint Wars' }).locator('.gs-k', { hasText: 'Off' }).click();
  check((await mgr.page.locator('#mgrShownN').innerText()) === '1 of 10 on' && /at least one/i.test(await mgr.page.locator('#mgrShownMsg').innerText()), 'The last game cannot be switched off');
  await mgr.page.locator('#mgrShownRec').click(); await sleep(700);

  // ---- the page on a phone ----
  await mgr.page.setViewportSize({ width: 420, height: 860 });
  await mgr.page.locator('.mgr-tab[data-tab="run"]').click(); await sleep(300);
  await mgr.page.locator('#mgrPickBtn').click(); await sleep(500);
  check(await mgr.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'The picker fits a phone without sideways scrolling');
  await mgr.page.screenshot({ path: out + '/picker-phone.png' });
  await mgr.page.keyboard.press('Escape');

  // ---- the Evaluator still has every game ----
  const ev = await phone('play', 'test.html', { width: 1280, height: 800 });
  check(await ev.page.locator('.games .chip').count() === 10, 'The Evaluator page lists all ten games');

  await browser.close(); await fake.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log(notes.concat(fails).join('\n')); console.log('Error: ' + e.stack); process.exit(1); });
