// The three roles: what each one shows, how the role is chosen and remembered, and that the Manager never starts the engine.
const { chromium } = require('playwright');
const { dist } = require('./lib');
const fails = [], notes = [];
const check = (ok, what) => { (ok ? notes : fails).push((ok ? 'ok   ' : 'FAIL ') + what); };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  async function fresh(url, init) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED/.test(m.text())) errors.push('console: ' + m.text()); });
    await page.goto(url); await page.waitForTimeout(400);
    return { ctx, page };
  }
  const vis = (page, sel) => page.locator(sel).first().isVisible();
  // Host-only elements sit in a host-only wrapper; whether that wrapper is displayed does not depend on a collapsed <details>
  const hostOnlyShown = (page, sel) => page.evaluate(s => { const el = document.querySelector(s), w = el && el.closest('.host-only'); return !!w && getComputedStyle(w).display !== 'none'; }, sel);
  const roleOf = page => page.evaluate(() => [...document.body.classList].find(c => c.startsWith('role-')));

  // Evaluator
  {
    const { ctx, page } = await fresh(dist('index.html', 'play'));
    check(await roleOf(page) === 'role-play', 'Evaluator: #play gives the Evaluator role');
    check((await page.locator('#games button').count()) === 10, 'Evaluator: all 10 games are listed');
    for (const sel of ['#btnLive', '#btnProj', '#lblFps', '#lblLat', '#setPath', '#setWashed', '#livePanel', '#projUi', '#camVideo'])
      check(!(await hostOnlyShown(page, sel)), 'Evaluator: ' + sel + ' is hidden');
    check(await vis(page, '#stage') && await vis(page, '#btnRole'), 'Evaluator: stage and role switch are visible');
    check((await page.locator('#roleName').textContent()) === 'Evaluator', 'Evaluator: role label says Evaluator');
    check(!(await vis(page, '#mgr')), 'Evaluator: the Manager console is hidden');
    check(/(local build|PR #\d+|commit) .*built/.test(await page.locator('#buildTag').innerText()), 'Evaluator: the footer shows which version is running');
    // plays a hole by dragging
    const box = await page.locator('#stage').boundingBox();
    const sx = box.x + box.width / 2, sy = box.y + box.height * 0.88;
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 10, sy + 100, { steps: 4 }); await page.mouse.up();
    let played = true;
    try { await page.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 25000 }); } catch (e) { played = false; }
    check(played, 'Evaluator: a drag putt produces a result');
    // the rating row still works
    check(await page.evaluate(() => !!document.getElementById('rRate')), 'Evaluator: the rating row exists');
    // switching to Host through the dialog reloads into the Host role and remembers it
    await page.locator('#btnRole').click();
    check(await vis(page, '#roleDlg'), 'Evaluator: the role dialog opens');
    await page.locator('.role-opt[data-role="host"]').click();
    await page.waitForFunction(() => document.body.classList.contains('role-host'), null, { timeout: 8000 }).catch(() => {});
    check(await roleOf(page) === 'role-host', 'Switching to Host reloads as Host');
    check(await vis(page, '#btnLive') && await vis(page, '#btnProj'), 'Host (after switch): camera and projector buttons are visible');
    await ctx.close();
  }
  // Host
  {
    const { ctx, page } = await fresh(dist('index.html', 'host'));
    check(await roleOf(page) === 'role-host', 'Host: #host gives the Host role');
    for (const sel of ['#btnLive', '#btnProj', '#lblFps', '#lblLat', '#setPath', '#setWashed', '#camVideo'])   // the live panel and projector bar start hidden for every role
      check(await hostOnlyShown(page, sel), 'Host: ' + sel + ' is not hidden by the role');
    check((await page.locator('#roleName').textContent()) === 'Host', 'Host: role label says Host');
    // remembered: the plain address now opens as Host in the same browser profile
    await page.goto(dist('index.html', '')); await page.waitForTimeout(300);
    check(await roleOf(page) === 'role-host', 'Host: the role is remembered when the address has no role');
    await ctx.close();
  }
  // Manager: the console only, engine never starts
  {
    const { ctx, page } = await fresh(dist('test.html', 'manage'));
    check(await roleOf(page) === 'role-manage', 'Manager: #manage gives the Manager role');
    check(await vis(page, '#mgr') && await vis(page, '#mgrJoin') && !(await vis(page, '#mgrRun')), 'Manager: the console shows the join card when unpaired');
    check(!(await vis(page, '#stage')) && !(await vis(page, '#btnLive')), 'Manager: no stage and no camera controls');
    check((await page.locator('#games button').count()) === 0, 'Manager: the game list is never built');
    check(await page.evaluate(() => window.__lab === undefined), 'Manager: the game engine did not start');
    check(await page.evaluate(() => { try { return localStorage.getItem('putt-lab-role') === 'manage'; } catch (e) { return false; } }), 'Manager: the role is stored');
    // pairing links keep the role (the relay address points at a closed port, so nothing real is contacted)
    await page.evaluate(() => localStorage.setItem('putt-lab-relay-url', 'http://127.0.0.1:59999'));
    await page.goto(dist('test.html', 'manage=K7M2-9QXA')); await page.waitForTimeout(600);
    check(await roleOf(page) === 'role-manage', 'Manager: #manage=CODE keeps the Manager role');
    check(/Could not reach the relay/.test(await page.locator('#mgrJoinMsg').innerText()), 'Manager: an unreachable relay gives a plain message');
    check(!/K7M2/.test(page.url()), 'Manager: the code is taken out of the address');
    await ctx.close();
  }
  // defaults
  {
    const { ctx, page } = await fresh(dist('index.html', ''));
    check(await roleOf(page) === 'role-play', 'Default: no address role and no history opens as Evaluator');
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh(dist('index.html', ''), () => { try { localStorage.setItem('putt-lab-live', '{}'); } catch (e) {} });
    check(await roleOf(page) === 'role-host', 'Legacy: a device with saved camera settings stays a Host');
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh(dist('index.html', 'nonsense'));
    check(await roleOf(page) === 'role-play', 'Unknown role in the address falls back to Evaluator');
    await ctx.close();
  }

  await browser.close();
  console.log(notes.concat(fails).join('\n'));
  if (errors.length) { console.log('ERRORS\n' + errors.join('\n')); process.exit(1); }
  console.log('ERRORS none');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('Error: ' + e.stack); process.exit(1); });
