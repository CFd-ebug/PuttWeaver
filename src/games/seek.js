// ---------- Crowd Search ----------
function makeSeek(){
  const N = 4;
  const OPT = [
    {id:'zone', label:'Close counts within', choices:[['wide','6 in · par 3'], ['tight','3 in · par 4']]},
    {id:'level', label:'Search', choices:[['quick','Quick'], ['medium','Medium'], ['tricky','Tricky']]},
    {id:'hint', label:'Spotlight hint', choices:[['on','After 6 s'], ['off','Off']]},
    {id:'time', label:'Time to find', choices:[['none','No limit'], ['20','20 s'], ['10','10 s']]}
  ];
  // Quick: the person is the only one holding their item, so it pops out at a glance.
  // Tricky: a conjunction search where many look-alikes share two of the three clues.
  const LEVELS = {
    quick:  {count:55,  size:0.32, gap:0.42, held:0.3,  decoys:3,  heldTwins:0},
    medium: {count:90,  size:0.28, gap:0.3,  held:0.45, decoys:8,  heldTwins:2},
    tricky: {count:150, size:0.24, gap:0.2,  held:0.6,  decoys:-1, heldTwins:99}
  };
  const lv = () => LEVELS[opt('level')];
  const HINT_AT = 6;
  const opt = id => optVal('seek', OPT, id);
  const zoneIn = () => opt('zone') === 'tight' ? 3 : 6;
  const limit = () => opt('time') === 'none' ? 0 : +opt('time');
  // no yellow or green anywhere, so nothing in the scene can look like the ball
  const COL = {red:'#d33a2c', orange:'#ee8427', pink:'#e66aa4', purple:'#7b4bb7', blue:'#2f6fd6', navy:'#24336e', brown:'#8a5a3c', white:'#f7f7f5', black:'#2a2a2e', grey:'#8d909a'};
  const SHIRTS = ['red','orange','pink','purple','blue','navy','white','black','grey'];
  const HAT_COLORS = ['red','orange','pink','purple','blue','black','white','brown'];
  const HATS = ['cap','beanie','top hat','sun hat'];
  const HELD = ['balloon','umbrella','flag','backpack'];
  const HELD_COLORS = ['red','orange','pink','purple','blue'];
  const SKIN = ['#f1d0b5','#e2b48f','#c48a63','#9a6444','#6e452e'];
  const PANTS = ['#24336e','#2a2a2e','#6b4a33','#5c6170','#3f5f9a'];
  const NAMES = ['Rosa','Theo','Priya','Marcus','June','Omar','Lena','Diego','Ivy','Sam','Nora','Felix','Ada','Kofi','Mei','Hugo','Tess','Ravi'];
  const TREE = ['#d9692b','#c2452d','#e08a3c','#b8572a','#a8432f'];
  let rounds, num, rows, last, hits, t0, frozenLeft, searchT, cache = {key:'', c:null};
  const cur = () => rounds[num-1];
  const score = () => countdownScore(hits);
  const H = () => lv().size*K;
  const cardRect = () => ({x:0.015*W, y:D*0.66, w:W*0.34, h:D*0.32});
  const describe = f => [`${f.accC} ${f.acc}`, `${f.hatC} ${f.hat}`, `${f.shirt} shirt`];
  const share = (f, t) => (f.hat === t.hat && f.hatC === t.hatC ? 1 : 0) + (f.shirt === t.shirt ? 1 : 0) + (f.acc === t.acc && f.accC === t.accC ? 1 : 0);
  const sig = f => [f.hat, f.hatC, f.shirt, f.acc, f.accC].join('|');

  function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function build(seed){
    const R = rng(seed), pick = a => a[Math.floor(R()*a.length)], h = H(), card = cardRect();
    const pond = {x:(0.56+R()*0.28)*W, y:(0.2+R()*0.22)*D, rx:(0.09+R()*0.04)*W, ry:(0.11+R()*0.05)*D};
    const inPond = (x, y, m) => ((x-pond.x)/(pond.rx+m))**2 + ((y-pond.y)/(pond.ry+m))**2 < 1;
    const inCard = (x, y, m) => x > card.x-m && x < card.x+card.w+m && y > card.y-m && y < card.y+card.h+m;
    const paths = [0,1].map(i => ({y0:(0.25+0.45*i+R()*0.1)*D, y1:(0.2+0.5*R())*D, w:(0.07+R()*0.03)*D}));
    const trees = [];
    for (let g=0; g<400 && trees.length<(opt('level') === 'tricky' ? 8 : 5); g++){
      const t = {x:R()*W, y:R()*D*0.9, r:(0.22+R()*0.14)*K, c:pick(TREE)};
      if (!inPond(t.x,t.y,t.r) && !inCard(t.x,t.y,t.r) && trees.every(o => Math.hypot(o.x-t.x,o.y-t.y) > o.r+t.r+0.3*K)) trees.push(t);
    }
    const stalls = [];
    for (let g=0; g<200 && stalls.length<2; g++){
      const s = {x:(0.08+R()*0.8)*W, y:(0.08+R()*0.5)*D, w:0.55*K, h:0.32*K, c:pick(['#7b4bb7','#2f6fd6','#d33a2c'])};
      if (!inPond(s.x+s.w/2,s.y+s.h/2,0.4*K) && !inCard(s.x+s.w/2,s.y+s.h/2,0.5*K) && trees.every(t => Math.hypot(t.x-s.x-s.w/2,t.y-s.y-s.h/2) > t.r+0.5*K) && stalls.every(o => Math.abs(o.x-s.x) > 1.2*K)) stalls.push(s);
    }
    const target = {hat:pick(HATS), hatC:pick(HAT_COLORS), shirt:pick(SHIRTS), acc:pick(HELD), accC:pick(HELD_COLORS)};
    const L = lv(), want = L.count, minD = L.gap*K, figs = [];
    for (let g=0; g<9000 && figs.length<want; g++){
      const x = (0.03+R()*0.94)*W, y = (0.05+R()*0.9)*D;
      if (inPond(x,y,0.1*K) || inCard(x,y,0.2*K)) continue;
      if (trees.some(t => Math.hypot(t.x-x,t.y-y) < t.r*0.75) || stalls.some(s => x > s.x-0.1*K && x < s.x+s.w+0.1*K && y > s.y-0.15*K && y < s.y+s.h+0.2*K)) continue;
      if (figs.some(f => Math.hypot(f.x-x,(f.y-y)*1.3) < minD)) continue;
      const f = {x, y, dir: R() < 0.5 ? -1 : 1, skin:pick(SKIN), pants:pick(PANTS),
        hat: R() < 0.3 ? 'none' : pick(HATS), hatC:pick(HAT_COLORS), shirt:pick(SHIRTS), acc: R() < L.held ? pick(HELD) : 'none', accC:pick(HELD_COLORS), decoy:false};
      if (L.decoys < 0 && R() < 0.35){ // tricky: a third of the crowd copies two of the three clues
        const keep = Math.floor(R()*3);
        if (keep !== 0){ f.hat = target.hat; f.hatC = target.hatC; }
        if (keep !== 1){ f.shirt = target.shirt; }
        if (keep !== 2){ f.acc = target.acc; f.accC = target.accC; }
        f.decoy = true;
      }
      figs.push(f);
    }
    const ok = figs.filter(f => f.x > 0.3*K && f.x < W-0.3*K && f.y > h*1.6 && f.y < D-h*0.8);
    const who = ok[Math.floor(R()*ok.length)];
    Object.assign(who, target, {decoy:false});
    const others = figs.filter(f => f !== who);
    if (L.decoys > 0){ // a few look-alikes; Quick ones never carry the same item
      for (const f of shuffleR(others.filter(f => !f.decoy), R).slice(0, L.decoys)){
        f.decoy = true;
        const keep = L.heldTwins === 0 ? 2 : Math.floor(R()*3);
        if (keep !== 0){ f.hat = target.hat; f.hatC = target.hatC; }
        if (keep !== 1){ f.shirt = target.shirt; }
        if (keep !== 2){ f.acc = target.acc; f.accC = target.accC; }
      }
    }
    let twins = 0;
    for (const f of others){
      if (f.acc === target.acc && f.accC === target.accC && ++twins > L.heldTwins) f.accC = HELD_COLORS[(HELD_COLORS.indexOf(f.accC)+1+Math.floor(R()*4)) % HELD_COLORS.length];
      for (let g=0; g<20 && (share(f, target) === 3 || (!f.decoy && L.decoys >= 0 && share(f, target) >= 2)); g++) f.shirt = pick(SHIRTS.filter(c => c !== target.shirt));
      if (share(f, target) === 3) f.hatC = pick(HAT_COLORS.filter(c => c !== target.hatC));
    }
    const hr = 1.0*K, hint = {x: clamp(who.x + (R()-0.5)*1.0*K, hr*0.6, W-hr*0.6), y: clamp(who.y + (R()-0.5)*0.8*K, hr*0.6, D-hr*0.6), r: hr};
    figs.sort((a,b) => a.y-b.y);
    return {seed, pond, paths, trees, stalls, figs, who, hint, name:pick(NAMES)};
  }

  function shuffleR(a, R){ a = a.slice(); for (let i=a.length-1; i>0; i--){ const j = Math.floor(R()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; }
  function rr(g, x, y, w, h, r){ g.beginPath(); if (g.roundRect) g.roundRect(x,y,w,h,r); else g.rect(x,y,w,h); }
  function drawFig(g, f, h){
    const x = f.x, y = f.y, d = f.dir, ink = 'rgba(28,30,40,0.55)';
    g.fillStyle='rgba(30,30,40,0.16)'; g.beginPath(); g.ellipse(x, y+h*0.5, h*0.2, h*0.06, 0, 0, Math.PI*2); g.fill();
    g.lineCap='round'; g.strokeStyle=f.pants; g.lineWidth=h*0.11;
    g.beginPath(); g.moveTo(x-h*0.07, y+h*0.12); g.lineTo(x-h*0.09, y+h*0.46); g.moveTo(x+h*0.07, y+h*0.12); g.lineTo(x+h*0.09, y+h*0.46); g.stroke();
    if (f.acc === 'backpack'){ g.fillStyle=COL[f.accC]; rr(g, x-d*h*0.17-h*0.1, y-h*0.17, h*0.2, h*0.27, h*0.05); g.fill(); g.lineWidth=h*0.02; g.strokeStyle=ink; g.stroke(); }
    const raised = f.acc === 'balloon' || f.acc === 'umbrella' || f.acc === 'flag';
    const sx = x+d*h*0.12, sy = y-h*0.13, hx = raised ? x+d*h*0.25 : x+d*h*0.2, hy = raised ? y-h*0.3 : y+h*0.06;
    g.strokeStyle=COL[f.shirt]; g.lineWidth=h*0.08;
    g.beginPath(); g.moveTo(x-d*h*0.12, y-h*0.13); g.lineTo(x-d*h*0.19, y+h*0.06); g.moveTo(sx, sy); g.lineTo(hx, hy); g.stroke();
    g.fillStyle=COL[f.shirt]; rr(g, x-h*0.15, y-h*0.21, h*0.3, h*0.37, h*0.08); g.fill(); g.lineWidth=h*0.02; g.strokeStyle=ink; g.stroke();
    g.fillStyle=f.skin; g.beginPath(); g.arc(x, y-h*0.34, h*0.13, 0, Math.PI*2); g.fill();
    const hc = COL[f.hatC], top = y-h*0.34; g.fillStyle=hc; g.lineWidth=h*0.02; g.strokeStyle=ink;
    if (f.hat === 'none'){ g.fillStyle='#3b2a22'; g.beginPath(); g.arc(x, top, h*0.135, Math.PI*1.05, Math.PI*1.95); g.fill(); }
    else if (f.hat === 'cap'){ g.beginPath(); g.arc(x, top-h*0.02, h*0.135, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); rr(g, d > 0 ? x : x-h*0.24, top-h*0.04, h*0.24, h*0.05, h*0.02); g.fill(); }
    else if (f.hat === 'beanie'){ g.beginPath(); g.ellipse(x, top-h*0.04, h*0.14, h*0.15, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); rr(g, x-h*0.15, top-h*0.06, h*0.3, h*0.06, h*0.02); g.fill(); g.stroke(); }
    else if (f.hat === 'top hat'){ rr(g, x-h*0.1, top-h*0.36, h*0.2, h*0.3, h*0.02); g.fill(); g.stroke(); rr(g, x-h*0.18, top-h*0.09, h*0.36, h*0.05, h*0.02); g.fill(); g.stroke(); }
    else if (f.hat === 'sun hat'){ g.beginPath(); g.ellipse(x, top-h*0.06, h*0.27, h*0.06, 0, 0, Math.PI*2); g.fill(); g.stroke(); g.beginPath(); g.arc(x, top-h*0.07, h*0.11, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); }
    if (f.acc === 'balloon'){
      const bx = hx+d*h*0.06, by = hy-h*0.5; g.strokeStyle=ink; g.lineWidth=h*0.015; g.beginPath(); g.moveTo(hx,hy); g.lineTo(bx, by+h*0.14); g.stroke();
      g.fillStyle=COL[f.accC]; g.beginPath(); g.ellipse(bx, by, h*0.12, h*0.14, 0, 0, Math.PI*2); g.fill(); g.lineWidth=h*0.02; g.stroke();
    } else if (f.acc === 'umbrella'){
      g.strokeStyle='#3a3530'; g.lineWidth=h*0.025; g.beginPath(); g.moveTo(hx, hy+h*0.04); g.lineTo(hx, hy-h*0.36); g.stroke();
      g.fillStyle=COL[f.accC]; g.beginPath(); g.arc(hx, hy-h*0.34, h*0.27, Math.PI, 0); g.closePath(); g.fill(); g.lineWidth=h*0.02; g.strokeStyle=ink; g.stroke();
    } else if (f.acc === 'flag'){
      g.strokeStyle='#3a3530'; g.lineWidth=h*0.025; g.beginPath(); g.moveTo(hx, hy+h*0.05); g.lineTo(hx, hy-h*0.48); g.stroke();
      g.fillStyle=COL[f.accC]; g.beginPath(); g.moveTo(hx, hy-h*0.48); g.lineTo(hx+d*h*0.3, hy-h*0.39); g.lineTo(hx, hy-h*0.3); g.closePath(); g.fill(); g.lineWidth=h*0.02; g.strokeStyle=ink; g.stroke();
    }
  }
  function sceneImage(sc){
    const w = Math.max(1, Math.round(W*view.T)), hpx = Math.max(1, Math.round(D*view.T)), key = `${sc.seed}:${w}x${hpx}`;
    if (cache.key === key) return cache.c;
    const c = cache.c || document.createElement('canvas'); c.width = w; c.height = hpx;
    const g = c.getContext('2d'), u = w/W; g.setTransform(u,0,0,u,0,0);
    g.fillStyle='#efe9df'; g.fillRect(0,0,W,D);
    g.fillStyle='rgba(120,100,80,0.07)'; for (let i=0;i<260;i++){ const x=(i*97.31%1)*W, y=(i*61.77%1)*D; g.fillRect(x,y,0.03*K,0.03*K); }
    g.strokeStyle='#ddd0bd'; g.lineCap='round';
    for (const p of sc.paths){ g.lineWidth=p.w; g.beginPath(); g.moveTo(-0.2*W, p.y0); g.bezierCurveTo(W*0.3, p.y0, W*0.6, p.y1, W*1.2, p.y1); g.stroke(); }
    const pd = sc.pond; g.fillStyle='#b9cfe8'; g.beginPath(); g.ellipse(pd.x,pd.y,pd.rx,pd.ry,0,0,Math.PI*2); g.fill();
    g.strokeStyle='#8fb0d6'; g.lineWidth=0.03*K; g.stroke();
    g.strokeStyle='rgba(255,255,255,0.6)'; g.lineWidth=0.012*K; for (let i=0;i<4;i++){ g.beginPath(); g.ellipse(pd.x+(i-1.5)*pd.rx*0.35, pd.y+(i%2?0.2:-0.2)*pd.ry, pd.rx*0.15, pd.ry*0.05, 0, Math.PI, 0); g.stroke(); }
    for (const s of sc.stalls){
      g.fillStyle='#d9d4cc'; g.fillRect(s.x, s.y+s.h*0.35, s.w, s.h*0.65);
      g.fillStyle=s.c; for (let i=0;i<5;i++){ g.beginPath(); g.moveTo(s.x+i*s.w/5, s.y); g.lineTo(s.x+(i+1)*s.w/5, s.y); g.lineTo(s.x+(i+0.5)*s.w/5, s.y+s.h*0.4); g.closePath(); g.fill(); }
      g.strokeStyle='rgba(28,30,40,0.4)'; g.lineWidth=0.015*K; g.strokeRect(s.x, s.y+s.h*0.35, s.w, s.h*0.65);
    }
    const h = H(), all = [...sc.figs.map(f => ({y:f.y, f})), ...sc.trees.map(t => ({y:t.y+t.r*0.6, t}))].sort((a,b) => a.y-b.y);
    for (const it of all){
      if (it.f){ drawFig(g, it.f, h); continue; }
      const t = it.t;
      g.fillStyle='rgba(30,30,40,0.14)'; g.beginPath(); g.ellipse(t.x, t.y+t.r*0.85, t.r*0.8, t.r*0.22, 0, 0, Math.PI*2); g.fill();
      g.fillStyle='#6b4a33'; g.fillRect(t.x-t.r*0.12, t.y, t.r*0.24, t.r*0.85);
      g.fillStyle=t.c; for (const [dx,dy,rr2] of [[0,-0.25,0.75],[-0.45,0.05,0.55],[0.45,0.05,0.55],[0,0.15,0.6]]){ g.beginPath(); g.arc(t.x+dx*t.r, t.y+dy*t.r, rr2*t.r, 0, Math.PI*2); g.fill(); }
      g.strokeStyle='rgba(60,30,20,0.25)'; g.lineWidth=0.012*K; g.beginPath(); g.arc(t.x, t.y-0.25*t.r, 0.75*t.r, Math.PI*1.1, Math.PI*1.9); g.stroke();
    }
    cache = {key, c}; return c;
  }
  const left = () => Math.max(0, limit() - (state.clock - t0));
  return {
    id:'seek', name:'Crowd Search', reads:'rest', tapOK:true, opts:OPT,
    how:'A card on the sheet shows one person in the crowd and what they’re holding. Find them, then putt so the ball stops on them. Four people per hole.',
    rule:() => `Countdown: start at 5. Each ball that stops within ${zoneIn()} in of the person takes a stroke off.` + (limit() ? ` Running out of time counts as a miss.` : ''),
    hole:() => ({par: opt('zone') === 'tight' ? 4 : 3, list:[{who:'', strokes:score()}], final: rows.length >= N}),
    start(){
      const base = Math.floor(Math.random()*1e9);
      rounds = [0,1,2,3].map(i => build(base + i*7919)); num=1; rows=[]; last=null; hits=0; t0=state.clock; frozenLeft=null; searchT=null; cache={key:'', c:cache.c};
    },
    status(){ return `Person ${num} of ${N} · score ${score()}` + (limit() && !last ? ` · ${Math.ceil(frozenLeft ?? left())} s left` : ''); },
    /*SIM*/searchStats(){ const sc = cur(), t = sc.who; return {crowd: sc.figs.length, sameItem: sc.figs.filter(f => f !== t && f.acc === t.acc && f.accC === t.accC).length, twoClues: sc.figs.filter(f => f !== t && share(f, t) >= 2).length, sizeIn: +(H()*12).toFixed(1)}; },/*/SIM*/
    /*SIM*/autoPutt(){ const w = cur().who; return puttTo(w.x, w.y); },/*/SIM*/
    update(){
      if (!limit() || last || mode !== 'aim') return;
      if (left() <= 0){
        const sc = cur(); rows.push({name:sc.name, miss:null, hit:false, timeout:true}); last = {p:null, timeout:true};
        expireRound({title:'Time’s up', detail:`${sc.name} was the one with the ${describe(sc.who).join(', ')}. Score stays ${score()}.`, tone:'bad'});
      }
    },
    onShotStart(){ frozenLeft = limit() ? left() : null; searchT = state.clock - t0; },
    drawSheet(){
      const sc = cur(), h = H(), cr = cardRect();
      ctx.drawImage(sceneImage(sc), 0, 0, W, D);
      const looked = last ? null : (mode === 'aim' ? state.clock - t0 : searchT);
      if (opt('hint') === 'on' && looked != null && looked >= HINT_AT){
        const a = clamp((looked - HINT_AT)/0.6, 0, 1), hc = sc.hint;
        ctx.beginPath(); ctx.rect(0,0,W,D); ctx.arc(hc.x, hc.y, hc.r, 0, Math.PI*2, true);
        ctx.fillStyle = `rgba(16,20,36,${0.5*a})`; ctx.fill('evenodd');
        ctx.save(); ctx.globalAlpha = a; ctx.setLineDash([0.05*K,0.04*K]); ctx.lineWidth=0.018*K; ctx.strokeStyle='#ffffff'; circle(hc.x, hc.y, hc.r); ctx.stroke(); ctx.restore();
      }
      if (last){
        const w = sc.who, zr = zoneIn()/12;
        circle(w.x, w.y, zr); ctx.fillStyle='rgba(35,67,214,0.16)'; ctx.fill();
        ctx.save(); ctx.setLineDash([0.04*K,0.03*K]); ctx.lineWidth=0.014*K; ctx.strokeStyle='rgba(35,67,214,0.9)'; circle(w.x, w.y, zr); ctx.stroke(); ctx.restore();
        ctx.lineWidth=0.025*K; ctx.strokeStyle='#c9302a'; circle(w.x, w.y-h*0.05, h*0.62); ctx.stroke();
        txt(sc.name, w.x, w.y-h*0.62-0.13*K, 0.09*K, {color:'#8f1d18', halo:'rgba(255,255,255,0.92)'});
        if (last.p) dashed(last.p.x, last.p.y, w.x, w.y, '#c9302a', 0.016*K);
      }
      // the card: who to find
      rrect(cr.x, cr.y, cr.w, cr.h, 0.08*K); ctx.fillStyle='rgba(20,30,64,0.94)'; ctx.fill();
      const px = cr.x+cr.h*0.5, py = cr.y+cr.h*0.52, pr = cr.h*0.4;
      circle(px, py, pr); ctx.fillStyle='#efe9df'; ctx.fill();
      ctx.save(); ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI*2); ctx.clip();
      drawFig(ctx, Object.assign({}, sc.who, {x:px, y:py+pr*0.12}), pr*1.15); ctx.restore();
      const tx = cr.x+cr.h+0.06*K, tw2 = cr.w-cr.h-0.14*K;
      txt('FIND', tx, cr.y+0.15*K, 0.07*K, {font:'display', align:'left', color:'#9fb3ff', ls:.12});
      txt(`${num}/${N} · SCORE ${score()}`, cr.x+cr.w-0.12*K, cr.y+0.15*K, 0.065*K, {font:'mono', weight:500, align:'right', color:'#9fb3ff'});
      txt(sc.name, tx, cr.y+cr.h*0.4, Math.min(0.2*K, cr.h*0.22), {font:'display', align:'left', color:'#fff', maxW:tw2});
      describe(sc.who).forEach((line, i) => txt(i === 0 ? `Holding a ${line}` : line, tx, cr.y+cr.h*(0.6+i*0.13), 0.075*K, {weight: i === 0 ? 700 : 400, align:'left', color: i === 0 ? '#ffffff' : '#c8d2ee', maxW:tw2}));
      if (limit() && !last){
        const s = mode === 'aim' ? left() : (frozenLeft ?? left());
        pill(`${Math.ceil(s)} s`, cr.x+cr.w-0.3*K, cr.y+cr.h-0.17*K, 0.08*K, s <= 10 ? '#c9302a' : '#2343d6', '#fff', {font:'mono', weight:500});
      }
    },
    onRest(p, why){
      const sc = cur(), w = sc.who;
      if (!p){ rows.push({name:sc.name, miss:null, hit:false, t:searchT}); last={p:null}; return {title:'No reading', detail:`${WHY[why]} Score stays ${score()}.`, tone:'bad'}; }
      const missIn = Math.hypot(p.x-w.x, p.y-w.y)*12, hit = missIn <= zoneIn();
      if (hit) hits++;
      rows.push({name:sc.name, miss:missIn, hit, t:searchT}); last={p, hit};
      const tt = searchT != null ? ` Putt started after ${searchT.toFixed(1)} s.` : '';
      return hit
        ? {title:`Found ${sc.name}: −1 stroke`, detail:`${missIn.toFixed(1)} in from ${sc.name}. Score now ${score()}.${tt}`, tone:'good'}
        : {title:`${missIn.toFixed(0)} in away`, detail:`${sc.name} is circled in red. The ball needed to stop within ${zoneIn()} in. Score stays ${score()}.${tt}`, tone:'bad'};
    },
    advance(){ if (rows.length >= N) return 'over'; num++; last=null; t0=state.clock; frozenLeft=null; searchT=null; return 'next'; },
    summary(){
      const ts = rows.filter(r => r.t != null).map(r => r.t), avg = ts.length ? ts.reduce((a,b)=>a+b,0)/ts.length : null;
      return {detail:`Found ${hits} of ${N} people within ${zoneIn()} in.` + (avg != null ? ` Average search time ${avg.toFixed(1)} s.` : '') + (rows.some(r => r.timeout) ? ` ${plural(rows.filter(r => r.timeout).length,'round')} ran out of time.` : '')};
    },
    card(){
      if (!rows.length) return '<p class="empty">No putts yet. Four people per hole.</p>';
      const r = rows.map((x,i)=>`<tr><td>${i+1}</td><td class="name">${esc(x.name)}</td><td class="num${x.t!=null && x.t>10?' off':''}">${x.timeout ? 'out' : x.t!=null ? x.t.toFixed(1) : '—'}</td><td class="num${x.miss==null?' off':''}">${x.timeout ? '—' : x.miss==null ? 'no read' : x.miss.toFixed(1)}</td><td class="num">${x.hit?'−1':'·'}</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>#</th><th>Find</th><th class="num">Search s</th><th class="num">in off</th><th class="num">Stroke</th></tr></thead><tbody>${r}</tbody><tfoot><tr><td colspan="4">Score (started at 5)</td><td class="num">${score()}</td></tr></tfoot></table>`;
    },
    notes(){ return li([
      'Reads <b>where the ball stops</b>. Every round builds a new crowd and dresses a new person, so there is no art to make and no answer to memorize.',
      `<b>Search level is the main difficulty knob.</b> On Quick (${LEVELS.quick.count} people), the person is the only one holding their item, which makes them pop out at a glance; ${LEVELS.quick.decoys} look-alikes share the hat and shirt as a quick double-check. Medium has ${LEVELS.medium.count} people and a few with the same item. Tricky (${LEVELS.tricky.count} people, a third of them look-alikes) needs a slow person-by-person search and invites guessing.`,
      'The spotlight dims everything but a circle around the person after 6 s, so nobody has to putt blind. The scorecard records each search time (from the card appearing to the putt starting); times over 10 s show in red, so playtests show whether the 10-second goal holds.',
      `<b>Countdown scoring.</b> Searching is the knowledge part. In simulation at the default rig settings, an office-average putter who has already found the person stops within 6 in ${SIM.seek6}% of the time and within 3 in ${SIM.seek3}%.`,
      `People are ${(H()*12).toFixed(1)} in tall on a ${W} ft sheet, close to how they’ll look to a player standing at the tee. The time limit keeps a line moving at the event; the clock stops while the ball rolls.`,
      'Trees are autumn colors and nobody wears yellow or green, so nothing in the scene can be mistaken for the ball.'
    ]); }
  };
}

