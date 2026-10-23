// Shared helpers for the browser tests.
const fs = require('fs'), path = require('path');
const dist = f => 'file://' + path.join(__dirname, '..', '..', 'dist', f);
const out = path.join(__dirname, '..', 'out');            // screenshots land here (git-ignored)
fs.mkdirSync(out, { recursive: true });
module.exports = { dist, out };
