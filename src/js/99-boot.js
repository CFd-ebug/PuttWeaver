$('stageBox').appendChild(warpCanvas); liveLoad(); bindLivePanel();
const ensureFonts = ['400 20px "Bungee"','700 20px "Atkinson Hyperlegible"','400 20px "Atkinson Hyperlegible"','500 20px "IBM Plex Mono"','400 20px "IBM Plex Mono"'];
if (document.fonts && document.fonts.load) ensureFonts.forEach(f => document.fonts.load(f).catch(()=>{}));
startGame();
/*__TEST__*/
requestAnimationFrame(t => { lastT=t; requestAnimationFrame(frame); });
