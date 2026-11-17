// ───────────────────────── San Francisco ─────────────────────────
// Where things go on the island, and how each landmark is stacked from
// blocks. Nothing here is surveyed: it is the city from memory, squeezed
// onto a hexagon, so the Golden Gate crosses the two lagoons.
const HILLS = [[303, 112, 15, 9], [250, 233, 24, 6], [122, 272, 30, 19], [118, 92, 30, 7], [128, 217, 22, 5]]; // x, z, radius, height
function districtOf(cx, cz) {
  if (cz < 104) return "marina";
  if (cx > 240 && ((cx - 300) / 62) ** 2 + ((cz - 205) / 70) ** 2 < 1) return "fidi";
  if (cz > 232 && cx > 164) return "soma";
  if (cx > 150 && cz > 200) return "mission";
  return "rows";
}

// ───────────── lettering: a 5 x 7 block font ─────────────
const FONT = { A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [15, 16, 16, 16, 16, 16, 15], D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16], G: [15, 16, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [7, 2, 2, 2, 2, 2, 7, 3], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17], Y: [17, 17, 10, 4, 4, 4, 4], 3: [30, 1, 1, 14, 1, 1, 30], 9: [14, 17, 17, 15, 1, 1, 14], " ": [0, 0, 0, 0, 0, 0, 0, 1] };
const glyphW = (ch) => FONT[ch][7] || 5;
const textWidth = (s) => [...s].reduce((n, ch) => n + glyphW(ch) + 1, -1);
// Letters on a wall whose outward normal is (nx, nz), centred on (cx, cz), bottom row at y.
function faceText(s, cx, y, cz, nx, nz, m) {
  const ax = nz, az = -nx, w = textWidth(s); let k = -(w - 1) / 2;
  for (const ch of s) { const g = FONT[ch], gw = glyphW(ch);
    for (let c = 0; c < gw; c++) for (let r = 0; r < 7; r++) if ((g[r] >> (gw - 1 - c)) & 1) setv(Math.round(cx + ax * (k + c)), y + 6 - r, Math.round(cz + az * (k + c)), m);
    k += gw + 1; }
}
const ring = (cx, y, cz, r0, r1, m, ok) => { const c = Math.ceil(r1); for (let dz = -c; dz <= c; dz++) for (let dx = -c; dx <= c; dx++) { const q = Math.hypot(dx, dz); if (q >= r0 && q <= r1 && (!ok || ok(Math.atan2(dz, dx), q))) setv(cx + dx, y, cz + dz, m); } };
const shoreX = (z, from) => { let x = from; while (x < W - 1 && world.kind[z * W + x] !== 1) x++; return x; }; // first sea column east of `from`

function planLandmarks({ reserve, reserveDisc, L1, L2 }) {
  const P = {};
  const zc = 137; // the bridge runs along a street
  P.bridge = { z: zc, y: SEA + 12, top: SEA + 41, x0: L1.x0 - 24, x1: L2.x1 + 24, towers: [L1.x0 + 5, L2.x1 - 5] };
  reserve(P.bridge.x0 - 24, zc - 6, L1.x0 - 1, zc + 6, LOT_LAWN); reserve(L2.x1 + 1, zc - 6, P.bridge.x1 + 24, zc + 6, LOT_LAWN);
  reserve(L1.x1 + 1, zc - 7, L2.x0 - 1, zc + 7, LOT_LAWN);
  P.palace = [Math.round((L1.x0 + L1.x1) / 2), L1.z0 - 17]; P.palaceY = reserve(P.palace[0] - 30, 58, P.palace[0] + 30, L1.z0 - 2, LOT_LAWN, SEA + 2);
  P.coit = [303, 112]; reserveDisc(303, 112, 13, LOT_PARK);
  P.transamerica = [300, 153]; P.transY = reserve(286, 140, 314, 166, LOT_PLAZA, "median");
  P.salesforce = [298, 217]; P.salesY = reserve(282, 204, 314, 230, LOT_PLAZA, "median");
  P.ferry = [335, 184]; P.ferryY = reserve(322, 160, 350, 207, LOT_PLAZA, SEA + 2);
  P.nvidia = [222, 249]; P.nvidiaY = reserve(206, 236, 238, 262, LOT_PLAZA, "median");
  P.yc = [222, 281]; P.ycY = reserve(206, 268, 238, 294, LOT_PLAZA, "median");
  P.site = [184, 281]; P.siteY = reserve(168, 268, 200, 294, LOT_PLAZA, "median");
  P.boards = [260, 281]; P.boardsY = reserve(244, 268, 276, 294, LOT_ROAD, "median");
  P.park = [54, 172, 162, 198]; reserve(...P.park, LOT_PARK); // Golden Gate Park
  reserveDisc(118, 92, 30, LOT_FOREST); // the Presidio
  P.sutro = [122, 272]; reserveDisc(122, 272, 24, LOT_LAWN); // Twin Peaks
  P.sign = [138, 271]; reserve(133, 246, 144, 296, LOT_LAWN);
  P.alamo = [146, 217]; reserve(130, 204, 162, 230, LOT_LAWN);
  P.ladies = [168, 206]; P.ladiesY = reserve(168, 204, 200, 230, LOT_PARK, "median");
  P.pier39 = [shoreX(76, 270), 76]; reserve(P.pier39[0] - 16, 68, P.pier39[0], 84, LOT_PLAZA, SEA + 2);
  P.beach = [70, 226];
  return P;
}

function buildLandmarks(P) {
  goldenGate(P.bridge); place("Golden Gate Bridge", 240, P.bridge.z, 44);
  palace(P.palace[0], P.palace[1], P.palaceY); place("Palace of Fine Arts", P.palace[0], P.palace[1], 34);
  salesforce(P.salesforce[0], P.salesforce[1], P.salesY); place("Salesforce Tower", P.salesforce[0], P.salesforce[1], 24);
  transamerica(P.transamerica[0], P.transamerica[1], P.transY); place("Transamerica Pyramid", P.transamerica[0], P.transamerica[1], 22);
  coit(P.coit[0], P.coit[1]); place("Coit Tower", P.coit[0], P.coit[1], 20);
  sutro(P.sutro[0], P.sutro[1]); place("Sutro Tower", P.sutro[0], P.sutro[1], 30);
  hillSign("REASON", P.sign[0], P.sign[1]);
  ferry(P.ferry[0], P.ferry[1], P.ferryY); place("Ferry Building", P.ferry[0], P.ferry[1], 30);
  world.piers = []; for (const z of [146, 158, 208, 220, 232]) pier(z);
  pier39(P.pier39[0], P.pier39[1]); place("Pier 39", P.pier39[0] + 10, P.pier39[1], 26);
  ladies(P.ladies[0], P.ladies[1], P.ladiesY); place("Painted Ladies", P.ladies[0], P.ladies[1] + 12, 24); place("Alamo Square", P.alamo[0], P.alamo[1], 18);
  nvidia(P.nvidia[0], P.nvidia[1], P.nvidiaY); place("NVIDIA", P.nvidia[0], P.nvidia[1], 22);
  ycombinator(P.yc[0], P.yc[1], P.ycY); place("Y Combinator", P.yc[0], P.yc[1], 18);
  boards(P.boards[0], P.boards[1], P.boardsY);
  site(P.site[0], P.site[1], P.siteY); place("another AI lab going up", P.site[0], P.site[1], 18);
  windmill(74, 185); place("Golden Gate Park", 108, 185, 46);
  place("Ocean Beach", P.beach[0], P.beach[1], 44); place("the Presidio", 118, 92, 30); place("the Marina", 250, 72, 40);
  place("Financial District", 300, 190, 40); place("SoMa", 190, 250, 30); place("the Sunset", 100, 230, 40); place("the Richmond", 110, 140, 40); place("Nob Hill", 250, 233, 18);
  world.plan = P;
}

// ───────────── Golden Gate Bridge ─────────────
function goldenGate({ z: zc, y: dy, top, x0: xa, x1: xb, towers }) {
  world.deck = new Int16Array(W); // height of the road, for the traffic
  const deck = (x, y) => { world.deck[x] = y; for (let z = zc - 4; z <= zc + 4; z++) { const a = Math.abs(z - zc); for (let yy = y + 1; yy < y + 10; yy++) setv(x, yy, z, 0); setv(x, y, z, a <= 2 ? DECK : a === 3 ? PAVE : IORANGE); if (a === 4) setv(x, y + 1, z, IORANGE); } };
  // approaches: embankments from the deck down to the street at both ends
  for (const [from, dir] of [[xa - 1, -1], [xb + 1, 1]]) for (let k = 0; k < 60; k++) {
    const x = from + dir * k, y = dy - Math.floor((k + 1) / 2);
    if (y < ground(x, zc)) break;
    for (let z = zc - 4; z <= zc + 4; z++) for (let yy = ground(x, z); yy < y; yy++) setv(x, yy, z, CONCRETE);
    deck(x, y);
  }
  for (let x = xa; x <= xb; x++) {
    deck(x, dy);
    for (const z of [zc - 4, zc + 4]) { setv(x, dy - 3, z, IORANGE); if (x % 2 === 0) { setv(x, dy - 1, z, IORANGE); setv(x, dy - 2, z, IORANGE); } else setv(x, dy - 1, z, IORANGE); }
    if ((x - xa) % 4 === 0) for (let z = zc - 3; z <= zc + 3; z++) setv(x, dy - 1, z, IORANGE);
  }
  for (const tx of towers) {
    box(tx - 4, SEA - 1, zc - 8, tx + 4, SEA + 1, zc + 8, CONCRETE);
    for (const s of [-1, 1]) for (let y = SEA + 2; y <= top; y++) {
      const wx = y < dy + 13 ? 2 : 1, zl = zc + s * 4;
      box(tx - wx, y, Math.min(zl, zl + s * (y < dy ? 2 : 1)), tx + wx, y, Math.max(zl, zl + s * (y < dy ? 2 : 1)), IORANGE);
    }
    for (const [y0, y1] of [[SEA + 4, SEA + 4], [dy - 5, dy - 4], [dy + 11, dy + 12], [dy + 19, dy + 20], [top - 2, top]]) box(tx - 1, y0, zc - 3, tx + 1, y1, zc + 3, IORANGE);
    for (const s of [-1, 1]) { setv(tx, top + 1, zc + s * 4, IORANGE); setv(tx, top + 2, zc + s * 4, LIGHT); }
  }
  // main cables: a parabola between the towers, a curve down to each anchorage
  const [t0, t1] = towers, mid = (t0 + t1) / 2, half = (t1 - t0) / 2, sag = dy + 3;
  const cy = (x) => x <= t0 ? Math.round(dy + 1 + (top - dy - 1) * Math.pow(clamp((x - xa) / (t0 - xa), 0, 1), 1.5))
    : x >= t1 ? Math.round(dy + 1 + (top - dy - 1) * Math.pow(clamp((xb - x) / (xb - t1), 0, 1), 1.5))
    : Math.round(sag + (top - sag) * ((x - mid) / half) ** 2);
  for (let x = xa; x <= xb; x++) {
    const a = cy(x), lower = Math.min(cy(x - 1), cy(x + 1)), lo = Math.min(a, lower + 1);
    for (const z of [zc - 4, zc + 4]) { for (let y = lo; y <= a; y++) setv(x, y, z, IORANGE); if ((x - t0) % 4 === 0 && Math.abs(x - t0) > 1 && Math.abs(x - t1) > 1) for (let y = dy + 2; y < lo; y++) setv(x, y, z, IORANGE); }
  }
}

// ───────────── Palace of Fine Arts ─────────────
function palace(cx, cz, g) {
  const piers = []; for (let k = 0; k < 8; k++) piers.push(((k * 45 + 22.5) * Math.PI) / 180);
  const near = (a) => Math.min(...piers.map((p) => Math.abs(Math.atan2(Math.sin(a - p), Math.cos(a - p))))) * 8;
  for (const a of piers) { const x = Math.round(cx + 8 * Math.cos(a)), z = Math.round(cz + 8 * Math.sin(a)); box(x - 1, g, z - 1, x + 1, g + 11, z + 1, PALACE); box(x - 2, g, z - 2, x + 2, g, z + 2, PALACE); }
  ring(cx, g + 9, cz, 6.8, 9.3, PALACE, (a) => near(a) < 2.2); ring(cx, g + 10, cz, 6.8, 9.3, PALACE, (a) => near(a) < 2.8); ring(cx, g + 11, cz, 6.8, 9.3, PALACE);
  for (let y = g + 12; y <= g + 14; y++) ring(cx, y, cz, 6.3, 9.8, PALACE);
  ring(cx, g + 15, cz, 5.8, 10.4, PALACE);
  ring(cx, g + 16, cz, 6, 9.2, PALACE); ring(cx, g + 17, cz, 6, 9.2, PALACE);
  const R = 8.8; for (let dy = 0; dy <= 8; dy++) { const rr = Math.sqrt(R * R - dy * dy); ring(cx, g + 18 + dy, cz, Math.max(0, rr - 1.7), rr, DOME); }
  ring(cx, g + 26, cz, 0, 2.6, DOME); setv(cx, g + 27, cz, PALACE);
  // the colonnade curving round the back
  const R2 = 24, inArc = (a) => a < (-22 * Math.PI) / 180 && a > (-158 * Math.PI) / 180;
  for (let d = -158; d <= -22; d += 8.5) { const a = (d * Math.PI) / 180, x = Math.round(cx + R2 * Math.cos(a)), z = Math.round(cz + R2 * Math.sin(a)); box(x, g, z, x + 1, g + 9, z + 1, PALACE); }
  ring(cx, g + 10, cz, R2 - 1.2, R2 + 2.4, PALACE, inArc); ring(cx, g + 11, cz, R2 - 1.6, R2 + 2.8, PALACE, inArc);
  for (const d of [-158, -22]) { const a = (d * Math.PI) / 180, x = Math.round(cx + R2 * Math.cos(a)), z = Math.round(cz + R2 * Math.sin(a)); box(x - 2, g, z - 2, x + 2, g + 13, z + 2, PALACE); box(x - 1, g + 14, z - 1, x + 1, g + 15, z + 1, DOME); }
  world.swans = [cx, world.lagoons[0].z0 + 12];
}

// ───────────── towers ─────────────
function salesforce(cx, cz, y0) {
  const HH = 88;
  for (let y = 0; y < HH; y++) {
    const t = y / HH, half = t < 0.5 ? 7.45 : 7.45 - Math.pow((t - 0.5) / 0.5, 1.7) * 3.3, crown = y >= HH - 10, c = Math.ceil(half);
    for (let dz = -c; dz <= c; dz++) for (let dx = -c; dx <= c; dx++) {
      if (Math.abs(dx / half) ** 4 + Math.abs(dz / half) ** 4 > 1) continue;
      if (!crown) { setv(cx + dx, y0 + y, cz + dz, SALESF); continue; }
      const inner = half - 1.05; if (Math.abs(dx / inner) ** 4 + Math.abs(dz / inner) ** 4 <= 1) { if (y === HH - 10) setv(cx + dx, y0 + y, cz + dz, CONCRETE); continue; }
      if (y % 3 === 0 || (dx + dz + 64) % 2 === 0) setv(cx + dx, y0 + y, cz + dz, CROWN); // the open lattice at the top
    }
  }
  for (const [dx, dz] of [[-12, -10], [12, -10], [-12, 10], [12, 10]]) palm(cx + dx, y0, cz + dz, rng(dx * 7 + dz));
}
function transamerica(cx, cz, y0) {
  const HH = 66;
  for (let y = 0; y < HH; y++) { const half = Math.floor(9.4 * (1 - y / HH)); box(cx - half, y0 + y, cz - half, cx + half, y0 + y, cz + half, TRANS); }
  box(cx - 5, y0 + 28, cz - 1, cx + 5, y0 + 49, cz + 1, TRANS); // the two wings
  for (let y = HH; y < HH + 9; y++) setv(cx, y0 + y, cz, y === HH + 8 ? LIGHT : TRANS);
  for (const [dx, dz] of [[-12, -11], [12, -11], [-12, 11], [12, 11]]) tree(cx + dx, y0, cz + dz, rng(dx * 3 + dz), false);
}
function coit(cx, cz) {
  const g = ground(cx, cz);
  for (let y = g - 4; y <= g; y++) ring(cx, y, cz, 0, 5.2, CONCRETE);
  for (let y = g + 1; y <= g + 19; y++) ring(cx, y, cz, 0, 2.7, COIT);
  for (let y = g + 20; y <= g + 22; y++) ring(cx, y, cz, 2.0, 3.5, COIT, (a) => y === g + 22 || Math.cos(a * 6) < 0.2);
  ring(cx, g + 23, cz, 2.0, 3.5, COIT);
}
function sutro(cx, cz) {
  const g = ground(cx, cz), band = (y) => (Math.floor(y / 6) % 2 ? SUTRO_W : SUTRO_R);
  const leg = (k, y) => { const a = ((90 + 120 * k) * Math.PI) / 180, r = y < 24 ? 8 - (5 * y) / 24 : 3; return [Math.round(cx + r * Math.cos(a)), Math.round(cz + r * Math.sin(a))]; };
  for (let k = 0; k < 3; k++) for (let y = 0; y < 62; y++) { const [x, z] = leg(k, y); if (y < 24) box(x, g + y, z, x + 1, g + y, z + 1, band(y)); else if (y < 50) setv(x, g + y, z, band(y)); else setv(x, g + y, z, Math.floor(y / 3) % 2 ? SUTRO_W : SUTRO_R); }
  for (const y of [24, 36, 48]) for (let k = 0; k < 3; k++) { const a = leg(k, y), b = leg((k + 1) % 3, y); for (let s = 0; s <= 12; s++) { const x = Math.round(mix(a[0], b[0], s / 12)), z = Math.round(mix(a[1], b[1], s / 12)); setv(x, g + y, z, SUTRO_R); if (y === 48) setv(x, g + y + 1, z, SUTRO_W); } }
  for (let k = 0; k < 3; k++) { const [x, z] = leg(k, 61); setv(x, g + 62, z, LIGHT); }
}
// Tall white letters on stilts, climbing the slope, read from the east.
function hillSign(s, x, zmid) {
  const step = 7; let z = zmid + Math.floor((s.length * step) / 2) - 3;
  for (const ch of s) { let y = 0; for (let k = -2; k <= 2; k++) y = Math.max(y, ground(x, z + k)); for (const k of [-1, 1]) for (let yy = ground(x - 1, z + k); yy <= y + 5; yy++) setv(x - 1, yy, z + k, PILE); faceText(ch, x, y + 3, z, 1, 0, SIGN_WHITE); z -= step; }
}

// ───────────── the waterfront ─────────────
function ferry(cx, cz, g) {
  box(cx - 3, g, cz - 21, cx + 4, g + 5, cz + 21, FERRY);
  for (let z = cz - 20; z <= cz + 20; z += 3) { setv(cx - 3, g, z, 0); setv(cx - 3, g + 1, z, 0); } // the arcade
  box(cx - 3, g + 6, cz - 3, cx + 3, g + 25, cz + 3, COIT);
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let a = -1; a <= 1; a++) for (let y = g + 21; y <= g + 23; y++) setv(cx + nx * 3 + nz * a, y, cz + nz * 3 + nx * a, a === 0 && y === g + 22 ? BLACK : CLOCK);
  box(cx - 2, g + 26, cz - 2, cx + 2, g + 28, cz + 2, COIT); box(cx - 1, g + 29, cz - 1, cx + 1, g + 31, cz + 1, COIT);
  for (let y = g + 32; y <= g + 36; y++) setv(cx, y, cz, y === g + 36 ? LIGHT : COIT);
  for (let z = cz - 22; z <= cz + 22; z += 6) if (!world.kind[z * W + cx - 9] && Math.abs(z - cz) > 3) palm(cx - 9, ground(cx - 9, z), z, rng(z));
  // a ferry at the dock
  const fx = shoreX(cz, cx) + 4;
  box(fx, SEA, cz - 2, fx + 15, SEA + 1, cz + 2, HULL); box(fx, SEA, cz - 2, fx + 15, SEA, cz + 2, HULL_B);
  box(fx + 2, SEA + 2, cz - 1, fx + 12, SEA + 3, cz + 1, B_WHITE); box(fx + 6, SEA + 4, cz, fx + 7, SEA + 5, cz, HULL_B);
}
function pier(zc) {
  const xs = shoreX(zc, 300), len = 22;
  box(xs - 4, SEA + 1, zc - 3, xs + len, SEA + 1, zc + 3, PLANK);
  for (let x = xs + 1; x <= xs + len; x += 4) for (const z of [zc - 3, zc + 3]) box(x, SEA - 1, z, x, SEA, z, PILE);
  box(xs + 1, SEA + 2, zc - 2, xs + len - 3, SEA + 4, zc + 2, SHED);
  box(xs + 1, SEA + 5, zc - 2, xs + len - 3, SEA + 5, zc + 2, SHED_ROOF); box(xs + 1, SEA + 6, zc - 1, xs + len - 3, SEA + 6, zc + 1, SHED_ROOF);
  for (let z = zc - 2; z <= zc + 2; z++) { setv(xs + 1, SEA + 5, z, TRIM); if (Math.abs(z - zc) <= 1) setv(xs + 1, SEA + 6, z, TRIM); }
  setv(xs + 1, SEA + 7, zc, TRIM); setv(xs + 1, SEA + 2, zc, BLACK); setv(xs + 1, SEA + 3, zc, BLACK);
  world.piers.push([xs, zc, len]);
}
function pier39(xs, zc) {
  const len = 30;
  box(xs - 4, SEA + 1, zc - 5, xs + len, SEA + 1, zc + 5, PLANK);
  for (let x = xs + 1; x <= xs + len; x += 4) for (const z of [zc - 5, zc + 5]) box(x, SEA - 1, z, x, SEA, z, PILE);
  const r = rng(39);
  for (let x = xs + 2; x + 3 <= xs + len - 2; x += 4) for (const s of [-1, 1]) {
    const z0 = zc + s * 4, m = PASTELS[Math.floor(r() * PASTELS.length)], h = 2 + Math.floor(r() * 2);
    box(x, SEA + 2, Math.min(z0, z0 - s), x + 2, SEA + 1 + h, Math.max(z0, z0 - s), m); box(x, SEA + 2 + h, Math.min(z0, z0 - s), x + 2, SEA + 2 + h, Math.max(z0, z0 - s), SHINGLE);
  }
  for (let y = SEA + 2; y <= SEA + 7; y++) { setv(xs - 3, y, zc - 3, TRIM); setv(xs - 3, y, zc + 3, TRIM); } // the gate
  for (let z = zc - 3; z <= zc + 3; z++) { setv(xs - 3, SEA + 7, z, HULL_B); setv(xs - 3, SEA + 8, z, Math.abs(z - zc) < 3 ? HULL_B : 0); }
  setv(xs - 3, SEA + 9, zc, LIGHT);
  // the floating docks the sea lions took over
  world.rafts = [];
  for (let k = 0; k < 4; k++) { const x = xs + 5 + k * 7, z = zc - 13 - (k % 2) * 5; box(x, SEA, z, x + 4, SEA, z + 2, PLANK); world.rafts.push([x + 2.5, z + 1.5]); }
}

// ───────────── houses ─────────────
function ladies(x, z, g) {
  const cols = [1, 2, 0, 3, 4, 5];
  for (let k = 0; k < 6; k++) {
    const z0 = z + k * 4, m = PASTELS[cols[k]];
    box(x, g, z0, x + 7, g + 5, z0 + 3, m);
    box(x, g + 6, z0, x + 7, g + 6, z0 + 3, SHINGLE); box(x, g + 7, z0 + 1, x + 7, g + 7, z0 + 2, SHINGLE);
    for (let zz = z0; zz <= z0 + 3; zz++) setv(x, g + 6, zz, m);
    setv(x, g + 7, z0 + 1, TRIM); setv(x, g + 7, z0 + 2, TRIM);
    box(x - 1, g + 1, z0 + 2, x - 1, g + 4, z0 + 3, m); box(x - 1, g + 5, z0 + 2, x - 1, g + 5, z0 + 3, TRIM); // the bay
    setv(x - 1, g, z0, STEP); setv(x - 2, g, z0, STEP); setv(x, g, z0, BLACK); setv(x, g + 1, z0, BLACK); // steps up to the door
    for (let y = g; y <= g + 5; y++) setv(x, y, z0 + 1, TRIM);
  }
}

// ───────────── the tech scene ─────────────
function nvidia(cx, cz, g) {
  box(cx - 16, g, cz - 6, cx + 15, g + 7, cz + 7, B_DARK); box(cx - 16, g + 8, cz - 6, cx + 15, g + 18, cz + 7, NV_GREEN);
  faceText("NVIDIA", cx - 0.5, g + 10, cz + 7, 0, 1, SIGN_WHITE); faceText("NVIDIA", cx - 0.5, g + 10, cz - 6, 0, -1, SIGN_WHITE);
  for (const dx of [-14, -7, 7, 14]) palm(cx + dx, g, cz - 10, rng(dx + 50));
}
function ycombinator(cx, cz, g) {
  box(cx - 6, g, cz - 6, cx + 5, g + 11, cz + 5, YC_ORANGE);
  faceText("Y", cx - 0.5, g + 3, cz + 5, 0, 1, SIGN_WHITE); faceText("Y", cx - 0.5, g + 3, cz - 6, 0, -1, SIGN_WHITE);
  faceText("Y", cx + 5, g + 3, cz - 0.5, 1, 0, SIGN_WHITE); faceText("Y", cx - 6, g + 3, cz - 0.5, -1, 0, SIGN_WHITE);
  for (const [dx, dz] of [[-12, 10], [11, 10]]) palm(cx + dx, g, cz + dz, rng(dx * 5 + dz + 9));
}
// Billboards facing south, over a lot of parked robotaxis.
function boards(cx, cz, g) {
  const board = (s, z, lift, bg, fg) => { const w = textWidth(s) + 2, x0 = Math.round(cx - w / 2), x1 = x0 + w - 1;
    for (const x of [x0 + 2, x1 - 2]) box(x, g, z - 1, x, g + lift - 1, z - 1, CONCRETE);
    box(x0, g + lift, z - 1, x1, g + lift + 8, z, bg); faceText(s, (x0 + x1) / 2, g + lift + 1, z, 0, 1, fg); };
  board("AI AI AI", cz - 6, 14, SIGN_BLACK, SIGN_WHITE);
  board("GPUS", cz + 6, 4, TRIM, SIGN_BLACK);
  for (let k = 0; k < 7; k++) { const x = cx - 14 + k * 4; box(x, g, cz - 2, x + 1, g, cz, CAR_W); setv(x, g + 1, cz - 1, CAR_GLASS); setv(x + 1, g + 1, cz - 1, CAR_GLASS); setv(x, g + 2, cz - 1, BLACK); }
}
// A tower that is still going up. Its blocks are kept apart so they can be shown one at a time.
function site(cx, cz, g) {
  const b = { x: cx - 6, z: cz - 6, y: g, w: 12, d: 12, h: 38, mat: SITE }, list = [];
  for (let y = 0; y < b.h; y++) for (let z = 0; z < b.d; z++) for (let x = 0; x < b.w; x++) list.push(b.x + x, b.y + y, b.z + z);
  b.blocksList = list; b.n = list.length / 3; b.top = g + b.h;
  const kx = b.x + b.w + 1, kz = cz, top = b.top + 7;
  for (let y = g; y < top; y++) setv(kx, y, kz, CRANE);
  for (let k = -4; k <= b.w + 3; k++) setv(kx - k, top, kz, CRANE);
  setv(kx, top + 1, kz, CRANE); setv(kx + 4, top - 1, kz, STONE); setv(kx + 4, top - 2, kz, STONE);
  world.site = b;
}
function windmill(cx, cz) {
  const g = ground(cx, cz);
  for (let y = 0; y < 11; y++) { const h = y < 4 ? 2 : y < 8 ? 1 : 1; box(cx - h, g + y, cz - h, cx + h, g + y, cz + h, y < 8 ? PLANK : SHINGLE); }
  setv(cx, g + 11, cz, SHINGLE);
  for (let k = 1; k <= 6; k++) for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) setv(cx - 3, g + 9 + a * k, cz + b * k, TRIM);
  setv(cx - 2, g + 9, cz, TRUNK); setv(cx - 3, g + 9, cz, TRUNK);
}
