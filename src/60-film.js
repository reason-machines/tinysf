// ───────────────────────── the film ─────────────────────────
// Hard cuts between drone moves, each with its own light. A shot is
// { dur (frames), sky, az (sun bearing, 0 = north), cam(u), prog };
// dry marks a shot with no reflections worth drawing, which skips that pass;
// live gives the moving things shadows (the shadow map is redrawn each frame).
let SHOTS = [], TOTAL = 0;
const CARD = { markY: 400, markH: 250, fade: 12 };
function makeShots() {
  const line = (p0, p1, a0, a1, fov, up) => (u) => ({ pos: V3.mix(p0, p1, u), at: V3.mix(a0, a1 || a0, u), fov, up });
  const orbit = (c, r0, r1, h0, h1, d0, d1, lookY, fov) => (u) => { const a = (mix(d0, d1, u) * Math.PI) / 180, r = mix(r0, r1, u); return { pos: [c[0] + r * Math.sin(a), mix(h0, h1, u), c[1] + r * Math.cos(a)], at: [c[0], lookY, c[1]], fov }; };
  const down = (p0, p1, fov) => (u) => { const p = V3.mix(p0, p1, u); return { pos: p, at: [p[0], 0, p[2] - 0.001], fov, up: [0, 0, -1] }; };
  const P = world.plan, L = world.lagoons, br = P.bridge, site = world.site;
  const ag = ground(P.alamo[0] + 2, P.alamo[1] + 3);
  // The last move ends with the island exactly where the end card draws the mark.
  const perPx = world.mark.h / CARD.markH, fovR = 20, endH = (540 * perPx) / Math.tan((fovR * Math.PI) / 360);
  const ic = [OX + world.mark.w / 2, OZ + world.mark.h / 2];
  const endPos = [ic[0], SEA + 1 + endH, ic[1] + (540 - CARD.markY) * perPx], startPos = [240, 150, 146];
  const reveal = (u) => { const k = ease(clamp(u / 0.86, 0, 1)), kk = k * k * (3 - 2 * k); const p = [mix(startPos[0], endPos[0], kk), startPos[1] * Math.pow(endPos[1] / startPos[1], k), mix(startPos[2], endPos[2], kk)]; return { pos: p, at: [p[0], 0, p[2] - 0.001], fov: fovR, up: [0, 0, -1], near: 20 }; };

  // Fourteen moves on the cut list of the post this answers (same order of subjects, same
  // lengths to the frame at 30 fps), then the pull-back to the mark. No captions.
  SHOTS = [
    { dur: 75, sky: "gold", az: 194, cam: line([345, 37, 53], [333, 34, 63], [303, 27.5, 112], null, 56) }, // Coit Tower into the sun
    { dur: 159, sky: "gold", az: 192, dry: true, cam: line([217, 44, 206], [206, 43, 215], [126, 61, 272], [126, 62, 272], 57) }, // Sutro Tower over the sign
    { dur: 92, sky: "day", az: 150, live: true, cam: orbit(P.ferry, 50, 46, 31, 28, 108, 132, 24, 55) }, // Ferry Building from the bay
    { dur: 90, sky: "day", az: 128, dry: true, cam: down([126, 132, 204], [154, 132, 187], 50) }, // row houses, straight down
    { dur: 75, sky: "day", az: 248, dry: true, live: true, cam: line([P.alamo[0] - 0.5, ag + 1.3, P.alamo[1] + 5.5], [P.alamo[0] + 1.4, ag + 1.2, P.alamo[1] + 4.4], [P.alamo[0] + 22, ag + 3, P.alamo[1] - 1], null, 50) }, // Alamo Square, at corgi height
    { dur: 45, sky: "gold", az: 236, cam: line([233, 22, 121], [230, 22.6, 123], [203, 34, 137], null, 60) }, // a bridge tower, close
    { dur: 52, sky: "gold", az: 160, live: true, cam: orbit(P.palace, 52, 49, 41, 39, -128, -143, 16, 50) }, // Palace of Fine Arts
    { dur: 68, sky: "day", az: 110, dry: true, live: true, cam: line([256, 33, 320], [248, 29.5, 308], [220, 14, 266], null, 55) }, // SoMa
    { dur: 59, sky: "gold", az: 252, dry: true, cam: orbit(P.salesforce, 116, 110, 62, 70, -14, 4, 66, 40) }, // Salesforce Tower
    { dur: 60, sky: "karl", az: 205, dry: true, cam: line([347, 72, 118], [340, 69, 124], [300, 52, 153], null, 50) }, // the Pyramid in Karl the Fog
    { dur: 60, sky: "gold", az: 200, cam: line([236, 27, 62], [244, 26, 70], [240, 26, 137], null, 60) }, // the whole bridge
    { dur: 82, sky: "day", az: 110, dry: true, cam: orbit(P.site, 50, 44, 36, 40, 158, 196, 24, 45), prog: (u) => Math.floor(clamp(u / 0.85, 0, 1) * site.n) }, // a tower going up
    { dur: 82, sky: "day", az: 118, cam: line([452, 10, 6], [424, 12, 22], [246, 30, 178], null, 50) }, // the island from the water
    { dur: 82, sky: "day", az: 100, dry: true, cam: line([318.5, 13.5, 198.5], [315.5, 13.5, 201.5], [298, 88, 216], [298, 96, 217], 75) }, // looking up, from above the traffic
    { dur: 78, sky: "noon", az: 150, dry: true, cam: reveal },
    { dur: 45, card: true },
  ];
  const fi = SHOTS.findIndex((s) => s.prog);
  SHOTS.forEach((s, i) => { s.i = i; if (!s.prog) s.prog = () => (i < fi ? 0 : 1e9); });
  TOTAL = SHOTS.reduce((n, s) => n + s.dur, 0);
  const cm = $("cmark"); cm.style.height = CARD.markH + "px"; cm.style.top = CARD.markY - CARD.markH / 2 + "px"; cm.style.transform = "translateX(-50%)";
}

const painted = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
function seek(frame) {
  let f = clamp(Math.round(frame), 0, TOTAL - 1), i = 0; const t = f / FPS;
  while (f >= SHOTS[i].dur) { f -= SHOTS[i].dur; i++; }
  let s = SHOTS[i], u = f / s.dur, card = 0;
  if (s.card) { card = clamp((f + 1) / CARD.fade, 0, 1); s = SHOTS[i - 1]; u = 1; }
  if (card < 1) drawFrame(s.cam(u), light(s.sky, s.az), t, { prog: s.prog(u), noRefl: s.dry, live: s.live });
  $("bug").style.opacity = card ? 0 : 0.9;
  $("card").style.display = card ? "block" : "none"; $("card").style.opacity = card;
  return painted();
}
// Scouting: draw one camera under one sky. cam = [px,py,pz, ax,ay,az, fov, topDown], t in seconds.
window.debugCam = (c, sky = "day", az = 140, t = 0, prog) => { drawFrame({ pos: c.slice(0, 3), at: c.slice(3, 6), fov: c[6] || 50, up: c[7] ? [0, 0, -1] : [0, 1, 0] }, light(sky, az), t, { prog, live: true }); return painted(); };

function startFilm() {
  document.body.classList.add("film");
  makeShots();
  window.seek = seek; window.TOTAL = TOTAL; window.SHOTS = SHOTS;
  const fit = () => { const s = Math.min(innerWidth / 1920, innerHeight / 1080); $("stage").style.transform = `translate(${(innerWidth - 1920 * s) / 2}px,${(innerHeight - 1080 * s) / 2}px) scale(${s})`; };
  fit(); addEventListener("resize", fit);
  if (Q.has("frame")) return seek(+Q.get("frame"));
  if (Q.has("hold")) return;
  const t0 = performance.now(); const tick = () => { seek(Math.floor(((performance.now() - t0) / 1000) * FPS) % TOTAL); requestAnimationFrame(tick); }; tick();
}
