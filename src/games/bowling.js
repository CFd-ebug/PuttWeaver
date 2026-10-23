// ---------- Bowling ----------
function makeBowling(){
  let pins, knocked, trail, putts, done, log;
  const SP = () => 0.42*K, PIN_R = () => 0.13*K, HIT = () => 0.13*K + BALL_R;
  const LB = () => 1.75*K, GUT = () => 0.2*K, headY = () => D*0.42;
  const strokes = () => done === 'pick' ? 5 : putts;
  function rack(){
    pins=[]; const sp=SP(), hy=headY();
    for (let r=0;r<4;r++) for (let i=0;i<=r;i++) pins.push({x:W/2+(i-r/2)*sp, y:hy-r*sp*0.866, down:false, gone:false, fall:null});
  }
  const standing = () => pins.filter(p=>!p.down && !p.gone).length;
  function knock(p, dx, dy, e, depth){
    if (p.down || p.gone) return;
    p.down=true; p.fall={dx,dy,t:state.clock}; knocked++;
    if (depth>=3 || e<0.3) return;
    for (const q of pins){
      if (q.down || q.gone) continue;
      const rx=q.x-p.x, ry=q.y-p.y, along=rx*dx+ry*dy, perp=Math.abs(rx*dy-ry*dx);
      if (along<=0 || along>SP()*1.9*e || perp>PIN_R()*1.6) continue;
      if (Math.random() < 0.5+0.45*e){ const l=Math.hypot(rx,ry); let nx=dx*0.5+rx/l, ny=dy*0.5+ry/l; const nl=Math.hypot(nx,ny); knock(q, nx/nl, ny/nl, e*0.72, depth+1); }
    }
  }
  function drawPin(x,y,r){ circle(x,y,r); ctx.fillStyle='#ffffff'; ctx.fill(); ctx.lineWidth=0.012*K; ctx.strokeStyle='#7d879c'; ctx.stroke(); circle(x,y,r*0.58); ctx.lineWidth=r*0.2; ctx.strokeStyle='#c9302a'; ctx.stroke(); circle(x,y,r*0.2); ctx.fillStyle='#d7dbe5'; ctx.fill(); }
  return {
    id:'bowling', name:'Bowling', reads:'path', tapOK:false,
    how:'Ten projected pins at the far end of a lane. Pins fall where the ball’s path crosses them and can take neighbors down. Knocked pins are cleared between putts.',
    rule:() => 'Putts to finish: your score is the putts it takes to knock down all ten pins, so a strike is a hole in one. After 4 putts you pick up and take 5.',
    hole:() => ({par:SIM.bowlPar, list:[{who:'', strokes:strokes()}], final:!!done}),
    start(){ rack(); putts=0; done=null; log=[]; knocked=0; trail=[]; },
    status(){ return done ? 'Hole complete' : `Putt ${putts+1} of ${MAX_PUTTS} · ${plural(standing(),'pin')} standing`; },
    /*SIM*/autoPutt(){ const st = pins.filter(p=>!p.down && !p.gone), f = st.reduce((a,p) => p.y > a.y ? p : a); return puttTo(f.x, f.y, 1.2*K); },/*/SIM*/
    onShotStart(){ knocked=0; trail=[]; },
    onSample(s, prev){
      trail.push(s); if (!prev) return;
      const dx=s.x-prev.x, dy=s.y-prev.y, L=Math.hypot(dx,dy); if (L<1e-6) return;
      const bx=dx/L, by=dy/L, speed=L/Math.max(1e-3, s.t-prev.t);
      for (const p of pins){
        if (p.down || p.gone) continue;
        const r = segClosest(p.x,p.y,prev.x,prev.y,s.x,s.y);
        if (r.d < HIT()){ const nx=p.x-r.x, ny=p.y-r.y, nl=Math.hypot(nx,ny)||1; const fx=bx*0.6+nx/nl, fy=by*0.6+ny/nl, fl=Math.hypot(fx,fy); knock(p, fx/fl, fy/fl, clamp(speed/2.5,0.5,1), 0); }
      }
    },
    drawSheet(){
      const t=state.clock, lb=LB(), g=GUT(), lx=W/2-lb/2, hy=headY();
      ctx.fillStyle='#e9ecf2'; ctx.fillRect(0,0,W,D);
      ctx.fillStyle='#b9c1d1'; ctx.fillRect(lx-g,0,lb+2*g,D);
      ctx.fillStyle='#ebdfcb'; ctx.fillRect(lx,0,lb,D);
      ctx.fillStyle='#f3ecdf'; ctx.fillRect(lx, hy-SP()*3*0.866-0.3*K, lb, SP()*3*0.866+0.6*K);
      ctx.strokeStyle='rgba(150,120,80,0.18)'; ctx.lineWidth=0.006*K;
      for (let b=1;b<39;b++){ const x=lx+b/39*lb; seg(x,0,x,D); ctx.stroke(); }
      const ay = hy + (D-hy)*0.55;
      ctx.fillStyle='#6d4c32';
      for (let b=5;b<=35;b+=5){ const x=lx+(b-0.5)/39*lb, s=0.06*K; ctx.beginPath(); ctx.moveTo(x,ay-s*1.6); ctx.lineTo(x+s*0.6,ay); ctx.lineTo(x-s*0.6,ay); ctx.closePath(); ctx.fill(); }
      for (const b of [3,5,8,11,14,26,29,32,35,37]){ circle(lx+(b-0.5)/39*lb, D-0.32*K, 0.018*K); ctx.fill(); }
      ctx.fillStyle='#2a2f3a'; ctx.fillRect(lx-g, D-0.05*K, lb+2*g, 0.025*K);
      if (trail.length>1){ ctx.strokeStyle='rgba(30,50,120,0.3)'; ctx.lineWidth=0.05*K; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(trail[0].x,trail[0].y); for (const s of trail) ctx.lineTo(s.x,s.y); ctx.stroke(); }
      for (const p of pins){
        if (p.gone) continue;
        if (!p.down){ drawPin(p.x,p.y,PIN_R()); continue; }
        const pr = clamp((t-p.fall.t)/0.35,0,1), e = 1-(1-pr)*(1-pr);
        const cx=p.x+p.fall.dx*0.2*K*e, cy=p.y+p.fall.dy*0.2*K*e, ang=Math.atan2(p.fall.dy,p.fall.dx);
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang); ctx.globalAlpha = t-p.fall.t > 1.2 ? 0.55 : 1;
        const len = PIN_R()*2*(1+e*0.5), wd = PIN_R()*2*(1-e*0.45);
        rrect(-len/2,-wd/2,len,wd,wd/2); ctx.fillStyle='#ffffff'; ctx.fill(); ctx.lineWidth=0.012*K; ctx.strokeStyle='#7d879c'; ctx.stroke();
        ctx.fillStyle='#c9302a'; ctx.fillRect(len*0.12,-wd/2,len*0.08,wd);
        ctx.restore(); ctx.globalAlpha=1;
      }
      const mx = (lx-g)/2, sx = W-mx;
      txt('PUTT', mx, D*0.16, 0.08*K, {font:'display', color:'#5a6276', ls:.1});
      txt(String(Math.min(putts+(done?0:1), MAX_PUTTS)), mx, D*0.16+0.3*K, 0.34*K, {font:'display', color:'#1d2333'});
      hud(`OF ${MAX_PUTTS} · PAR ${SIM.bowlPar}`, mx, D*0.16+0.62*K, 0.08*K, '#5a6276', 'center');
      txt('STROKES', mx, D*0.62, 0.08*K, {font:'display', color:'#5a6276', ls:.1});
      txt(String(strokes()), mx, D*0.62+0.3*K, 0.3*K, {font:'display', color:'#1d2333'});
      txt('PINS', sx, D*0.16, 0.08*K, {font:'display', color:'#5a6276', ls:.1});
      for (const p of pins){ const x=sx+(p.x-W/2)*0.75, y=D*0.16+0.32*K+(hy-p.y)*0.75; circle(x,y,0.07*K); if (!p.down && !p.gone){ ctx.fillStyle='#1d2333'; ctx.fill(); } else { ctx.lineWidth=0.012*K; ctx.strokeStyle='#9aa2b4'; ctx.stroke(); } }
    },
    onRest(p, why){
      putts++; const left = standing(); log.push({down:knocked, left});
      const note = why && !knocked ? ' '+WHY[why] : '';
      if (!left){ done='clear'; return {title: putts===1 ? 'Strike: hole in one' : putts===2 ? 'Spare: all ten in 2' : `All ten in ${putts}`, detail:`Hole score ${putts}.`, tone:'good'}; }
      if (putts >= MAX_PUTTS){ done='pick'; return {title:'Pick up', detail:`${plural(left,'pin')} still standing after ${MAX_PUTTS} putts, so the hole scores 5.`+note, tone:'bad'}; }
      return {title: knocked ? plural(knocked,'pin') : (p ? 'No pins' : 'Gutter ball'), detail:`${plural(left,'pin')} standing, ${plural(putts,'stroke')} so far.`+note, tone: knocked ? '' : 'bad'};
    },
    advance(){ if (done) return 'over'; pins.forEach(p => { if (p.down) p.gone = true; }); trail=[]; return 'next'; },
    summary(){ return {detail: done === 'clear' ? `All ten pins down in ${plural(putts,'putt')}.` : `${plural(standing(),'pin')} left standing after ${MAX_PUTTS} putts.`}; },
    card(){
      if (!log.length) return '<p class="empty">No putts yet. Ten pins to clear.</p>';
      const r = log.map((x,i)=>`<tr><td>${i+1}</td><td class="num">${x.down}</td><td class="num">${x.left}</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>Putt</th><th class="num">Knocked</th><th class="num">Standing</th></tr></thead><tbody>${r}</tbody><tfoot><tr><td colspan="2">Strokes</td><td class="num">${strokes()}</td></tr></tfoot></table>`;
    },
    notes(){ return li([
      `Reads <b>the ball’s path</b>. A pin falls when the path passes within ${(HIT()*12).toFixed(1)} in of its center, the same ratio a bowling ball has to real pins. Falling pins can take down neighbors.`,
      `<b>Putts-to-finish scoring</b> turns bowling into golf: a strike is an ace and a spare is a 2. In simulation at the default rig settings, an office-average putter averages ${SIM.bowlAvg} strokes and strikes ${SIM.bowlStrike}% of the time, which sets par at ${SIM.bowlPar}.`,
      'Pins drop when the camera reports the hit. With 250 ms of lag the ball is visibly past the rack before anything falls, which looks broken to players. Aim for under 100 ms.',
      'Pins reset by redrawing, so there is no pinsetter to build. Ball retrieval is the only reset time between putts.'
    ]); }
  };
}

