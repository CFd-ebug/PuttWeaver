// ---------- Map Quest ----------
function makeMap(){
  const N = 4;
  const OPT = [{id:'zone', label:'Close counts within', choices:[['wide','6 in · par 3'], ['tight','3 in · par 4']]}];
  const opt = id => optVal('map', OPT, id);
  const zoneIn = () => opt('zone') === 'tight' ? 3 : 6;
  const mercY = lat => Math.log(Math.tan(Math.PI/4 + lat*Math.PI/360));
  const YT = mercY(78), SPAN = 2*Math.PI*9/16;
  const lonX = lon => (lon+180)/360*W;
  const latY = lat => (YT-mercY(lat))/SPAN*D;
  const xLon = x => x/W*360-180;
  const yLat = y => (2*Math.atan(Math.exp(YT - y/D*SPAN)) - Math.PI/2)*180/Math.PI;
  let cache={key:'', c:null};
  let picks, num, rows, last, hits;
  function mapImage(){
    const w=Math.max(1,Math.round(W*view.T)), h=Math.max(1,Math.round(D*view.T)), key=w+'x'+h;
    if (cache.key===key) return cache.c;
    const c = cache.c || document.createElement('canvas'); c.width=w; c.height=h;
    worldMapDraw(c.getContext('2d'), w, h, w/W);
    cache={key,c}; return c;
  }
  const cur = () => picks[num-1];
  let lastQuip = '';
  function quip(kind){     // a random line from the group, never the same line twice in a row
    const l = MAP_QUIPS[kind].filter(q => q !== lastQuip);
    return (lastQuip = l[Math.floor(Math.random()*l.length)]);
  }
  const score = () => countdownScore(hits);
  return {
    id:'map', name:'Map Quest', reads:'rest', tapOK:true, opts:OPT,
    how:'A place is projected at the bottom of the sheet. Putt so the ball stops on it. Four places per hole, each harder than the last.',
    rule:() => `Countdown: start at 5. Each ball that stops within ${zoneIn()} in of the place takes a stroke off.`,
    hole:() => ({par: opt('zone') === 'tight' ? 4 : 3, list:[{who:'', strokes:score()}], final: rows.length >= N}),
    start(){ picks=PLACE_TIERS.slice(0,N).map((t,i) => ({...shuffle(t.list)[0], tier:i})); num=1; rows=[]; last=null; hits=0; },
    status(){ return `Place ${num} of ${N} · score ${score()}`; },
    /*SIM*/autoPutt(){ const c = cur(); return puttTo(lonX(c.lon), latY(c.lat)); },/*/SIM*/
    drawSheet(){
      ctx.drawImage(mapImage(),0,0,W,D);
      const c = cur(), bx=W*0.34, bw=W*0.32, by=D*0.845, bh=D*0.135;
      banner(bx,by,bw,bh);
      const prog = `${num}/${N} · SCORE ${score()}`;
      const tier = PLACE_TIERS[c.tier], lab = tier.label.toUpperCase();
      if (last && last.quip && !SHOTS.clean) pill(last.quip, bx+bw/2, by-0.15*K, 0.1*K, last.hit ? '#2343d6' : '#141a2e', '#fff');   // the players read the quip on the sheet
      if (tw(lab, 0.07*K, {font:'display', ls:.12}) + tw(prog, 0.07*K, {font:'mono', weight:500}) + 0.4*K < bw)
        txt(lab, bx+0.14*K, by+bh*0.24, 0.07*K, {font:'display', align:'left', color:tier.color, ls:.12});
      txt(prog, bx+bw-0.14*K, by+bh*0.24, 0.07*K, {font:'mono', weight:500, align:'right', color:'#9fb3ff'});
      txt(c.name, bx+bw/2, by+bh*0.56, 0.19*K, {font:'display', color:'#fff', maxW:bw-0.25*K});
      txt(c.where, bx+bw/2, by+bh*0.84, 0.07*K, {weight:400, color:'#c8d2ee', maxW:bw-0.25*K});
      if (last){
        const tx=lonX(c.lon), ty=latY(c.lat), zr=zoneIn()/12;
        circle(tx,ty,zr); ctx.fillStyle='rgba(35,67,214,0.14)'; ctx.fill();
        ctx.save(); ctx.setLineDash([0.04*K,0.03*K]); ctx.lineWidth=0.014*K; ctx.strokeStyle='rgba(35,67,214,0.85)'; circle(tx,ty,zr); ctx.stroke(); ctx.restore();
        if (last.p) dashed(last.p.x,last.p.y,tx,ty,'#c9302a',0.02*K);
        circle(tx,ty,0.05*K); ctx.fillStyle='#c9302a'; ctx.fill(); ctx.lineWidth=0.015*K; ctx.strokeStyle='#fff'; ctx.stroke();
        txt(c.name, tx, ty-zr-0.12*K, 0.085*K, {color:'#8f1d18', halo:'rgba(255,255,255,0.92)'});
        if (last.p) pill(`${fmt(last.km)} km`, last.p.x, last.p.y+0.26*K, 0.085*K, last.hit ? '#2343d6' : '#141a2e', '#fff', {font:'mono', weight:500});
      }
    },
    onRest(p, why){
      const c = cur(), tx=lonX(c.lon), ty=latY(c.lat);
      if (!p){ rows.push({name:c.name, km:null, hit:false}); last={p:null, hit:false, quip: why === 'short' ? '' : quip('gone')}; return {title: last.quip || 'No reading', verdict:'No reading', detail:`${WHY[why]} No stroke off. Score stays ${score()}.`, tone:'bad'}; }
      const lat=yLat(p.y), lon=xLon(p.x), km=hav(lat,lon,c.lat,c.lon);
      const missIn = Math.hypot(p.x-tx, p.y-ty)*12, hit = missIn <= zoneIn();
      if (hit) hits++;
      const z = zoneIn(), own = MAP_PLACE_QUIPS[c.name], title = own ? (hit ? own.hit : own.miss)
        : quip(hit ? 'hit' : missIn <= 1.5*z ? 'near' : missIn <= 2.5*z ? 'region' : missIn <= 4*z ? 'far' : 'world');   // bands scale with the close zone, like the scoring
      rows.push({name:c.name, km, hit}); last={p, km, hit, quip:title};
      const verdict = hit ? 'Close · −1 stroke' : missIn <= 1.5*z ? 'Almost close' : 'Not close';
      return hit
        ? {title, verdict, detail:`Close: −1 stroke. ${fmt(km)} km from ${c.name}, ${missIn.toFixed(1)} in from the spot. Score now ${score()}.`, tone:'good'}
        : {title, verdict, detail:`${fmt(km)} km off, ${missIn.toFixed(1)} in from the spot; it needed to stop within ${zoneIn()} in. Score stays ${score()}.`, tone:'bad'};
    },
    shotInfo(){        // for the console: what the target was and how the last ball did (optional hook for any game)
      if (!last) return null;
      const c = cur(), x = lonX(c.lon), y = latY(c.lat);
      return {key:c.name, name:c.name, x, y, r:zoneIn()/12, hit:!!last.hit, off:last.p ? Math.hypot(last.p.x-x, last.p.y-y)*12 : null, km:last.km == null ? null : last.km};
    },
    advance(){ if (rows.length>=N) return 'over'; num++; last=null; return 'next'; },
    summary(){
      const ok = rows.filter(r=>r.km!=null), avg = ok.length ? ok.reduce((a,r)=>a+r.km,0)/ok.length : 0;
      return {detail:`${hits} of ${N} places within ${zoneIn()} in.` + (ok.length ? ` Average miss ${fmt(avg)} km.` : '')};
    },
    card(){
      if (!rows.length) return '<p class="empty">No putts yet. Four places per hole.</p>';
      const r = rows.map((x,i)=>`<tr><td>${i+1}</td><td class="name">${esc(x.name)}</td><td class="num${x.km==null?' off':''}">${x.km==null?'no read':fmt(x.km)}</td><td class="num">${x.hit?'−1':'·'}</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>#</th><th>Place</th><th class="num">km off</th><th class="num">Stroke</th></tr></thead><tbody>${r}</tbody><tfoot><tr><td colspan="3">Score (started at 5)</td><td class="num">${score()}</td></tr></tfoot></table>`;
    },
    notes(){
      const kmIn = 40075/(W*12);
      return li([
        'Reads <b>where the ball stops</b>. Like maptap, the map has no country borders, and the four rounds get harder: Easy, Medium, Hard, Expert, one place drawn from each list. The map is Mercator, cropped at 78° N and about 56° S so it fills a 16:9 sheet with no stretching.',
        `<b>Countdown scoring.</b> The close zone is measured on the sheet rather than in km, so it is equally hard anywhere on the map. On a ${W} ft sheet, ${zoneIn()} in is about ${fmt(kmIn*zoneIn())} km at the equator.`,
        `In simulation at the default rig settings, an office-average putter who knows exactly where to aim stops within 6 in ${SIM.map6}% of the time and within 3 in ${SIM.map3}%. Real players also miss on knowledge, which is why 6 in plays as par 3.`,
        'Land is near-white and the ocean pale blue. Nothing on the map is yellow or green, so the projection can’t be mistaken for the ball.'
      ]);
    }
  };
}

