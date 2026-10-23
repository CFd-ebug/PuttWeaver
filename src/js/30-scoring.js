// ======================================================================
// GAMES. Every game works in sheet feet: (0,0) is the far-left corner,
// x grows to the right, y grows toward the player. The real rig can feed
// the same onShotStart / onSample / onRest calls from the camera tracker.
// ======================================================================

// ================= hole scoring =================
// Every game except the Accuracy Test produces a mini golf score, so any game can be one hole on the course.
//   countdown: four tries; start at 5 and each close result takes a stroke off (never below 1)
//   finish:    strokes = putts taken to finish the goal; after 4 putts the player picks up and takes 5; penalties add on top
//   versus:    the result of the match sets the score
const MAX_PUTTS = 4;
const countdownScore = hits => Math.max(1, 5 - hits);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function golfTerm(s, par){
  if (s === 1) return 'Hole in one';
  const d = s - par;
  const names = {'-3':'Albatross', '-2':'Eagle', '-1':'Birdie', '0':'Par', '1':'Bogey', '2':'Double bogey', '3':'Triple bogey'};
  return names[d] || (d > 0 ? `${d} over par` : `${-d} under par`);
}
function puttTo(x, y, extra){
  const dx = x - TEE.x, dy = y - TEE.y;
  return {angle: Math.atan2(dy, dx), frac: (Math.hypot(dx, dy) + (extra || 0)) / maxRoll()};
}

// per-game options (close-zone size, bot level, layout), remembered per browser
let OPTS = {};
try { OPTS = JSON.parse(localStorage.getItem('putt-lab-opts') || '{}') || {}; } catch (e) { OPTS = {}; }
function optVal(gid, defs, id){
  const def = defs.find(o => o.id === id);
  const saved = OPTS[gid] && OPTS[gid][id];
  return def.choices.some(c => c[0] === saved) ? saved : def.choices[0][0];
}
function setOpt(gid, id, v){
  (OPTS[gid] = OPTS[gid] || {})[id] = v;
  try { localStorage.setItem('putt-lab-opts', JSON.stringify(OPTS)); } catch (e) {}
}

// results from simulated office-average putters at the default rig settings (see notes in each game)
// 300 simulated holes per setting: 8 ft sheet, stimp 11, slight wrinkles, rails, office-average putter who always knows the answer
const SIM = {map6:81, map3:49, tl5:87, tl2:58, pt1:48, pt3:95, tttW:47, tttD:43, tttL:10, tttAvg:'2.6', starsF:'2.8', starsB:'2.9', starsT:'3.8', starsS:'3.7', bowlPar:3, bowlAvg:'3.2', bowlStrike:2, galPar:3, galAvg:'2.9', seek6:80, seek3:41};


