// ================= the world map picture, shared by the Map Quest game and the Manager console =================
// Draws land (coastlines only, no country borders, as in maptap) and graticule into a 2D context of w x h pixels. u is the number of pixels per foot of the projected sheet
// (it scales the line widths). Mercator, cropped at 78 N and about 56 S so a 16:9 sheet is filled with no stretching.
function worldMapDraw(g, w, h, u){
  const mercY = lat => Math.log(Math.tan(Math.PI/4 + lat*Math.PI/360)), YT = mercY(78), SPAN = 2*Math.PI*9/16;
  g.fillStyle = '#c2d5ea'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(48,80,128,0.22)';
  for (let lon = -150; lon <= 150; lon += 30){ const x = (lon+180)/360*w; g.lineWidth = Math.max(1, 0.012*u); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (const lat of [-30, 0, 30, 60]){ const y = (YT-mercY(lat))/SPAN*h; g.lineWidth = Math.max(1, (lat === 0 ? 0.024 : 0.012)*u); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const land = new Path2D(MAP_LAND);
  g.save(); const sx = w/3200; g.scale(sx, h/1800); g.lineJoin = 'round';
  g.fillStyle = '#f8f6f1'; g.fill(land, 'evenodd');
  g.strokeStyle = '#5a6d8e'; g.lineWidth = Math.max(0.8, 0.012*u)/sx; g.stroke(land);
  g.restore();
}
