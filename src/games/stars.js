// ---------- Star Sweep ----------
function makeStars(){
  // Each layout is built from groups: stars that one good putt can collect together
  const LAY = {
    fork:{name:'Fork', par:3, build:() => [ray([.28,.1],[.2,.55,.92]), ray([.72,.1],[.2,.55,.92])]},
    bank:{name:'Bank Shot', par:3, rails:true, holes:[[.5,.36,.42]], build:() => [bank(-1,.52,[.3,.62]), bank(1,.52,[.3,.62])]},
    trident:{name:'Trident', par:4, holes:[[.36,.22,.28],[.64,.22,.28]], build:() => [ray([.16,.14],[.35,.9]), ray([.5,.06],[.35,.92]), ray([.84,.14],[.35,.9])]},
    scatter:{name:'Scatter', par:4, random:true}
  };
  const OPT = [{id:'layout', label:'Layout', choices:Object.entries(LAY).map(([k,l]) => [k, `${l.name} · par ${l.par}`])}];
  const opt = id => optVal('stars', OPT, id);
  let lay, stars, holes, groups, putts, pen, done, log, shotGot, swallowed, trail;
  const SR = () => 0.12*K;
  const strokes = () => (done === 'pick' ? 5 : putts) + pen;
  function ray(far, ss){
    const fx = far[0]*W, fy = far[1]*D, dx = fx-TEE.x, dy = fy-TEE.y, t0 = (D-TEE.y)/dy;
    const st = ss.map(s => { const t = t0 + s*(1-t0); return {x:TEE.x+dx*t, y:TEE.y+dy*t}; });
    return {stars:st, kind:'ray'};
  }
  function bank(side, v, ss){
    // aim at a side rail; the rebound leg follows the rail physics (normal speed ×0.68, along-rail ×0.93)
    const R = {x: side < 0 ? BALL_R : W-BALL_R, y: v*D}, dx = R.x-TEE.x, dy = R.y-TEE.y, L = Math.hypot(dx,dy), ux = dx/L, uy = dy/L;
    let ox = -E_RAIL*ux, oy = F_RAIL*uy; const k = Math.hypot(ox, oy); ox /= k; oy /= k;
    const tTop = (R.y - 0.1*D)/-oy, tSide = side < 0 ? (W*0.9 - R.x)/ox : (W*0.1 - R.x)/ox, Lout = Math.min(tTop, tSide);
    const t0 = (D-TEE.y)/dy, inc = {x:TEE.x+dx*(t0+0.72*(1-t0)), y:TEE.y+dy*(t0+0.72*(1-t0))};
    const out = ss.map(s => ({x:R.x+ox*Lout*s, y:R.y+oy*Lout*s}));
    return {stars:[inc, ...out], kind:'bank', R, k, outFar: Lout*ss[ss.length-1]};
  }
  function scatterGroups(){
    for (let tries=0; tries<200; tries++){
      const angs = [rnd(-30,-12), rnd(-6,6), rnd(12,30)].map(a => a*Math.PI/180);
      const gs = angs.map(a => { const t = (TEE.y-0.1*D)/Math.cos(a); let x = TEE.x+Math.sin(a)*t, y = 0.1*D; if (x < 0.1*W || x > 0.9*W){ const tx = ((x < 0.1*W ? 0.1*W : 0.9*W) - TEE.x)/Math.sin(a); x = TEE.x+Math.sin(a)*tx; y = TEE.y-Math.cos(a)*tx; } return ray([x/W, y/D], [rnd(.2,.45), rnd(.7,.95)]); });
      const all = gs.flatMap(g => g.stars);
      if (all.some(s => s.y > D*0.92)) continue;
      const hs = [];
      for (let h=0; h<60 && hs.length<2; h++){
        const c = {x:rnd(.2,.8)*W, y:rnd(.15,.55)*D, r:.3*K};
        const clear = gs.every(g => { const s = g.stars[g.stars.length-1], r = segClosest(c.x,c.y,TEE.x,TEE.y,s.x,s.y); return r.d > c.r+0.35*K; });
        if (clear && hs.every(o => Math.hypot(o.x-c.x,o.y-c.y) > 1.2*K)) hs.push(c);
      }
      return {gs, hs};
    }
  }
  function setup(){
    lay = LAY[opt('layout')];
    if (lay.random){ const r = scatterGroups(); groups = r.gs; holes = r.hs; }
    else { groups = lay.build(); holes = (lay.holes||[]).map(([u,v,r]) => ({x:u*W, y:v*D, r:r*K})); }
    stars = groups.flatMap(g => g.stars);
    stars.forEach(s => { s.got=false; s.gotAt=-9; });
    putts=0; pen=0; done=null; log=[]; trail=[]; swallowed=null;
  }
  function starPath(cx,cy,R,r,rot){
    ctx.beginPath();
    for (let i=0;i<10;i++){ const a=rot-Math.PI/2+i*Math.PI/5, rr=i%2?r:R; const x=cx+Math.cos(a)*rr, y=cy+Math.sin(a)*rr; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.closePath();
  }
  return {
    id:'stars', name:'Star Sweep', reads:'path', tapOK:false, opts:OPT,
    how:'Roll through every star to clear the sheet. Black holes swallow the rest of a putt and cost a penalty stroke.',
    rule:() => 'Putts to finish: your score is the putts it takes to collect every star. Each black hole adds a penalty stroke. After 4 putts you pick up and take 5.',
    hole:() => ({par:lay.par, list:[{who:'', strokes:strokes()}], final:!!done}),
    start(){ setup(); },
    status(){ return done ? 'Hole complete' : `${lay.name} · putt ${putts+1} of ${MAX_PUTTS} · ${plural(stars.filter(s=>!s.got).length,'star')} left`; },
    /*SIM*/autoPutt(){
      const g = groups.find(g => g.stars.some(s => !s.got));
      if (g.kind === 'bank' && g.stars.filter(s => !s.got).length > 1){
        const d1 = Math.hypot(g.R.x-TEE.x, g.R.y-TEE.y);
        return {angle:Math.atan2(g.R.y-TEE.y, g.R.x-TEE.x), frac:(d1 + (g.outFar+0.35)/(g.k*g.k))/maxRoll()};
      }
      const far = g.stars.filter(s => !s.got).reduce((a,s) => Math.hypot(s.x-TEE.x,s.y-TEE.y) > Math.hypot(a.x-TEE.x,a.y-TEE.y) ? s : a);
      return puttTo(far.x, far.y, 0.45);
    },/*/SIM*/
    onShotStart(){ shotGot=0; swallowed=null; trail=[]; },
    onSample(s, prev){
      if (swallowed) return;
      const a = prev || s;
      let cut=1, cutPt=null;
      for (const h of holes){ const r=segClosest(h.x,h.y,a.x,a.y,s.x,s.y); if (r.d < h.r*0.7 && r.t <= cut){ cut=r.t; cutPt={x:r.x, y:r.y}; } }
      for (const st of stars){ if (st.got) continue; const r=segClosest(st.x,st.y,a.x,a.y,s.x,s.y); if (r.d < SR()+BALL_R && (!cutPt || r.t<=cut)){ st.got=true; st.gotAt=state.clock; shotGot++; } }
      if (cutPt){ swallowed=cutPt; trail.push(cutPt); } else trail.push(s);
    },
    drawSheet(){
      ctx.fillStyle='#eceefb'; ctx.fillRect(0,0,W,D);
      ctx.fillStyle='rgba(70,80,160,0.14)'; for (const d of DOTS){ circle(d[0]*W, d[1]*D, d[2]*K); ctx.fill(); }
      const t = state.clock;
      for (const h of holes){
        const gr=ctx.createRadialGradient(h.x,h.y,0,h.x,h.y,h.r);
        gr.addColorStop(0,'#24124a'); gr.addColorStop(0.55,'rgba(78,42,146,0.85)'); gr.addColorStop(1,'rgba(120,90,200,0)');
        circle(h.x,h.y,h.r); ctx.fillStyle=gr; ctx.fill();
        ctx.strokeStyle='rgba(160,130,240,0.6)'; ctx.lineWidth=0.012*K;
        for (let j=0;j<3;j++){ const a0=t*(0.8+j*0.35)+j*2; ctx.beginPath(); ctx.arc(h.x,h.y,h.r*(0.42+j*0.17),a0,a0+Math.PI*1.2); ctx.stroke(); }
      }
      if (trail.length>1){
        ctx.strokeStyle='rgba(43,88,255,0.42)'; ctx.lineWidth=0.07*K; ctx.lineCap='round'; ctx.lineJoin='round';
        ctx.beginPath(); ctx.moveTo(trail[0].x,trail[0].y); for (const s of trail) ctx.lineTo(s.x,s.y); ctx.stroke();
      }
      if (swallowed){ const r=0.09*K; ctx.strokeStyle='#c4207a'; ctx.lineWidth=0.03*K; seg(swallowed.x-r,swallowed.y-r,swallowed.x+r,swallowed.y+r); ctx.stroke(); seg(swallowed.x+r,swallowed.y-r,swallowed.x-r,swallowed.y+r); ctx.stroke(); }
      for (const s of stars){
        const age = t - s.gotAt;
        if (!s.got){
          starPath(s.x,s.y,SR(),SR()*0.45,Math.sin(t*1.6+s.x)*0.12);
          ctx.fillStyle='#ff5a2e'; ctx.fill(); ctx.lineWidth=0.012*K; ctx.strokeStyle='#a92e17'; ctx.stroke();
        } else {
          starPath(s.x,s.y,SR(),SR()*0.45,0); ctx.lineWidth=0.012*K; ctx.strokeStyle='rgba(110,118,176,0.55)'; ctx.stroke();
          if (age < 0.8){
            const p=age/0.8; ctx.strokeStyle=`rgba(255,90,46,${1-p})`; ctx.lineWidth=0.02*K;
            for (let i=0;i<8;i++){ const a=i*Math.PI/4, r0=SR()*(1+p*1.2), r1=SR()*(1.4+p*2); seg(s.x+Math.cos(a)*r0, s.y+Math.sin(a)*r0, s.x+Math.cos(a)*r1, s.y+Math.sin(a)*r1); ctx.stroke(); }
          }
        }
      }
      const got = stars.filter(s=>s.got).length;
      txt(lay.name.toUpperCase(), 0.2*K, D-0.42*K, 0.14*K, {font:'display', align:'left', color:'#2b2f73'});
      hud(`PAR ${lay.par} · STROKES ${strokes()}`, 0.2*K, D-0.18*K, 0.08*K, '#4a4f8a');
      hud(`${got}/${stars.length} STARS`, W-0.2*K, D-0.18*K, 0.08*K, '#4a4f8a', 'right');
      if (lay.rails && !S.rails) txt('Rails are off, so bank shots will leave the sheet', W/2, 0.2*K, 0.08*K, {color:'#a92e17', halo:'rgba(236,238,251,0.9)'});
    },
    onRest(p, why){
      putts++; if (swallowed) pen++;
      const left = stars.filter(s=>!s.got).length;
      log.push({got:shotGot, swallowed:!!swallowed});
      const note = why ? ' '+WHY[why] : '';
      const penTxt = pen ? ` plus ${plural(pen,'penalty stroke')}` : '';
      if (!left){ done='clear'; const s=strokes(); return {title: s===1 ? 'Hole in one' : `All stars in ${plural(putts,'putt')}`, detail:`Hole score ${s}${pen ? `, including ${plural(pen,'penalty stroke')}` : ''}.`+note, tone:'good'}; }
      if (putts >= MAX_PUTTS){ done='pick'; return {title:'Pick up', detail:`${plural(left,'star')} left after ${MAX_PUTTS} putts, so the hole scores 5${penTxt}.`+note, tone:'bad'}; }
      const title = swallowed ? 'Swallowed: +1 stroke' : shotGot ? `+${plural(shotGot,'star')}` : 'No stars';
      return {title, detail:`${plural(left,'star')} left, ${plural(strokes(),'stroke')} so far.`+(swallowed ? ' A black hole works like a water hazard: the rest of the roll is lost and a stroke is added.' : '')+note, tone: swallowed || !shotGot ? 'bad' : ''};
    },
    advance(){ if (done) return 'over'; trail=[]; swallowed=null; return 'next'; },
    summary(){ return {detail: done === 'clear' ? `${lay.name} cleared in ${plural(putts,'putt')}${pen ? ` with ${plural(pen,'penalty stroke')}` : ''}.` : `${lay.name} not cleared in ${MAX_PUTTS} putts.`}; },
    card(){
      if (!log.length) return `<p class="empty">No putts yet. ${lay.name} has ${stars.length} stars.</p>`;
      const r = log.map((x,i)=>`<tr><td>${i+1}</td><td class="num">${x.got}</td><td class="name${x.swallowed?' off':''}">${x.swallowed?'Black hole +1':''}</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>Putt</th><th class="num">Stars</th><th>Penalty</th></tr></thead><tbody>${r}</tbody><tfoot><tr><td colspan="2">Strokes</td><td class="num">${strokes()}</td></tr></tfoot></table>`;
    },
    notes(){ return li([
      'Reads <b>the ball’s whole path</b>. Stars and black holes are tested against the line between camera frames, so a fast ball can’t slip past a star between two frames.',
      `<b>Putts-to-finish scoring</b>, the classic golf way. Each layout is built from groups of stars that one good putt can collect. In simulation at the default rig settings, an office-average putter averages ${SIM.starsF} on Fork and ${SIM.starsB} on Bank Shot (par 3), and ${SIM.starsT} on Trident and ${SIM.starsS} on Scatter (par 4).`,
      'Black holes act like water hazards: +1 stroke, so the score can go past 5 when penalties add up.',
      'Bank Shot needs rails. With open edges the ball leaves the sheet and the camera loses it.'
    ]); }
  };
}

