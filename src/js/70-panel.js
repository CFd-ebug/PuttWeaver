// ================= panel =================
function refreshPanel(){
  $('gTitle').textContent = game.name;
  $('gReads').textContent = READS[game.reads];
  $('gHow').textContent = game.how;
  $('gStatus').textContent = mode==='over' ? 'Hole complete' : game.status();
  renderHole();
  renderRatings();
  $('gCard').innerHTML = game.card();
  $('gNotes').innerHTML = game.notes();
  $('rigSummary').textContent = `${W} ft · ${S.rails?'rails':'open'} · stimp ${SPEEDS[S.speed]} · ${S.latency} ms`;
  document.querySelectorAll('.chip').forEach((c,i) => c.setAttribute('aria-pressed', String(i===gameIdx)));
}
function showResult(r){
  lastResult = r;
  const el=$('result'); el.hidden=false; el.dataset.tone=r.tone||'';
  $('rEyebrow').textContent='Last shot'; $('rTitle').textContent=r.title; $('rDetail').textContent=r.detail||''; $('btnNext').textContent='Continue';
  $('rRate').hidden = true;
}
function showSummary(){
  const el=$('result'), h = game.hole ? game.hole() : null, sm = game.summary();
  el.hidden=false; el.dataset.tone = h && h.list.length===1 ? (h.list[0].strokes < h.par ? 'good' : h.list[0].strokes > h.par ? 'bad' : '') : '';
  $('rEyebrow').textContent = h ? `Hole score · par ${h.par}` : 'Final';
  $('rTitle').textContent = h ? holeTitle(h) : sm.title;
  $('rDetail').textContent = sm.detail || '';
  $('btnNext').textContent='Play again';
  $('rRate').hidden = false; $('rRateStars').innerHTML = starsHtml(game);
}
function renderHole(){
  const box=$('gHole'), h = game.hole ? game.hole() : null;
  if (!h){ box.innerHTML = '<p class="hole-none">Calibration tool, so no hole score. Use it to size the close zones in the other games.</p>'; return; }
  const rows = h.list.map(e => {
    const s = e.strokes, max = Math.max(5, s || 0);
    const pips = Array.from({length:max}, (_,i) => { const n=i+1; return `<span class="pip${n===h.par?' par':''}${n===s ? (h.final?' on':' live') : ''}">${n}</span>`; }).join('');
    const label = s == null ? `Score not decided yet, par ${h.par}` : `${h.final ? 'Final score' : 'Score so far'} ${s}, par ${h.par}`;
    return `<div class="strip-row">${e.who ? `<span class="who">${esc(e.who)}</span>` : ''}<span class="strip" role="img" aria-label="${label}">${pips}</span></div>`;
  }).join('');
  const term = h.final && h.list.length===1 ? ` · ${golfTerm(h.list[0].strokes, h.par)}` : '';
  box.innerHTML = `<div class="hole-head"><span class="flabel">Hole score</span><span class="par-tag">Par ${h.par}${term}</span></div>${rows}<p class="hole-rule">${esc(game.rule())}</p>`;
}
function renderOpts(){
  const box=$('gOpts'), defs = game.opts || [];
  if (!defs.length){ box.hidden=true; box.innerHTML=''; return; }
  box.hidden=false;
  box.innerHTML = defs.map(o => {
    const v = optVal(game.id, defs, o.id), lid = `opt-${game.id}-${o.id}`;
    return `<div class="field"><span class="flabel" id="${lid}">${esc(o.label)}</span><div class="seg" role="radiogroup" aria-labelledby="${lid}">${o.choices.map(([cv,cl]) => `<label><input type="radio" name="${lid}" value="${cv}" id="${lid}-${cv}" data-opt="${o.id}"${cv===v?' checked':''}><span>${esc(cl)}</span></label>`).join('')}</div></div>`;
  }).join('');
  box.querySelectorAll('input').forEach(inp => inp.addEventListener('change', () => {
    if (!inp.checked) return;
    setOpt(game.id, inp.dataset.opt, inp.value);
    const id = inp.id; startGame(); const el = $(id); if (el) el.focus();
  }));
}
// star rankings, per browser
let RATE = {};
try { RATE = JSON.parse(localStorage.getItem('putt-lab-ratings') || '{}') || {}; } catch (e) { RATE = {}; }
function setRating(id, v){
  if (RATE[id] === v) delete RATE[id]; else RATE[id] = v;
  try { localStorage.setItem('putt-lab-ratings', JSON.stringify(RATE)); } catch (e) {}
  renderRatings();
}
function starsHtml(g){
  const r = RATE[g.id] || 0;
  return `<span class="stars" role="radiogroup" aria-label="Rate ${esc(g.name)}">${[1,2,3,4,5].map(v => `<button type="button" role="radio" aria-checked="${v===r}" aria-label="${plural(v,'star')}" class="${v<=r?'on':''}" data-g="${g.id}" data-v="${v}">★</button>`).join('')}</span>`;
}
function renderRatings(){
  $('rankList').innerHTML = GAMES.map(g => `<li class="${g===game?'cur':''}"><span class="rname">${esc(g.name)}</span>${starsHtml(g)}</li>`).join('');
  if (mode === 'over') $('rRateStars').innerHTML = starsHtml(game);
  if ($('exportDlg').open) renderExport();
}
document.addEventListener('click', e => {
  const b = e.target.closest('.stars button'); if (!b) return;
  const id = b.dataset.g, v = +b.dataset.v, inList = !!b.closest('#rankList');
  setRating(id, v);
  const again = document.querySelector(`${inList ? '#rankList' : '#rRateStars'} .stars button[data-g="${id}"][data-v="${v}"]`);
  if (again) again.focus();
});
function holeStats(g){
  const a = HLOG[g.id]; if (!a || !a.length) return null;
  return {n:a.length, avg:a.reduce((x,e)=>x+e.s,0)/a.length, par:a.reduce((x,e)=>x+e.p,0)/a.length};
}
function rankedGames(){
  const rated = GAMES.map((g,i) => ({g, i, r:RATE[g.id] || 0})).filter(x => x.r).sort((a,b) => b.r-a.r || a.i-b.i);
  rated.forEach(x => { x.rank = 1 + rated.filter(o => o.r > x.r).length; });
  return {rated, unrated: GAMES.filter(g => !RATE[g.id])};
}
function rankingText(){
  const {rated, unrated} = rankedGames(), name = $('raterName').value.trim();
  const lines = ['Projector Putt Lab: game rankings'];
  if (name) lines.push(`Rated by ${name}`);
  lines.push(new Date().toLocaleDateString('en-US', {year:'numeric', month:'long', day:'numeric'}), '');
  if (!rated.length) lines.push('No games rated yet.');
  for (const x of rated){
    const st = holeStats(x.g);
    lines.push(`${x.rank}. ${x.g.name}: ${'★'.repeat(x.r)}${'☆'.repeat(5-x.r)} (${x.r}/5)` + (st ? `, ${plural(st.n,'hole')} played, average ${st.avg.toFixed(1)} vs par ${+st.par.toFixed(1)}` : ''));
  }
  if (unrated.length) lines.push('', `Not rated: ${unrated.map(g => g.name).join(', ')}`);
  return lines.join('\n');
}
function renderExport(){
  const {rated, unrated} = rankedGames();
  const row = (x) => { const st = holeStats(x.g); return `<li><span class="rk">${x.rank}</span><span class="nm">${esc(x.g.name)}</span><span class="st" aria-label="${x.r} of 5 stars">${'★'.repeat(x.r)}<i>${'★'.repeat(5-x.r)}</i></span>${st ? `<span class="meta">${plural(st.n,'hole')} played · average ${st.avg.toFixed(1)} vs par ${+st.par.toFixed(1)}</span>` : ''}</li>`; };
  $('sumList').innerHTML = rated.map(row).join('') + unrated.map(g => `<li class="un"><span class="rk">–</span><span class="nm">${esc(g.name)}</span><span class="st"><i>not rated</i></span></li>`).join('');
  $('sumText').value = rankingText();
}
function renderLog(){
  const box=$('logBox');
  const rows = GAMES.filter(g => (HLOG[g.id]||[]).length).map(g => {
    const a = HLOG[g.id], n = a.length, avg = a.reduce((x,e)=>x+e.s,0)/n, par = a.reduce((x,e)=>x+e.p,0)/n, diff = avg-par;
    const bins = [0,0,0,0,0,0]; a.forEach(e => bins[Math.min(6, Math.max(1, e.s))-1]++); const mx = Math.max(...bins);
    const parBin = Math.round(par);
    const bars = bins.map((c,i) => `<i class="${i+1===parBin?'par':''}" style="--h:${mx ? Math.round(c/mx*100) : 0}%" title="${i===5?'6+':i+1} strokes: ${c}"></i>`).join('');
    const cls = diff > 0.25 ? 'over' : diff < -0.25 ? 'under' : '';
    return `<tr><td class="name">${esc(g.name)}<span class="sub">${plural(n,'hole')}</span></td><td class="num">${avg.toFixed(1)}</td><td class="num ${cls}">${diff>=0?'+':'−'}${Math.abs(diff).toFixed(1)}</td><td><span class="hist" aria-label="Strokes 1 to 6 or more: ${bins.join(', ')}">${bars}</span></td></tr>`;
  });
  box.innerHTML = rows.length
    ? `<table class="sc log"><thead><tr><th>Game</th><th class="num">Avg</th><th class="num">vs par</th><th><span class="hist hist-h"><b>1</b><b>2</b><b>3</b><b>4</b><b>5</b><b>6+</b></span></th></tr></thead><tbody>${rows.join('')}</tbody></table><p class="help">Blue bar is par. A game whose average sits well above par needs a bigger close zone or a higher par.</p>`
    : '<p class="empty">Finish a hole to log its score here. Each browser keeps its own log, so it collects everyone who playtests on this computer.</p>';
}
function setHint(){
  let h='';
  if (mode==='aim'){
    if (S.input==='tap' && game.tapOK) h='Tap the sheet where the ball should stop.';
    else h='Drag back from anywhere on the stage, then let go to putt.' + (S.input==='tap' ? ' This game reads the ball’s path, so tap mode is off here.' : '');
  } else if (mode==='roll') h='Rolling…';
  else if (mode==='read') h = shot && shot.rest ? 'The camera is waiting for the ball to settle…' : 'The camera lost the ball…';
  else if (mode==='result') h='Tap the stage or press Enter for the next shot.';
  else h='Hole complete. Tap the stage to play again.';
  $('hint').textContent=h;
}
function updateShotInfo(){
  const el=$('shotInfo');
  if (!shot || !shot.info){ el.textContent=''; return; }
  if (shot.info.tap){ el.textContent='Placed by tap'; return; }
  const i=shot.info; let rel=(i.angle+Math.PI/2)*180/Math.PI; rel=((rel+540)%360)-180;
  const err = S.skill==='perfect' ? 'no player error' : `player error ${Math.abs(i.errA).toFixed(1)}° ${i.errA>=0?'right':'left'}, ${Math.abs(i.errD*100).toFixed(0)}% ${i.errD>=0?'long':'short'}`;
  el.textContent = `aim ${Math.abs(rel).toFixed(1)}° ${rel>=0?'R':'L'} · power ${Math.round(i.frac*100)}% · ${err}`;
}

// chips
const nav=$('games');
GAMES.forEach((g,i) => {
  const b=document.createElement('button'); b.type='button'; b.className='chip'; b.setAttribute('aria-pressed','false');
  b.innerHTML=`${esc(g.name)}<small>${TAGS[g.reads]}</small>`;
  b.addEventListener('click', () => { gameIdx=i; startGame(); try { localStorage.setItem('putt-lab-game', g.id); } catch (e) {} });
  nav.appendChild(b);
});
try { const id=localStorage.getItem('putt-lab-game'); const i=GAMES.findIndex(g=>g.id===id); if (i>=0) gameIdx=i; } catch (e) {}

$('btnNext').addEventListener('click', () => { advance(); });
$('btnRestart').addEventListener('click', () => startGame());
const dlg = $('exportDlg');
try { $('raterName').value = localStorage.getItem('putt-lab-rater') || ''; } catch (e) {}
$('btnExport').addEventListener('click', () => {
  renderExport(); $('copyMsg').textContent = '';
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
});
$('dlgClose').addEventListener('click', () => { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); });
$('raterName').addEventListener('input', () => { $('sumText').value = rankingText(); try { localStorage.setItem('putt-lab-rater', $('raterName').value); } catch (e) {} });
function selectCopy(){ const ta = $('sumText'); ta.focus(); ta.select(); try { return document.execCommand('copy'); } catch (e) { return false; } }
$('btnCopy').addEventListener('click', () => {
  const text = rankingText(); $('sumText').value = text;
  const done = ok => { $('copyMsg').textContent = ok ? 'Copied to your clipboard.' : 'Copying is blocked here. The text is selected, so press Ctrl+C (or ⌘C).'; if (!ok) selectCopy(); };
  try { navigator.clipboard.writeText(text).then(() => done(true), () => done(selectCopy())); } catch (e) { done(selectCopy()); }
});
let clearArm = 0;
$('btnClearLog').addEventListener('click', () => {
  const btn = $('btnClearLog');
  if (Date.now() - clearArm < 4000){ HLOG = {}; try { localStorage.removeItem('putt-lab-log'); } catch (e) {} clearArm = 0; btn.textContent = 'Clear log'; renderLog(); return; }
  clearArm = Date.now(); btn.textContent = 'Tap again to clear';
  setTimeout(() => { if (Date.now() - clearArm >= 3900){ btn.textContent = 'Clear log'; } }, 4000);
});

// settings
function bindRadio(name, key, parse, after){
  const cur = key==='rails' ? (S.rails?'1':'0') : String(S[key]);
  document.querySelectorAll(`input[name="${name}"]`).forEach(inp => {
    inp.checked = inp.value === cur;
    inp.addEventListener('change', () => { if (!inp.checked) return; S[key]=parse(inp.value); saveSettings(); if (after) after(); refreshPanel(); setHint(); });
  });
}
bindRadio('rails','rails', v=>v==='1');
bindRadio('speed','speed', v=>v);
bindRadio('flat','flat', v=>v, buildSurface);
bindRadio('fps','fps', v=>+v);
bindRadio('lat','latency', v=>+v);
bindRadio('input','input', v=>v);
const selW=$('setWidth'); selW.value=String(S.width);
selW.addEventListener('change', () => { S.width=+selW.value; saveSettings(); setGeometry(); lastW=-1; resize(); startGame(); });
const selS=$('setSkill'); selS.value=S.skill;
selS.addEventListener('change', () => { S.skill=selS.value; saveSettings(); });
const cbP=$('setPath'); cbP.checked=S.showPath; cbP.addEventListener('change', () => { S.showPath=cbP.checked; saveSettings(); });
const cbW=$('setWashed'); cbW.checked=S.washed; cbW.addEventListener('change', () => { S.washed=cbW.checked; saveSettings(); });

// projector mode: the sheet alone, full screen, for checking brightness and size on the real projector
const stageSec = $('stageSec'); let idleTimer = 0;
function wake(){ stageSec.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => { if (proj) stageSec.classList.add('idle'); }, 2500); }
function enterProj(){
  proj = true; projTest = false; stageSec.classList.add('proj'); $('projUi').hidden = false; wake();
  const req = stageSec.requestFullscreen || stageSec.webkitRequestFullscreen;
  if (req){ try { const pr = req.call(stageSec); if (pr && pr.catch) pr.catch(() => {}); } catch (e) {} }
  resize(); cvs.focus({preventScroll:true});
}
function exitProj(){
  if (!proj) return;
  stopLivePlay('Tracking stopped: projector mode closed'); if (LIVE.fitting) toggleFit(false); LIVE.panel = false; $('livePanel').hidden = true;
  proj = false; projTest = false; stageSec.classList.remove('proj', 'idle'); $('projUi').hidden = true;
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  lastW = -1; resize();
}
$('btnProj').addEventListener('click', enterProj);
$('btnProjExit').addEventListener('click', exitProj);
function toggleTee(){
  projTee = !projTee; try { localStorage.setItem('putt-lab-tee', projTee ? '1' : '0'); } catch (e) {}
  $('btnTee').textContent = projTee ? 'Hide tee' : 'Show tee'; wake();
}
$('btnTee').textContent = projTee ? 'Hide tee' : 'Show tee';
$('btnTee').addEventListener('click', toggleTee);
function skipRound(){
  if (LIVE.on && LIVE.state === 'rolling'){ mode = 'aim'; shot = null; LIVE.state = 'collect'; LIVE.resultAt = state.clock - 2.5; llog('Shot cancelled'); setHint(); return; }
  if (mode === 'result' || mode === 'over'){ advance(); if (LIVE.on){ if (mode === 'aim') armReady(); else { LIVE.state = 'collect'; LIVE.resultAt = state.clock - 2.5; } } return; }
  if (LIVE.on && mode === 'aim'){ armReady(); llog('Retaking the empty-sheet photo'); }
}
let projBarKey = '';
function refreshProjBar(){
  if (!proj) return;
  const k = [LIVE.src ? 1 : 0, LIVE.on ? 1 : 0, LIVE.panel ? 1 : 0, LIVE.dbg ? 1 : 0, projTest ? 1 : 0, LIVE.fpsHud ? 1 : 0].join('');
  if (k === projBarKey) return; projBarKey = k;
  $('pbTrack').hidden = !LIVE.src; $('pbTrack').textContent = LIVE.on ? 'Pause tracking' : 'Start tracking'; $('btnTee').hidden = !!LIVE.src;
  $('pbSkip').hidden = !LIVE.on;
  $('pbPanel').textContent = LIVE.panel ? 'Hide panel' : 'Live panel';
  $('pbDbg').setAttribute('aria-pressed', String(!!LIVE.dbg)); $('pbFps').setAttribute('aria-pressed', String(!!LIVE.fpsHud));
  $('pbTest').setAttribute('aria-pressed', String(projTest));
}
$('pbGame').addEventListener('click', () => { gameIdx = (gameIdx + 1) % GAMES.length; startGame(); if (LIVE.on) armReady(); });
$('pbTest').addEventListener('click', () => { projTest = !projTest; });
$('pbPanel').addEventListener('click', () => showLivePanel(!LIVE.panel));
$('pbTrack').addEventListener('click', () => { if (LIVE.on){ stopLivePlay(); renderLiveStatus(); } else if (!startLivePlay()) showLivePanel(true); else showLivePanel(false); });
$('pbSkip').addEventListener('click', skipRound);
$('pbFps').addEventListener('click', () => toggleFpsHud());
$('pbDbg').addEventListener('click', () => { LIVE.dbg = !LIVE.dbg; buildPixMap(); const cb = $('lpDbg'); if (cb) cb.checked = LIVE.dbg; });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && proj) exitProj(); else resize(); });
stageSec.addEventListener('pointermove', () => { if (proj) wake(); });
document.addEventListener('keydown', e => {
  if (!proj) return;
  if (e.key === 'Escape'){ exitProj(); e.preventDefault(); return; }
  if (e.key === 't' || e.key === 'T'){ projTest = !projTest; wake(); e.preventDefault(); return; }
  if (e.key === 'v' || e.key === 'V'){ toggleTee(); e.preventDefault(); return; }
  if (e.key === 'g' || e.key === 'G'){ gameIdx = (gameIdx + (e.shiftKey ? GAMES.length-1 : 1)) % GAMES.length; startGame(); if (LIVE.on) armReady(); e.preventDefault(); return; }
  if (e.key === 'f' || e.key === 'F'){ toggleFpsHud(); e.preventDefault(); return; }
  if (e.key === 'l' || e.key === 'L'){ showLivePanel(!LIVE.panel); e.preventDefault(); return; }
  if (e.key === 'd' || e.key === 'D'){ LIVE.dbg = !LIVE.dbg; buildPixMap(); const cb = $('lpDbg'); if (cb) cb.checked = LIVE.dbg; e.preventDefault(); return; }
  if (e.key === 'n' || e.key === 'N' || ((e.key === 'c' || e.key === 'C') && LIVE.on && LIVE.state === 'rolling')){ skipRound(); e.preventDefault(); return; }
  if (e.key === 'm' || e.key === 'M'){ S.input = S.input === 'tap' ? 'putt' : 'tap'; saveSettings(); document.querySelectorAll('input[name="input"]').forEach(i => i.checked = i.value === S.input); setHint(); e.preventDefault(); }
  if (document.activeElement !== cvs) cvs.focus({preventScroll:true});
});

