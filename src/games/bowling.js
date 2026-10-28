// ---------- Bowling ----------
function makeBowling(){
  let pins, knocked, trail, putts, done, log, gutter, onLane, show;
  const SP = () => 0.42*K, PIN_R = () => 0.13*K, HIT = () => 0.13*K + BALL_R;
  const PIN_HIT = () => 0.55*SP(), REACH = () => 3.5*SP(), PIN_V = () => 4*K;   // pin-to-pin contact distance, how far a full-speed pin flies, how fast pins fly on screen
  const BALL_PUSH = 1.6, PIN_PUSH = 0.65, WOBBLE = 0.08;   // energy a head-on hit gives a pin (the ball is much heavier), share a pin passes on, least energy that topples a pin
  const SPEED_MIN = 0.4, SPEED_FULL = 3;                    // ball speeds (ft/s) that give no push and a full push
  const LB = () => 1.75*K, GUT = () => 0.2*K, headY = () => D*0.42;
  const strokes = () => done === 'pick' ? 5 : putts;
  function rack(){
    pins=[]; const sp=SP(), hy=headY();
    for (let r=0;r<4;r++) for (let i=0;i<=r;i++) pins.push({x:W/2+(i-r/2)*sp, y:hy-r*sp*0.866, down:false, gone:false, fall:null});
  }
  const standing = () => pins.filter(p=>!p.down && !p.gone).length;
  // A struck pin flies along (dx, dy) with energy v (1 = a firm head-on putt) and topples the first standing pin it meets, the
  // way two equal pins collide: the struck pin leaves along the line between their centers with the head-on share of the
  // energy and the striker carries on sideways with the rest, so a thin hit sends a pin off slowly. Pins bounce off the lane
  // edges (kickbacks). Too little energy and the pin only wobbles. No dice: the same path always leaves the same pins.
  // Each falling pin keeps its route (fall.path: points with the time it gets there) so the drawing shows it sliding into
  // the pins it knocks over; harder-pushed pins slide faster, and a pin is hit at the moment the slider reaches it.
  function topple(p, dx, dy, v, delay, depth){
    if (v < WOBBLE){ p.wob = state.clock+delay; return; }
    p.down=true; p.fall={dx,dy,v,t:state.clock+delay,path:[{x:p.x,y:p.y,t:state.clock+delay}]}; knocked++; fly(p, p.x, p.y, dx, dy, v, delay, depth);
  }
  function fly(p, x, y, dx, dy, v, delay, depth){
    if (v < 0.12 || depth > 12) return;
    const path=p.fall.path, spd=PIN_V()*clamp(v,0.4,1.2), mark=(at) => path.push({x:x+dx*at, y:y+dy*at, t:state.clock+delay+at/spd});
    const L=REACH()*v, pc=PIN_HIT(), lx=W/2-LB()/2; let hit=null, wall=false, at=L;
    for (const q of pins){
      if (q.down || q.gone) continue;
      const rx=q.x-x, ry=q.y-y, a=rx*dx+ry*dy, perp=Math.abs(rx*dy-ry*dx); if (a<=0 || perp>=pc) continue;
      const ac=a-Math.sqrt(pc*pc-perp*perp); if (ac>=0 && ac<at){ hit=q; at=ac; }
    }
    if (dx){ const a=((dx>0 ? lx+LB()-PIN_R() : lx+PIN_R())-x)/dx; if (a>0 && a<at){ hit=null; wall=true; at=a; } }
    if (!hit && !wall){ mark(dy<0 && y+dy*at<PIN_R() ? Math.max(0,(PIN_R()-y)/dy) : at); return; }   // slides to a stop, or into the pit behind the deck
    const cx=x+dx*at, cy=y+dy*at, vr=v*(1-0.4*at/L), dl=delay+at/spd; mark(at);
    if (wall) return fly(p, cx, cy, -dx, dy, vr*0.6, dl, depth+1);
    let nx=hit.x-cx, ny=hit.y-cy; const nl=Math.hypot(nx,ny); nx/=nl; ny/=nl;
    const c=nx*dx+ny*dy; topple(hit, nx, ny, vr*c*PIN_PUSH, dl, depth+1);
    const px=dx-c*nx, py=dy-c*ny, pl=Math.hypot(px,py);
    if (pl>1e-6) fly(p, cx, cy, px/pl, py/pl, vr*pl*PIN_PUSH, dl, depth+1);
  }
  // Ball speed now: the average over the last fifth of a second (steady against camera noise) is the speed at the middle of
  // that window, so take off the slowing for half of it.
  function speedAt(s){
    let i=trail.length-1; while (i>0 && s.t-trail[i].t < 0.2) i--; const q=trail[i], dt=s.t-q.t;
    return q===s || dt<=0 ? 0 : Math.max(0, Math.hypot(s.x-q.x, s.y-q.y)/dt - rollDecel()*dt/2);
  }
  // Pins left after a first ball that has taken the head pin, in two or more groups with a gap between: the bowling
  // "split", named by pin numbers (pins are numbered 1-10 as in bowling: index order is head pin, then each row left to right).
  function splitName(){
    const st = pins.map((p,i) => ({p, n:i+1})).filter(o => !o.p.down && !o.p.gone);
    if (st.length < 2 || st[0].n === 1) return null;
    const group = new Set([st[0]]), todo = [st[0]];
    while (todo.length){ const a = todo.pop(); for (const b of st) if (!group.has(b) && Math.hypot(a.p.x-b.p.x, a.p.y-b.p.y) < SP()*1.05){ group.add(b); todo.push(b); } }
    return group.size < st.length ? st.map(o => o.n).join('-') : null;
  }
  // Bowling-alley style shows after a putt. They move for under 2 s and then hold still until the next putt is set up,
  // so the camera sees a still sheet again before it photographs the empty sheet. Only navy, blue, magenta, red and white:
  // nothing near the ball's yellow, and nothing that turns a dark part of the picture bright.
  const NAVY = 'rgba(20,30,64,0.92)';
  const backOut = u => { u = clamp(u,0,1)-1; return 1 + 2.70158*u*u*u + 1.70158*u*u; };   // overshoots, then settles
  const ease = u => 1-Math.pow(1-clamp(u,0,1),3);
  // One ribbon look per result: band, tails, the fold between them, sparkle colors, and how it moves
  const THEMES = {
    strike:  {band:'#c2255c', tail:'#a61e4d', fold:'#5c0f2e', spark:['#ffffff','#f783ac']},   // magenta, sparkles
    spare:   {band:'#3b5bdb', tail:'#364fc7', fold:'#1c2a6e', spark:['#ffffff','#91a7ff']},   // blue, sparkles
    split:   {band:'#7048e8', tail:'#5f3dc4', fold:'#2f1a6b', tear:true},                     // purple, torn in two
    gutter:  {band:'#6b7387', tail:'#596074', fold:'#2a2f3a', droop:true},                    // gray, sagging
    wobbler: {band:'#c92a2a', tail:'#a51d1d', fold:'#5c1010', wobble:true},                   // red, wobbling
    clear:   {band:'#1c2a6e', tail:'#16215a', fold:'#0b1233', spark:['#ffffff','#bac8ff']},   // navy
    pick:    {band:'#495062', tail:'#3a404e', fold:'#1d2333', droop:true}                     // dark gray, sagging
  };
  // A ribbon banner: it unfurls from the middle, its notched tails fold out behind and the letters come in one by one. The
  // theme decides the rest: sparkles, a tear down the middle, a sag, a wobble. It moves for under 2 s, then holds still.
  function ribbon(str, sub, a, th){
    const sx = backOut(a/0.35); if (sx <= 0) return;
    const damp = Math.max(0, 1-a/1.8), o = {font:'display'};
    let size = 0.38*K; const tot0 = tw(str, size, o); if (tot0 > W*0.62) size *= W*0.62/tot0;
    const ws = [...str].map(c => tw(c, size, o)), tot = ws.reduce((m,w) => m+w, 0), BW = Math.max(3*K, tot + 0.9*K), BH = 0.56*K;
    // Never over the resting ball: lit by the ribbon it stops looking like the ball, and the camera would think it was picked up.
    const r = show.rest, rows = [headY() + (D-headY())*0.45, D-0.75*K, headY()-0.25*K];
    const cy = rows.find(y => !r || Math.abs(r.y-y-0.05*K) > 0.8*K || Math.abs(r.x-W/2) > BW/2+0.65*K) ?? rows[0];
    const cx = W/2 + (th.wobble ? Math.sin(a*14)*0.07*K*damp : 0);
    const arc = th.droop ? -(0.04 + 0.1*ease(a/1.2))*K : th.wobble ? (0.06 + 0.12*Math.cos(a*11)*damp)*K : (0.08 + 0.03*Math.sin(a*7)*damp)*K;
    const bow = u => -arc*Math.cos(Math.PI*u);   // u from -0.5 to 0.5; a positive arc lifts the middle
    const tl = ease((a-0.25)/0.2)*0.5*K, drop = 0.16*K, ex = BW/2*sx, g = th.tear ? ease((a-0.55)/0.3)*0.08*K : 0;
    for (const side of [-1, 1]) if (tl > 0){   // tail behind each end, then the fold that joins it to the band
      const sh = side*g, x0 = cx + sh + side*(ex-0.25*K), x1 = cx + sh + side*(ex+tl), y0 = cy - BH/2 + drop + bow(0.5), y1 = cy + BH/2 + drop + bow(0.5), n = 0.14*K*Math.min(1, tl/(0.5*K));
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1 - side*n, (y0+y1)/2); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath();
      ctx.fillStyle = th.tail; ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + sh + side*ex, cy + BH/2 + bow(0.5)); ctx.lineTo(cx + sh + side*(ex-0.25*K), y1); ctx.lineTo(cx + sh + side*(ex-0.25*K), cy + BH/2 + bow(0.5)); ctx.closePath();
      ctx.fillStyle = th.fold; ctx.fill();
    }
    // the band; a torn ribbon is drawn as two halves pulled apart along a zigzag
    // a torn ribbon tears between the two letters nearest its middle, so no letter is cut
    let tearX = cx, edge = cx - tot/2;
    for (let i=0;i<ws.length-1;i++){ edge += ws[i]; if (Math.abs(edge-cx) < Math.abs(tearX-cx) || i === 0) tearX = edge; }
    const N = 24, tu = th.tear ? (tearX-cx)/(2*ex) : 0;
    const zig = (sh, down) => { const m = 6; for (let k=0;k<=m;k++){ const f = down ? k/m : 1-k/m; ctx.lineTo(tearX + sh + (k%2 ? 0.05*K : -0.05*K)*(k>0 && k<m ? 1 : 0), cy - BH/2 + bow(tu) + BH*f); } };
    const half = (u0, u1, sh) => {
      ctx.beginPath(); for (let i=0;i<=N;i++){ const u = u0+(u1-u0)*i/N; ctx[i ? 'lineTo' : 'moveTo'](cx + u*2*ex + sh, cy - BH/2 + bow(u)); }
      if (th.tear && u1 === tu) zig(sh, true); else ctx.lineTo(cx + u1*2*ex + sh, cy + BH/2 + bow(u1));
      for (let i=N;i>=0;i--){ const u = u0+(u1-u0)*i/N; ctx.lineTo(cx + u*2*ex + sh, cy + BH/2 + bow(u)); }
      if (th.tear && u0 === tu) zig(sh, false);
      ctx.closePath(); ctx.fillStyle = th.band; ctx.fill(); ctx.lineWidth = 0.02*K; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    };
    if (th.tear){ half(-0.5, tu, -g); half(tu, 0.5, g); } else half(-0.5, 0.5, 0);
    let x = cx - tot/2;
    for (let i=0;i<str.length;i++){   // the letters ride the bow of the band
      const xc = x + ws[i]/2, u = (xc-cx)/(2*ex||1), sh = th.tear ? (xc < tearX ? -g : g) : 0; x += ws[i];
      if (th.droop){   // slump in from above, one by one, no bounce
        const k = (a - 0.35 - i*0.09)/0.5; if (k <= 0) continue;
        txt(str[i], xc, cy + bow(u) + 0.01*K - (1-ease(k))*0.35*K + Math.abs(i-(str.length-1)/2)*0.012*K*ease(k), size, {font:'display', color:'#e2e6ef', halo:th.fold, alpha:clamp(k*2,0,1)});
      } else {   // pop in, overshoot and settle
        const k = (a - 0.3 - i*0.06)/0.28, j = th.wobble ? Math.sin(a*12+i*0.9)*0.05*K*damp : 0; if (k <= 0) continue;
        txt(str[i], xc + sh, cy + bow(u) + 0.01*K + j, size*backOut(k), {font:'display', color:'#ffffff', halo:th.fold});
      }
    }
    if (th.spark) for (let i=0;i<8;i++){   // sparkles: four-point stars around the ribbon
      const st = 0.5 + i*0.11, v = Math.sin(Math.PI*clamp((a-st)/0.5,0,1)); if (v <= 0) continue;
      const ang = i*2.4, px = cx + Math.cos(ang)*(BW*0.55), py = cy + Math.sin(ang)*0.6*K, r = 0.14*K*v;
      ctx.beginPath(); for (let j=0;j<8;j++){ const rr = j%2 ? r*0.25 : r, t = j*Math.PI/4; ctx[j ? 'lineTo' : 'moveTo'](px + Math.cos(t)*rr, py + Math.sin(t)*rr); }
      ctx.closePath(); ctx.fillStyle = th.spark[i%2]; ctx.fill();
    }
    if (sub && a > 0.9) pill(sub, W/2, cy + 0.6*K - (th.droop ? arc : 0), 0.1*K, NAVY, '#ffffff', {font:'display', ls:.12});
  }
  function drawShow(t){
    if (!show) return;
    const a = t - show.t0, hy = headY(), deck = {x:W/2, y:hy-1.5*SP()*0.866}, lx = W/2-LB()/2, k = show.kind;
    if (k === 'strike'){
      if (a < 0.8){ const u = a/0.8; circle(deck.x, deck.y, ease(u)*1.3*K); ctx.lineWidth = 0.06*K*(1-u); ctx.strokeStyle = '#d6336c'; ctx.globalAlpha = 1-u; ctx.stroke(); ctx.globalAlpha = 1; }
      if (a < 1.6) for (let i=0;i<12;i++){   // little pins burst out of the deck
        const ang = i/12*Math.PI*2 + 0.3, d = ease(a/1.3)*1.15*K, x = deck.x+Math.cos(ang)*d, y = deck.y+Math.sin(ang)*d*0.8, r = 0.05*K;
        ctx.save(); ctx.translate(x,y); ctx.rotate(ang + a*7); ctx.globalAlpha = clamp((1.6-a)/0.4,0,1);
        rrect(-r*1.6,-r*0.6,r*3.2,r*1.2,r*0.6); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 0.01*K; ctx.strokeStyle = '#7d879c'; ctx.stroke();
        ctx.fillStyle = '#c9302a'; ctx.fillRect(r*0.4,-r*0.6,r*0.35,r*1.2); ctx.restore();
      }
      ribbon('STRIKE!', 'HOLE IN ONE', a - 0.1, THEMES.strike);
    } else if (k === 'spare'){
      const u = ease(a/0.4), x0 = lx+0.15*K, y0 = hy+0.35*K, x1 = lx+LB()-0.15*K, y1 = hy-3*SP()*0.866-0.3*K;   // the spare mark: a slash
      ctx.lineCap = 'round'; ctx.lineWidth = 0.14*K; ctx.strokeStyle = THEMES.spare.band; seg(x0, y0, x0+(x1-x0)*u, y0+(y1-y0)*u); ctx.stroke();
      ribbon('SPARE', 'ALL TEN IN 2', a - 0.25, THEMES.spare);
    } else if (k === 'split'){
      const st = pins.filter(p => !p.down && !p.gone), puls = a < 1.8 ? Math.sin(a*9)*0.25 : 0;
      for (const p of st){ circle(p.x, p.y, PIN_R()*(1.55+puls)); ctx.lineWidth = 0.03*K; ctx.strokeStyle = THEMES.split.band; ctx.stroke(); }
      const L = st.reduce((m,p) => p.x < m.x ? p : m), R = st.reduce((m,p) => p.x > m.x ? p : m), u = ease((a-0.2)/0.4);
      if (u > 0){   // a crack between the outside pins
        ctx.beginPath(); ctx.moveTo(L.x, L.y); const n = 7;
        for (let i=1;i<=Math.ceil(n*u);i++){ const f = Math.min(i/n, u), j = i<n ? (i%2 ? 1 : -1)*0.06*K : 0; ctx.lineTo(L.x+(R.x-L.x)*f, L.y+(R.y-L.y)*f+j); }
        ctx.lineWidth = 0.025*K; ctx.strokeStyle = '#c9302a'; ctx.setLineDash([0.05*K, 0.03*K]); ctx.stroke(); ctx.setLineDash([]);
      }
      ribbon('SPLIT!', 'PICK IT UP FOR A SPARE', a - 0.35, THEMES.split);
    } else if (k === 'gutter'){
      if (a < 1.5 && Math.floor(a/0.25)%2 === 0){ ctx.fillStyle = 'rgba(201,48,42,0.55)'; ctx.fillRect(lx-GUT(), 0, GUT(), D); ctx.fillRect(lx+LB(), 0, GUT(), D); }
      ribbon('GUTTER', 'STAY ON THE LANE', a, THEMES.gutter);
    } else if (k === 'wobbler') ribbon('WOBBLER', 'SO CLOSE', a, THEMES.wobbler);
    else if (k === 'clear') ribbon('ALL TEN', `IN ${putts} PUTTS`, a, THEMES.clear);
    else if (k === 'pick') ribbon('PICK UP', 'HOLE SCORES 5', a, THEMES.pick);
  }
  function drawPin(x,y,r){ circle(x,y,r); ctx.fillStyle='#ffffff'; ctx.fill(); ctx.lineWidth=0.012*K; ctx.strokeStyle='#7d879c'; ctx.stroke(); circle(x,y,r*0.58); ctx.lineWidth=r*0.2; ctx.strokeStyle='#c9302a'; ctx.stroke(); circle(x,y,r*0.2); ctx.fillStyle='#d7dbe5'; ctx.fill(); }
  return {
    id:'bowling', name:'Bowling', reads:'path', tapOK:false,
    how:'Ten projected pins at the far end of a lane. Pins fall where the ball’s path crosses them and can take neighbors down. Knocked pins are cleared between putts.',
    rule:() => 'Putts to finish: your score is the putts it takes to knock down all ten pins, so a strike is a hole in one. After 4 putts you pick up and take 5.',
    hole:() => ({par:SIM.bowlPar, list:[{who:'', strokes:strokes()}], final:!!done}),
    start(){ rack(); putts=0; done=null; log=[]; knocked=0; trail=[]; gutter=false; onLane=false; show=null; },
    status(){ return done ? 'Hole complete' : `Putt ${putts+1} of ${MAX_PUTTS} · ${plural(standing(),'pin')} standing`; },
    /*SIM*/autoPutt(){   // the pocket beside the head pin on a full rack, otherwise straight at the nearest standing pin
      const st = pins.filter(p=>!p.down && !p.gone), f = st.reduce((a,p) => p.y > a.y ? p : a);
      return puttTo(f.x + (st.length === 10 ? 0.24*SP() : 0), f.y, 1.5*K); },
    leave(nums){ pins.forEach((p,i) => { p.gone = !nums.includes(i+1); }); },   // desk tests: set up a spare, pins numbered as in bowling/*/SIM*/
    onShotStart(){ knocked=0; trail=[]; gutter=false; onLane=false; },
    onSample(s, prev){
      trail.push(s); if (!prev || gutter) return;
      const dx=s.x-prev.x, dy=s.y-prev.y, L=Math.hypot(dx,dy); if (L<1e-6) return;
      const bx=dx/L, by=dy/L, v=clamp((speedAt(s)-SPEED_MIN)/(SPEED_FULL-SPEED_MIN), 0, 1), h=HIT();
      for (const p of pins){
        if (p.down || p.gone) continue;
        // where along this step the ball first touches the pin; the pin leaves along the line between their centers
        const fx=prev.x-p.x, fy=prev.y-p.y, b=fx*bx+fy*by, disc=b*b-(fx*fx+fy*fy-h*h); if (disc<0) continue;
        const t0=-b-Math.sqrt(disc), t1=-b+Math.sqrt(disc); if (t1<0 || t0>L) continue;
        if (p.wob != null && t0 < 0) continue;   // still touching the pin it just wobbled
        const t=Math.max(0,t0); let nx=p.x-(prev.x+bx*t), ny=p.y-(prev.y+by*t); const nl=Math.hypot(nx,ny)||1; nx/=nl; ny/=nl;
        topple(p, nx, ny, v*BALL_PUSH*Math.max(0, nx*bx+ny*by), 0, 0);
      }
      // the tee box is wider than the lane, so a ball may come onto it from the side; once on, leaving it is the gutter and nothing counts after
      if (Math.abs(s.x-W/2) <= LB()/2) onLane=true; else if (onLane) gutter=true;
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
        if (!p.down || t < p.fall.t){
          const w = p.wob != null && !p.down ? t-p.wob : -1, j = w >= 0 && w < 0.9 ? Math.sin(w*34)*0.02*K*(1-w/0.9) : 0;   // a wobbling pin rocks and settles
          drawPin(p.x+j, p.y, PIN_R()); continue;
        }
        // the pin topples (faster when hit harder) and slides along its route, tumbling while it moves
        const path = p.fall.path, end = path[path.length-1], f = Math.min(1, p.fall.v/BALL_PUSH);
        const pr = clamp((t-p.fall.t)/(0.3-0.15*f),0,1), e = 1-(1-pr)*(1-pr);
        let cx=end.x, cy=end.y;
        for (let i=1;i<path.length;i++) if (t < path[i].t){ const a=path[i-1], b=path[i], u=(t-a.t)/Math.max(1e-6,b.t-a.t); cx=a.x+(b.x-a.x)*u; cy=a.y+(b.y-a.y)*u; break; }
        const ang = Math.atan2(p.fall.dy,p.fall.dx) + (Math.min(t,end.t)-p.fall.t)*5*f;
        ctx.save(); ctx.translate(cx,cy); ctx.rotate(ang); ctx.globalAlpha = t-end.t > 1.2 ? 0.55 : 1;
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
      // head pin at the bottom, as on the lane
      for (const p of pins){ const x=sx+(p.x-W/2)*0.75, y=D*0.16+0.32*K+(p.y-hy+SP()*3*0.866)*0.75; circle(x,y,0.07*K); if (!p.gone && (!p.down || t < p.fall.t)){ ctx.fillStyle='#1d2333'; ctx.fill(); } else { ctx.lineWidth=0.012*K; ctx.strokeStyle='#9aa2b4'; ctx.stroke(); } }
      drawShow(t);
    },
    onRest(p, why){
      putts++; const left = standing(); log.push({down:knocked, left});
      const note = why && !knocked ? ' '+WHY[why] : '', reached = trail.some(s => s.y < headY()+PIN_R());
      const sh = kind => { show = {kind, t0:state.clock, rest:p}; };
      if (!left){ done='clear'; sh(putts === 1 ? 'strike' : putts === 2 ? 'spare' : 'clear'); return {title: putts===1 ? 'Strike: hole in one' : putts===2 ? 'Spare: all ten in 2' : `All ten in ${putts}`, detail:`Hole score ${putts}.`, tone:'good'}; }
      if (putts >= MAX_PUTTS){ done='pick'; sh('pick'); return {title:'Pick up', detail:`${plural(left,'pin')} still standing after ${MAX_PUTTS} putts, so the hole scores 5.`+note, tone:'bad'}; }
      const wobbled = pins.some(q => q.wob != null && !q.down && !q.gone), split = putts === 1 ? splitName() : null;
      if (split) sh('split'); else if (!knocked && gutter) sh('gutter'); else if (!knocked && wobbled) sh('wobbler');
      return {title: knocked ? plural(knocked,'pin') : gutter ? 'Gutter ball' : wobbled ? 'Wobbler' : why === 'short' || (p && !reached) ? 'Short' : 'No pins', detail:(split ? `A ${split} split. ` : '')+`${plural(left,'pin')} standing, ${plural(putts,'stroke')} so far.`+note, tone: knocked ? '' : 'bad'};
    },
    advance(){ show = null; if (done) return 'over'; pins.forEach(p => { if (p.down) p.gone = true; p.wob = null; }); trail=[]; return 'next'; },
    summary(){ return {detail: done === 'clear' ? `All ten pins down in ${plural(putts,'putt')}.` : `${plural(standing(),'pin')} left standing after ${MAX_PUTTS} putts.`}; },
    card(){
      if (!log.length) return '<p class="empty">No putts yet. Ten pins to clear.</p>';
      const r = log.map((x,i)=>`<tr><td>${i+1}</td><td class="num">${x.down}</td><td class="num">${x.left}</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>Putt</th><th class="num">Knocked</th><th class="num">Standing</th></tr></thead><tbody>${r}</tbody><tfoot><tr><td colspan="2">Strokes</td><td class="num">${strokes()}</td></tr></tfoot></table>`;
    },
    notes(){ return li([
      `Reads <b>the ball’s path</b>. A pin falls when the path passes within ${(HIT()*12).toFixed(1)} in of its center, the same ratio a bowling ball has to real pins. The tee box is wider than the lane, so the ball may come onto the lane from the side; once its center has been on the lane and crosses an edge, it is in the gutter and knocks nothing down after that.`,
      `Falling pins collide like real pins: a struck pin flies off along the line between the centers with the head-on share of the hit, knocks over what it meets and bounces off the lane edges. There is no randomness, so the same path always leaves the same pins. As in bowling, a ball about ${(0.24*SP()*12).toFixed(1)} in to either side of the head pin (the pocket) strikes far more often than a dead-center hit.`,
      `<b>Speed matters.</b> The push grows with the ball’s speed at the pin, from nothing at ${SPEED_MIN} ft/s to full at ${SPEED_FULL} ft/s. A creeping ball or a thin graze only makes a pin wobble; a firm putt carries pins across the rack. Splits like the 2-10 and 4-10 can be picked up with a firm, thin hit from a corner of the tee box; the 7-10 cannot.`,
      `<b>Putts-to-finish scoring</b> turns bowling into golf: a strike is an ace and a spare is a 2. In simulation at the default rig settings, an office-average putter averages ${SIM.bowlAvg} strokes and strikes ${SIM.bowlStrike}% of the time, which sets par at ${SIM.bowlPar}.`,
      'Pins drop when the camera reports the hit. With 250 ms of lag the ball is visibly past the rack before anything falls, which looks broken to players. Aim for under 100 ms.',
      'Pins reset by redrawing, so there is no pinsetter to build. Ball retrieval is the only reset time between putts.'
    ]); }
  };
}

