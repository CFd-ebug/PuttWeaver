// ---------- Timeline ----------
function makeTimeline(){
  const Y0=1900, Y1=2025, NB=Y1-Y0+1, N=4;
  const OPT = [{id:'zone', label:'Close counts within', choices:[['wide','±5 years · par 3'], ['tight','±2 years · par 4']]}];
  const opt = id => optVal('timeline', OPT, id);
  const tol = () => opt('zone') === 'tight' ? 2 : 5;
  const xOf = y => (y-Y0+0.5)/NB*W;
  const yearAt = x => Y0 + clamp(Math.floor(x/W*NB), 0, NB-1);
  let picks, num, rows, last, hits, live;
  const cur = () => picks[num-1];
  const score = () => countdownScore(hits);
  return {
    id:'timeline', name:'Timeline', reads:'rest', tapOK:true, opts:OPT,
    how:'An event is projected at the top. The sheet is a timeline from 1900 to 2025, and only the left-right position where the ball stops matters. Four events per hole.',
    rule:() => `Countdown: start at 5. Each ball that stops within ${tol()} years of the right year takes a stroke off.`,
    hole:() => ({par: opt('zone') === 'tight' ? 4 : 3, list:[{who:'', strokes:score()}], final: rows.length >= N}),
    start(){ picks=shuffle(EVENTS).slice(0,N); num=1; rows=[]; last=null; hits=0; live=null; },
    status(){ return `Event ${num} of ${N} · score ${score()}`; },
    /*SIM*/autoPutt(){ return puttTo(xOf(cur().year), D*0.45); },/*/SIM*/
    onShotStart(){ live=null; last=null; },
    onSample(s){ live=s; },
    drawSheet(){
      const ay = D*0.66;
      for (let d=Y0; d<=Y1; d+=10){
        const x0=(d-Y0)/NB*W, x1=Math.min(W,(d+10-Y0)/NB*W);
        ctx.fillStyle = ((d-Y0)/10)%2 ? '#e3e8f6' : '#eff1f9'; ctx.fillRect(x0,0,x1-x0,D);
        if (d<Y1) txt(`${d}s`, (x0+x1)/2, D-0.2*K, 0.1*K, {font:'display', color:'rgba(46,60,104,0.3)', min:7});
      }
      ctx.strokeStyle='#4a5672'; ctx.lineWidth=0.02*K; seg(0,ay,W,ay); ctx.stroke();
      for (let y=Y0; y<=Y1; y++){
        const x=xOf(y), L = y%10===0 ? 0.2*K : y%5===0 ? 0.11*K : 0.05*K;
        ctx.lineWidth = y%10===0 ? 0.016*K : 0.01*K; seg(x,ay-L,x,ay+L*0.4); ctx.stroke();
      }
      for (let d=Y0; d<=Y1; d+=10) txt(String(d), xOf(d), ay+0.2*K, 0.09*K, {font:'mono', weight:500, color:'#33405e', min:7});
      const c = cur(), bx=W*0.1, bw=W*0.8, by=0.14*K;
      const lines = wrapLines(c.text, bw-0.5*K, 0.18*K, {});
      const bh = 0.34*K + lines.length*0.24*K;
      banner(bx,by,bw,bh);
      txt('WHEN DID THIS HAPPEN?', W/2, by+0.17*K, 0.07*K, {font:'display', color:'#9fb3ff', ls:.12});
      txt(`${num}/${N} · SCORE ${score()}`, bx+bw-0.16*K, by+0.17*K, 0.07*K, {font:'mono', weight:500, align:'right', color:'#9fb3ff'});
      lines.forEach((l,i) => txt(l, W/2, by+0.4*K+i*0.24*K, 0.18*K, {color:'#fff'}));
      if (live && !last){
        const x = clamp(live.x,0,W);
        ctx.strokeStyle='rgba(35,67,214,0.75)'; ctx.lineWidth=0.02*K; seg(x,ay-0.55*K,x,ay+0.35*K); ctx.stroke();
        pill(String(yearAt(x)), x, ay-0.7*K, 0.1*K, '#2343d6', '#fff', {font:'mono', weight:500});
      }
      if (last){
        const ax = xOf(c.year), top = by+bh+0.1*K, bot = ay+0.3*K;
        const z0 = xOf(c.year-tol()) - W/NB/2, z1 = xOf(c.year+tol()) + W/NB/2;
        ctx.fillStyle='rgba(35,67,214,0.13)'; ctx.fillRect(z0, top, z1-z0, bot-top);
        ctx.save(); ctx.setLineDash([0.04*K,0.03*K]); ctx.strokeStyle='rgba(35,67,214,0.7)'; ctx.lineWidth=0.012*K;
        seg(z0,top,z0,bot); ctx.stroke(); seg(z1,top,z1,bot); ctx.stroke(); ctx.restore();
        if (last.p){
          const gx = xOf(last.guess);
          ctx.strokeStyle='#141a2e'; ctx.lineWidth=0.02*K; seg(gx, top, gx, bot); ctx.stroke();
          pill(`you: ${last.guess}`, gx, ay-0.42*K, 0.09*K, last.hit ? '#2343d6' : '#141a2e', '#fff', {font:'mono', weight:500});
        }
        ctx.strokeStyle='#c9302a'; ctx.lineWidth=0.03*K; seg(ax, top, ax, bot); ctx.stroke();
        pill(String(c.year), ax, ay-0.78*K, 0.12*K, '#c9302a', '#fff', {font:'mono', weight:500});
      }
    },
    onRest(p, why){
      const c = cur(); live=null;
      if (!p){ rows.push({text:c.text, year:c.year, guess:null, hit:false}); last={p:null}; return {title:'No reading', detail:`${WHY[why]} It was ${c.year}. Score stays ${score()}.`, tone:'bad'}; }
      const guess=yearAt(p.x), diff=Math.abs(guess-c.year), hit = diff <= tol();
      if (hit) hits++;
      rows.push({text:c.text, year:c.year, guess, hit}); last={p, guess, hit};
      const off = diff===0 ? 'Exact year' : `${plural(diff,'year')} off`;
      return {title: hit ? `${off}: −1 stroke` : off, detail:`The ball said ${guess}. ${c.text}: ${c.year}. Score ${hit ? 'now' : 'stays'} ${score()}.`, tone: hit ? 'good' : 'bad'};
    },
    advance(){ if (rows.length>=N) return 'over'; num++; last=null; live=null; return 'next'; },
    summary(){ return {detail:`${hits} of ${N} events within ${tol()} years.`}; },
    card(){
      if (!rows.length) return '<p class="empty">No putts yet. Four events per hole.</p>';
      const r = rows.map((x,i)=>`<tr><td>${i+1}</td><td class="name">${esc(x.text)}</td><td class="num">${x.year}</td><td class="num${x.guess==null?' off':''}">${x.guess ?? '—'}</td><td class="num">${x.hit?'−1':'·'}</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>#</th><th>Event</th><th class="num">Year</th><th class="num">Ball</th><th class="num">Stroke</th></tr></thead><tbody>${r}</tbody><tfoot><tr><td colspan="4">Score (started at 5)</td><td class="num">${score()}</td></tr></tfoot></table>`;
    },
    notes(){
      const inPerYear = W*12/NB;
      return li([
        'Reads <b>only the left-right position</b> where the ball stops, so the player can choose a short, safe putt. It plays as trivia with a light aiming test, which suits players who have never putted.',
        `<b>Countdown scoring.</b> Each year is ${inPerYear.toFixed(2)} in wide on a ${W} ft sheet, so ±${tol()} years is a band about ${(inPerYear*(2*tol()+1)).toFixed(0)} in wide.`,
        `In simulation at the default rig settings, an office-average putter who knows the exact year lands within ±5 years ${SIM.tl5}% of the time and within ±2 years ${SIM.tl2}%. Nearly all of the challenge here is knowledge.`,
        'The blue cursor follows the camera’s view of the rolling ball. Switch the lag setting to 250 ms to see how far a projected cursor trails a real ball.'
      ]);
    }
  };
}

