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

  // The first eight moves follow the post this answers shot for shot: the same lengths to the
  // frame at 30 fps (cuts at 2.5, 5.0, 7.75, 10.9, 13.9, 16.4, 17.9 and 19.6 s), the same framing,
  // move and light, with our landmarks standing in. The rest keeps its order of subjects. No captions.
  // around: a camera circling c at bearing b (0 = north of it), looking lx blocks to the right of it.
  const around = (c, b0, b1, r0, r1, y0, y1, ly, fov, lx = 0) => (u) => { const b = (mix(b0, b1, u) * Math.PI) / 180, r = mix(r0, r1, u); return { pos: [c[0] + r * Math.sin(b), mix(y0, y1, u), c[1] - r * Math.cos(b)], at: [c[0] - lx * Math.cos(b), ly, c[1] - lx * Math.sin(b)], fov }; };
  // fly: a straight flight on a turning heading, looking down at a fixed pitch.
  const fly = (p0, p1, h0, h1, pitch, fov) => (u) => { const p = V3.mix(p0, p1, u), h = (mix(h0, h1, u) * Math.PI) / 180, q = (pitch * Math.PI) / 180; return { pos: p, at: [p[0] + 50 * Math.sin(h) * Math.cos(q), p[1] - 50 * Math.sin(q), p[2] - 50 * Math.cos(h) * Math.cos(q)], fov }; };
  const HAZE = { base: "gold", el: 17, night: 0, cloud: 0.5, fog: [0.0075, 0.045, 1.2], zen: [0.34, 0.36, 0.72], hor: [1.0, 0.68, 0.50], fogc: [1.0, 0.70, 0.52], exp: 0.9 };
  const WARM = { base: "day", el: 30, hor: [0.98, 0.74, 0.58], fogc: [0.97, 0.76, 0.60], fog: [0.0042, 0.04, 0.5], cloud: 0.42, zen: [0.07, 0.22, 0.70] };
  const CLEAR = { base: "day", cloud: 0.35 };
  SHOTS = [
    { dur: 75, sky: HAZE, az: 186, cam: around(P.coit, 40, 72, 45, 45, 27, 28, 26, 86) }, // Coit Tower, circled, the sun low behind the skyline
    { dur: 75, sky: WARM, az: 190, cam: around(P.sutro, 62, 62, 65, 61, 38, 38.5, 51, 84) }, // Sutro Tower over the sign, pushing in
    { dur: 83, sky: CLEAR, az: 120, live: true, cam: around(P.ferry, 125, 119, 58, 57, 17, 17, 17.5, 70, 8) }, // Ferry Building where the source has the Statue of Liberty
    { dur: 94, sky: CLEAR, az: 140, live: true, split: true, cam: fly([176, 55, 148], [168, 55, 205], 172, 190, 55, 60) }, // the source's split screen: grey model left, the build right
    { dur: 90, sky: CLEAR, az: 140, live: true, cam: line([150, 27, 232], [176, 26, 227], [250, 12, 214], [270, 12, 212], 62) }, // just above the rooftops
    { dur: 75, sky: "gold", az: 236, cam: line([233, 22, 121], [230, 22.6, 123], [203, 34, 137], null, 60) }, // a bridge tower, close
    { dur: 45, sky: "gold", az: 160, live: true, cam: orbit(P.palace, 52, 49, 41, 39, -128, -143, 16, 50) }, // Palace of Fine Arts
    { dur: 52, sky: "day", az: 248, dry: true, live: true, cam: line([P.alamo[0] - 0.5, ag + 1.3, P.alamo[1] + 5.5], [P.alamo[0] + 1.4, ag + 1.2, P.alamo[1] + 4.4], [P.alamo[0] + 22, ag + 3, P.alamo[1] - 1], null, 50) }, // Alamo Square, at corgi height
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
  if (card < 1) drawFrame(s.cam(u), light(s.sky, s.az), t, { prog: s.prog(u), noRefl: s.dry, live: s.live, split: s.split });
  $("bug").style.opacity = card ? 0 : 0.9;
  $("card").style.display = card ? "block" : "none"; $("card").style.opacity = card;
  return painted();
}
// Scouting: draw one camera under one sky. cam = [px,py,pz, ax,ay,az, fov, topDown], t in seconds.
window.debugCam = (c, sky = "day", az = 140, t = 0, prog, split) => { drawFrame({ pos: c.slice(0, 3), at: c.slice(3, 6), fov: c[6] || 50, up: c[7] ? [0, 0, -1] : [0, 1, 0] }, light(sky, az), t, { prog, live: true, split }); return painted(); };

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
