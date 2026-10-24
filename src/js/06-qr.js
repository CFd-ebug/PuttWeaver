// ================= QR codes =================
// A small offline QR encoder for the pairing screen: byte mode, error correction level M, versions 1 to 10
// (up to 213 bytes of text). No libraries. tests/qr-unit.js checks the Reed-Solomon and format-bit math against
// published values, and tests/qr-decode.js decodes real output with OpenCV when it is installed.
//   qrMake(text)               -> { size, m, version, mask }   m[y][x] is true for a dark module
//   qrDraw(canvas, qr, px)     draws it black on white with the four-module quiet zone the scanners expect
const QR_M = [null,
  {ec: 10, blocks: [[1, 16]]}, {ec: 16, blocks: [[1, 28]]}, {ec: 26, blocks: [[1, 44]]}, {ec: 18, blocks: [[2, 32]]},
  {ec: 24, blocks: [[2, 43]]}, {ec: 16, blocks: [[4, 27]]}, {ec: 18, blocks: [[4, 31]]}, {ec: 22, blocks: [[2, 38], [2, 39]]},
  {ec: 22, blocks: [[3, 36], [2, 37]]}, {ec: 26, blocks: [[4, 43], [1, 44]]}
];
const QR_ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const QR_EXP = new Array(512), QR_LOG = new Array(256);
(function(){ let x = 1; for (let i = 0; i < 255; i++){ QR_EXP[i] = x; QR_LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (let i = 255; i < 512; i++) QR_EXP[i] = QR_EXP[i - 255]; })();
function qrMul(a, b){ return a && b ? QR_EXP[QR_LOG[a] + QR_LOG[b]] : 0; }
function qrGenerator(n){
  let g = [1];
  for (let i = 0; i < n; i++){ const ng = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++){ ng[j] ^= g[j]; ng[j + 1] ^= qrMul(g[j], QR_EXP[i]); } g = ng; }
  return g;
}
function qrReedSolomon(data, n){      // the n error-correction bytes for a block of data bytes
  const g = qrGenerator(n), r = new Array(n).fill(0);
  for (const d of data){ const f = d ^ r[0]; r.shift(); r.push(0); if (f) for (let i = 0; i < n; i++) r[i] ^= qrMul(g[i + 1], f); }
  return r;
}
function qrDataCodewords(ver){ return QR_M[ver].blocks.reduce((s, [n, d]) => s + n * d, 0); }
function qrPickVersion(len){
  for (let v = 1; v <= 10; v++) if (4 + (v < 10 ? 8 : 16) + 8 * len <= qrDataCodewords(v) * 8) return v;
  throw new Error('QR text is too long (' + len + ' bytes)');
}
function qrCodewords(bytes, ver){     // data, padding, error correction, interleaved
  const bits = [], push = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };
  push(4, 4); push(bytes.length, ver < 10 ? 8 : 16); for (const b of bytes) push(b, 8);
  const total = qrDataCodewords(ver) * 8;
  push(0, Math.min(4, total - bits.length)); while (bits.length % 8) bits.push(0);
  for (let pad = 0xEC; bits.length < total; pad = pad === 0xEC ? 0x11 : 0xEC) push(pad, 8);
  const cw = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  const info = QR_M[ver], blocks = []; let pos = 0;
  for (const [n, dc] of info.blocks) for (let i = 0; i < n; i++){ const d = cw.slice(pos, pos + dc); pos += dc; blocks.push({d, e: qrReedSolomon(d, info.ec)}); }
  const out = [], maxD = Math.max(...blocks.map(b => b.d.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < info.ec; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}
function qrFormatBits(mask){          // 15 format bits for level M and this mask, with the BCH check and the standard XOR
  const data = mask;                  // level M is 00, so the five data bits are just the mask
  let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function qrVersionBits(ver){
  let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >> 11) * 0x1F25);
  return (ver << 12) | rem;
}
function qrMaskHit(mask, x, y){
  switch (mask){
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return (x * y) % 2 + (x * y) % 3 === 0;
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
    default: return (((x + y) % 2) + (x * y) % 3) % 2 === 0;
  }
}
function qrPenalty(m){
  const n = m.length; let p = 0, dark = 0;
  for (let dir = 0; dir < 2; dir++) for (let a = 0; a < n; a++){        // runs of five or more in a row or column
    let run = 1;
    for (let b = 1; b < n; b++){
      const cur = dir ? m[b][a] : m[a][b], prev = dir ? m[b - 1][a] : m[a][b - 1];
      if (cur === prev){ run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
    }
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++){
    if (m[y][x]) dark++;
    if (x < n - 1 && y < n - 1 && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;   // 2x2 blocks
  }
  for (let dir = 0; dir < 2; dir++) for (let a = 0; a < n; a++){        // finder-like 1:1:3:1:1 shapes
    let s = ''; for (let b = 0; b < n; b++) s += (dir ? m[b][a] : m[a][b]) ? '1' : '0';
    for (const pat of ['10111010000', '00001011101']) for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) p += 40;
  }
  const k = Math.ceil(Math.abs(dark * 20 - n * n * 10) / (n * n)) - 1;   // balance of dark and light
  return p + Math.max(0, k) * 10;
}
function qrMake(text){
  const bytes = Array.from(new TextEncoder().encode(text)), ver = qrPickVersion(bytes.length), size = 17 + 4 * ver;
  const cw = qrCodewords(bytes, ver);
  const m = Array.from({length: size}, () => new Array(size).fill(false)), fn = Array.from({length: size}, () => new Array(size).fill(false));
  const set = (x, y, v) => { if (x >= 0 && y >= 0 && x < size && y < size){ m[y][x] = !!v; fn[y][x] = true; } };
  const finder = (cx, cy) => {
    for (let dy = -1; dy <= 7; dy++) for (let dx = -1; dx <= 7; dx++){
      const edge = dx === -1 || dx === 7 || dy === -1 || dy === 7;
      set(cx + dx, cy + dy, !edge && (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)));
    }
  };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
  for (let i = 8; i < size - 8; i++){ set(i, 6, i % 2 === 0); set(6, i, i % 2 === 0); }       // timing patterns
  const al = QR_ALIGN[ver];
  for (const cy of al) for (const cx of al){
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === al[al.length - 1]) || (cy === 6 && cx === al[al.length - 1])) continue;   // would overlap a finder
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = mask => {
    const bits = qrFormatBits(mask), bit = i => ((bits >> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);                                                                   // the always-dark module
  };
  format(0);                                                                                  // reserve the format areas
  if (ver >= 7){ const bits = qrVersionBits(ver); for (let i = 0; i < 18; i++){ const v = ((bits >> i) & 1) === 1, a = size - 11 + i % 3, b = Math.floor(i / 3); set(a, b, v); set(b, a, v); } }
  let i = 0;                                                                                  // data, zigzag from the bottom right
  for (let right = size - 1; right >= 1; right -= 2){
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++){
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
      if (!fn[y][x] && i < cw.length * 8){ m[y][x] = ((cw[i >> 3] >> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  let best = null;
  for (let mask = 0; mask < 8; mask++){
    const t = m.map(r => r.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && qrMaskHit(mask, x, y)) t[y][x] = !t[y][x];
    const saved = m; format(mask);                                                           // writes the format bits into m, copy them over
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (fn[y][x]) t[y][x] = saved[y][x];
    const score = qrPenalty(t);
    if (!best || score < best.score) best = {score, mask, m: t};
  }
  return {size, m: best.m, version: ver, mask: best.mask};
}
function qrDraw(canvas, qr, px){
  const quiet = 4, n = qr.size + quiet * 2; px = Math.max(1, Math.floor(px || 6));
  canvas.width = canvas.height = n * px;
  const c = canvas.getContext('2d'); c.fillStyle = '#ffffff'; c.fillRect(0, 0, canvas.width, canvas.height); c.fillStyle = '#000000';
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.m[y][x]) c.fillRect((x + quiet) * px, (y + quiet) * px, px, px);
}
