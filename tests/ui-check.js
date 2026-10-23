const { chromium } = require('playwright');
const { dist, out } = require('./lib');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, offline: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(dist('index.html'));
  await page.waitForTimeout(500);
  const names = ['Accuracy Test','Map Quest','Timeline','Periodic Table','Crowd Search','Tic-Tac-Toe','Star Sweep','Bowling','Shooting Gallery','Paint Wars'];
  const report = [];
  for (const name of names) {
    await page.getByRole('button', { name: new RegExp('^' + name) }).click();
    await page.waitForTimeout(100);
    let guard = 0, finished = false;
    while (guard++ < 24) {
      const box = await page.locator('#stage').boundingBox();
      const sx = box.x + box.width / 2 + (Math.random() - 0.5) * 60, sy = box.y + box.height * 0.88;
      await page.mouse.move(sx, sy); await page.mouse.down();
      await page.mouse.move(sx + (Math.random() - 0.5) * 50, sy + 90 + Math.random() * 80, { steps: 4 }); await page.mouse.up();
      try { await page.waitForFunction(() => !document.getElementById('result').hidden, null, { timeout: 20000 }); } catch (e) { console.log('STUCK in', name, 'putt', guard, 'hint:', await page.locator('#hint').textContent(), 'status:', await page.locator('#gStatus').textContent()); console.log(errors.join('\n')); await browser.close(); process.exit(1); }
      await page.locator('#btnNext').click();
      await page.waitForTimeout(60);
      const vis = await page.evaluate(() => !document.getElementById('result').hidden && document.getElementById('btnNext').textContent === 'Play again');
      if (vis) { finished = true; break; }
    }
    const info = await page.evaluate(() => ({
      eyebrow: document.getElementById('rEyebrow').textContent,
      title: document.getElementById('rTitle').textContent,
      pips: document.querySelectorAll('#gHole .pip').length,
      on: document.querySelectorAll('#gHole .pip.on').length,
      opts: document.querySelectorAll('#gOpts input').length
    }));
    report.push(`${name.padEnd(17)} finished:${finished} | ${info.eyebrow} | ${info.title} | pips ${info.pips} on ${info.on} | option inputs ${info.opts}`);
  }
  // switch an option and make sure the game restarts with it
  await page.getByRole('button', { name: /^Periodic Table/ }).click();
  await page.locator('label:has(#opt-periodic-zone-exact)').click();
  const par = await page.locator('#gHole .par-tag').textContent();
  const logRows = await page.locator('#logBox tbody tr').count();
  console.log(report.join('\n'));
  console.log('after switching to exact square:', par, '| log rows:', logRows);
  console.log('ERRORS', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
