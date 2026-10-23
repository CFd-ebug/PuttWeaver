// ---------- Tic-Tac-Toe ----------
function makeTTT(){
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const SQ = ['top-left corner','top edge','top-right corner','left edge','center','right edge','bottom-left corner','bottom edge','bottom-right corner'];
  const OPT = [{id:'bot', label:'Bot', choices:[['medium','Medium'], ['easy','Easy'], ['hard','Perfect']]}];
  const opt = id => optVal('ttt', OPT, id);
  const botName = () => OPT[0].choices.find(c => c[0] === opt('bot'))[1];
  const LINE_ZONE = 0.6*IN, X_COL = '#2343d6', O_COL = '#c9302a';
  let b, marks, log, over, winner, winLine, winAt, putts, xs, os;
  const geo = () => { const G = Math.min(D*0.86, W*0.56); return {x0:(W-G)/2, y0:(D-G)/2, G, c:G/3}; };
  const center = i => { const g = geo(); return {x:g.x0+(i%3+0.5)*g.c, y:g.y0+(Math.floor(i/3)+0.5)*g.c}; };
  const empties = bd => [0,1,2,3,4,5,6,7,8].filter(i => !bd[i]);
  function lineWin(bd){ for (const l of LINES){ const [a,c,d] = l; if (bd[a] && bd[a] === bd[c] && bd[a] === bd[d]) return {who:bd[a], line:l}; } return null; }
  function mm(bd, turn, depth){ // minimax value from O's point of view
    const w = lineWin(bd); if (w) return w.who === 'O' ? 10-depth : depth-10;
    const e = empties(bd); if (!e.length) return 0;
    let v = turn === 'O' ? -Infinity : Infinity;
    for (const i of e){ bd[i] = turn; const s = mm(bd, turn === 'O' ? 'X' : 'O', depth+1); bd[i] = null; v = turn === 'O' ? Math.max(v, s) : Math.min(v, s); }
    return v;
  }
  function best(bd, who){
    const e = empties(bd);
    if (e.length === 9) return [4,0,2,6,8][Math.floor(Math.random()*5)];
    let top = -Infinity, picks = [];
    for (const i of e){ bd[i] = who; let s = mm(bd, who === 'O' ? 'X' : 'O', 1); bd[i] = null; if (who === 'X') s = -s; if (s > top){ top = s; picks = [i]; } else if (s === top) picks.push(i); }
    return picks[Math.floor(Math.random()*picks.length)];
  }
  const completes = (bd, i, who) => { bd[i] = who; const w = !!lineWin(bd); bd[i] = null; return w; };
  function botPick(){
    const e = empties(b); if (!e.length) return null;
    const lvl = opt('bot');
    if (lvl === 'hard') return best(b, 'O');
    const win = e.filter(i => completes(b, i, 'O')), block = e.filter(i => completes(b, i, 'X'));
    const [pWin, pBlock, pSmart] = lvl === 'easy' ? [0.7, 0.4, 0] : [1, 0.8, 0.5];
    if (win.length && Math.random() < pWin) return win[0];
    if (block.length && Math.random() < pBlock) return block[0];
    if (Math.random() < pSmart) return best(b, 'O');
    return e[Math.floor(Math.random()*e.length)];
  }
  function put(i, who, delay){ b[i] = who; marks.push({i, who, t:state.clock+delay}); if (who === 'X') xs++; else os++; }
  function settle(){
    const w = lineWin(b);
    if (w){ over = true; winner = w.who; winLine = w.line; winAt = marks[marks.length-1].t + 0.4; }
    else if (!empties(b).length){ over = true; winner = null; }
    return over;
  }
  function botTurn(){ const i = botPick(); if (i == null) return ''; put(i, 'O', 0.6); log.push({who:'Bot', what:`O · ${SQ[i]}`}); return `The bot took the ${SQ[i]}.`; }
  function strokes(){ if (!over) return null; if (winner === 'X') return putts === 3 ? 1 : 2; if (winner === 'O') return os === 3 ? 5 : 4; return 3; }
  function endResult(lead){
    const s = strokes();
    const title = winner === 'X' ? (s === 1 ? 'Three in a row on three putts' : 'You win') : winner === 'O' ? 'The bot wins' : 'Draw';
    return {title, detail:`${lead}${winner ? '' : ' The board is full.'} Hole score ${s}.`, tone: winner === 'X' ? 'good' : winner === 'O' ? 'bad' : ''};
  }
  function cellAt(p){
    const g = geo(), u = (p.x-g.x0)/g.c, v = (p.y-g.y0)/g.c, z = LINE_ZONE/g.c;
    const inside = u >= 0 && u <= 3 && v >= 0 && v <= 3;
    if (!inside) return (u >= -z && u <= 3+z && v >= -z && v <= 3+z) ? {line:true} : {out:true};
    const du = Math.min(...[0,1,2,3].map(k => Math.abs(u-k))), dv = Math.min(...[0,1,2,3].map(k => Math.abs(v-k)));
    if (du < z || dv < z) return {line:true};
    return {i: Math.floor(v)*3 + Math.floor(u)};
  }
  return {
    id:'ttt', name:'Tic-Tac-Toe', reads:'rest', tapOK:true, opts:OPT,
    how:'You are X and putt first. The square where your ball stops gets your mark, then the bot answers with an O. A ball off the board or in a taken square loses your turn.',
    rule:() => 'Match result: win 2, draw 3, lose 4. Three in a row on your first three putts scores 1. Losing to the bot’s first three marks scores 5.',
    hole:() => ({par:3, list:[{who:'', strokes:strokes()}], final:over}),
    start(){ b = Array(9).fill(null); marks=[]; log=[]; over=false; winner=null; winLine=null; winAt=0; putts=0; xs=0; os=0; },
    status(){ return over ? 'Match over' : `Your putt · ${plural(xs,'X')} on the board · bot: ${botName()}`; },
    /*SIM*/autoPutt(){ const c = center(best(b, 'X')); return puttTo(c.x, c.y); },/*/SIM*/
    drawSheet(){
      const g = geo(), t = state.clock;
      ctx.fillStyle='#eef0f6'; ctx.fillRect(0,0,W,D);
      rrect(g.x0-0.1*K, g.y0-0.1*K, g.G+0.2*K, g.G+0.2*K, 0.08*K); ctx.fillStyle='#ffffff'; ctx.fill();
      ctx.strokeStyle='#1d2333'; ctx.lineCap='round'; ctx.lineWidth=1*IN;
      for (let k=1; k<3; k++){ seg(g.x0+k*g.c, g.y0, g.x0+k*g.c, g.y0+g.G); ctx.stroke(); seg(g.x0, g.y0+k*g.c, g.x0+g.G, g.y0+k*g.c); ctx.stroke(); }
      ctx.lineCap='butt'; ctx.lineWidth=0.5*IN; ctx.strokeStyle='#9aa2b6'; ctx.strokeRect(g.x0, g.y0, g.G, g.G);
      for (const m of marks){
        const pr = clamp((t-m.t)/0.35, 0, 1); if (pr <= 0) continue;
        const {x, y} = center(m.i), r = g.c*0.28; ctx.lineWidth = g.c*0.09; ctx.lineCap='round';
        if (m.who === 'X'){
          ctx.strokeStyle = X_COL; const a = clamp(pr*2,0,1), q = clamp(pr*2-1,0,1);
          seg(x-r, y-r, x-r+2*r*a, y-r+2*r*a); ctx.stroke();
          if (q > 0){ seg(x+r, y-r, x+r-2*r*q, y-r+2*r*q); ctx.stroke(); }
        } else { ctx.strokeStyle = O_COL; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI/2, -Math.PI/2+pr*Math.PI*2); ctx.stroke(); }
      }
      if (winLine && t >= winAt){
        const a = center(winLine[0]), z = center(winLine[2]), ex = (z.x-a.x)*0.2, ey = (z.y-a.y)*0.2;
        ctx.strokeStyle = winner === 'X' ? 'rgba(35,67,214,0.5)' : 'rgba(201,48,42,0.5)'; ctx.lineWidth = g.c*0.14; ctx.lineCap='round';
        seg(a.x-ex, a.y-ey, z.x+ex, z.y+ey); ctx.stroke();
      }
      ctx.lineCap='butt';
      const lx = g.x0/2, rx = W - g.x0/2, gy = D*0.42, gr = 0.22*K;
      txt('YOU', lx, D*0.2, 0.13*K, {font:'display', color:X_COL});
      txt('BOT', rx, D*0.2, 0.13*K, {font:'display', color:O_COL});
      ctx.lineWidth = 0.07*K; ctx.lineCap='round'; ctx.strokeStyle = X_COL;
      seg(lx-gr, gy-gr, lx+gr, gy+gr); ctx.stroke(); seg(lx+gr, gy-gr, lx-gr, gy+gr); ctx.stroke();
      ctx.strokeStyle = O_COL; circle(rx, gy, gr); ctx.stroke(); ctx.lineCap='butt';
      txt(botName().toUpperCase(), rx, D*0.62, 0.08*K, {font:'mono', weight:500, color:'#5a6276', ls:.06});
      if (!over) pill('YOUR PUTT', lx, D*0.62, 0.08*K, X_COL, '#fff', {font:'mono', weight:500});
      hud('WIN 2 · DRAW 3 · LOSE 4', 0.2*K, D-0.18*K, 0.075*K, '#5a6276');
      hud(`PUTTS ${putts}`, W-0.2*K, D-0.18*K, 0.075*K, '#5a6276', 'right');
    },
    onRest(p, why){
      const c = p ? cellAt(p) : {out:true};
      if (c.line){ log.push({who:'You', what:'On a line · putt again'}); return {title:'On the line', detail:'The ball is touching a line, so the camera can’t tell which square it’s in. Putt again; your turn isn’t lost.'}; }
      putts++;
      if (c.out || b[c.i]){
        const what = c.out ? 'Off the board' : 'Square already taken';
        log.push({who:'You', what, bad:true});
        const bm = botTurn();
        if (settle()) return endResult(`${what}, so your turn passed. ${bm}`);
        return {title:what, detail:`${!p && why ? WHY[why]+' ' : ''}Your turn passes. ${bm}`, tone:'bad'};
      }
      put(c.i, 'X', 0); log.push({who:'You', what:`X · ${SQ[c.i]}`});
      const lead = `You took the ${SQ[c.i]}.`;
      if (settle()) return endResult(lead);
      const bm = botTurn();
      if (settle()) return endResult(`${lead} ${bm}`);
      return {title:`X: ${cap(SQ[c.i])}`, detail:`${bm} Your putt.`};
    },
    advance(){ return over ? 'over' : 'next'; },
    summary(){
      const res = winner === 'X' ? 'You won' : winner === 'O' ? 'The bot won' : 'It was a draw';
      return {detail:`${res} against the ${botName().toLowerCase()} bot in ${plural(putts,'putt')}.`};
    },
    card(){
      if (!log.length) return '<p class="empty">No putts yet. You are X and putt first.</p>';
      const r = log.map((x,i)=>`<tr><td>${i+1}</td><td class="name">${x.who}</td><td class="name${x.bad?' off':''}">${esc(x.what)}</td></tr>`).join('');
      return `<table class="sc"><thead><tr><th>#</th><th>Who</th><th>Move</th></tr></thead><tbody>${r}</tbody></table>`;
    },
    notes(){
      const g = geo();
      return li([
        `Reads <b>where the ball stops</b>. Squares are ${(g.c*12).toFixed(1)} in on a ${W} ft sheet. A ball whose center is within ½ in of a line is replayed, because camera noise could put it in either square.`,
        '<b>Match-result scoring.</b> Strategy is the knowledge part here: picking the right square matters as much as reaching it. The 1 and 5 are rare by design, like an ace or a disaster hole.',
        `In simulation at the default rig settings, an office-average putter who always picks the best square beats the medium bot ${SIM.tttW}% of the time, draws ${SIM.tttD}% and loses ${SIM.tttL}%, averaging ${SIM.tttAvg} strokes. Against the perfect bot a draw is the best possible result.`,
        'The far row is the hardest to reach accurately, so players learn to favor the near squares. That gives the bot a pattern to exploit and makes the far corners worth the risk.'
      ]);
    }
  };
}

