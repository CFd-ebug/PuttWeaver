// Shared helpers for the browser tests.
const fs = require('fs'), path = require('path');
// the second argument is the role: 'host' (default, so the camera and projector tests keep working), 'play' or 'manage'; pass '' for no role in the address
const dist = (f, role = 'host') => 'file://' + path.join(__dirname, '..', '..', 'dist', f) + (role ? '#' + role : '');
const out = path.join(__dirname, '..', 'out');            // screenshots land here (git-ignored)
fs.mkdirSync(out, { recursive: true });
module.exports = { dist, out };
