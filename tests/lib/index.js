// Shared helpers for the browser tests.
const fs = require('fs'), path = require('path');
// the second argument is the role: 'host' (default, so the camera and projector tests keep working), 'play' or 'manage'; pass '' for no role in the address
const dist = (f, role = 'host') => 'file://' + path.join(__dirname, '..', '..', 'dist', f) + (role ? '#' + role : '');
const out = path.join(__dirname, '..', 'out');            // screenshots land here (git-ignored)
fs.mkdirSync(out, { recursive: true });
// Holds the Manager's lock button down like a finger would, so Setup and Debug appear.
async function unlockManager(page){
  const b = page.locator('#mgrLock'); await b.scrollIntoViewIfNeeded();
  const r = await b.boundingBox(); await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up();
}
module.exports = { dist, out, unlockManager };
