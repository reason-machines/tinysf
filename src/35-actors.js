// ───────────────────────── things that move ─────────────────────────
// Corgis, gulls, sea lions, cable cars, robotaxis and boats. Each is a few
// boxes placed again every frame from the time alone, so the film and the
// walkable world show the same thing at the same second.
const TAU = Math.PI * 2, ACTOR_MAX = 7000; // boxes
const actors = { pos: new Float32Array(ACTOR_MAX * 72), nrm: new Float32Array(ACTOR_MAX * 72), info: new Uint8Array(ACTOR_MAX * 96), n: 0, list: [], extra: [], corgis: [] };

// A frame is a place and three axes: X forward, Y up, Z to the right.
function frame(x, y, z, yaw, s = 1, pitch = 0, roll = 0) {
  const c = Math.cos(yaw), n = Math.sin(yaw);
  let X = [c, 0, n], Y = [0, 1, 0], Z = [-n, 0, c];
  if (pitch) { const cp = Math.cos(pitch), sp = Math.sin(pitch), X2 = V3.add(V3.mul(X, cp), V3.mul(Y, sp)); Y = V3.add(V3.mul(X, -sp), V3.mul(Y, cp)); X = X2; }
  if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll), Y2 = V3.add(V3.mul(Y, cr), V3.mul(Z, sr)); Z = V3.add(V3.mul(Y, -sr), V3.mul(Z, cr)); Y = Y2; }
  return { o: [x, y, z], X, Y, Z, s };
}
const at = (f, lx, ly, lz) => [f.o[0] + (f.X[0] * lx + f.Y[0] * ly + f.Z[0] * lz) * f.s, f.o[1] + (f.X[1] * lx + f.Y[1] * ly + f.Z[1] * lz) * f.s, f.o[2] + (f.X[2] * lx + f.Y[2] * ly + f.Z[2] * lz) * f.s];
// A frame hinged at a point of another, rolled about its forward axis (a wing).
function hinge(f, lx, ly, lz, roll) {
  const cr = Math.cos(roll), sr = Math.sin(roll);
  return { o: at(f, lx, ly, lz), X: f.X, Y: V3.add(V3.mul(f.Y, cr), V3.mul(f.Z, sr)), Z: V3.add(V3.mul(f.Y, -sr), V3.mul(f.Z, cr)), s: f.s };
}
// One box: centre and size in the frame's own units.
function cube(f, lx, ly, lz, sx, sy, sz, mat) {
  if (actors.n >= ACTOR_MAX) return;
  const c = at(f, lx, ly, lz), ax = [f.X, f.Y, f.Z], hs = [(sx * f.s) / 2, (sy * f.s) / 2, (sz * f.s) / 2];
  let p = actors.n * 72, q = actors.n * 96;
  for (let k = 0; k < 6; k++) {
    const d = k >> 1, sg = k & 1 ? -1 : 1, u = sg > 0 ? (d + 1) % 3 : (d + 2) % 3, v = sg > 0 ? (d + 2) % 3 : (d + 1) % 3, n = ax[d];
    for (const [cu, cv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let i = 0; i < 3; i++) { actors.pos[p] = c[i] + n[i] * sg * hs[d] + ax[u][i] * cu * hs[u] + ax[v][i] * cv * hs[v]; actors.nrm[p++] = n[i] * sg; }
      actors.info[q++] = 0; actors.info[q++] = mat; actors.info[q++] = 3; actors.info[q++] = 2;
    }
  }
  actors.n++;
}
// Ground height under a point, smoothed between columns so wheels and paws do not step.
function groundF(x, z) {
  const fx = x - 0.5, fz = z - 0.5, x0 = Math.floor(fx), z0 = Math.floor(fz), u = fx - x0, v = fz - z0;
  const g = (X, Z) => world.hgt[clamp(Z, 0, D - 1) * W + clamp(X, 0, W - 1)];
  return mix(mix(g(x0, z0), g(x0 + 1, z0), u), mix(g(x0, z0 + 1), g(x0 + 1, z0 + 1), u), v);
}

// ───────────── models ─────────────
function drawCorgi(x, z, yaw, t, o) { // o.fur and o.belly make it another dog
  const F1 = o.fur || FUR, F2 = o.belly || FUR_W;
  const run = o.run, ph = t * 13 + o.ph, y = groundF(x, z);
  if (o.sit) {
    const f = frame(x, y, z, yaw, 0.15), b = frame(x, y + 0.15 * 0.6, z, yaw, 0.15, 0.62), tilt = Math.sin(t * 1.3 + o.ph) * 0.25;
    cube(f, 2.3, 1.6, 1.1, 1.1, 3.2, 1.1, F2); cube(f, 2.3, 1.6, -1.1, 1.1, 3.2, 1.1, F2);
    cube(f, -0.6, 0.6, 1.5, 2.6, 1.2, 1.1, F2); cube(f, -0.6, 0.6, -1.5, 2.6, 1.2, 1.1, F2);
    cube(b, 0.4, 2.2, 0, 6.4, 3.2, 3.4, F1); cube(b, 3.2, 1.9, 0, 1.2, 2.6, 2.6, F2);
    cube(f, -3.2, 0.9, Math.sin(t * 9 + o.ph) * 0.7, 1, 1, 1, F2);
    corgiHead(frame(...at(f, 2.7, 5.6, 0), yaw + tilt, 0.15), t, o, true);
    return;
  }
  const bob = Math.abs(Math.sin(ph)) * 0.5 * run, f = frame(x, y + bob * 0.15, z, yaw + Math.sin(ph) * 0.07 * run, 0.15);
  for (const [lx, lz, k] of [[2.4, 1.1, 0], [2.4, -1.1, 1], [-2.6, 1.1, 1], [-2.6, -1.1, 0]]) {
    const a = ph + k * Math.PI;
    cube(f, lx + Math.sin(a) * 1.3 * run, 0.8 + Math.max(0, Math.cos(a)) * 0.7 * run - bob, lz, 1.1, 1.6, 1.1, F2);
  }
  cube(f, 0, 3.1, 0, 7.2, 3.1, 3.4, F1); cube(f, 3.3, 2.7, 0, 1.2, 2.6, 2.7, F2); cube(f, 0, 1.75, 0, 5, 0.5, 2.4, F2);
  cube(f, -4, 3.9 + Math.sin(t * 16 + o.ph) * 0.3, Math.sin(t * 16 + o.ph) * 0.6, 1, 1.1, 1.1, F2);
  corgiHead(frame(...at(f, 3.6, 4.4, 0), yaw + Math.sin(ph) * 0.07 * run, 0.15), t, o, run > 0.5);
}
function corgiHead(h, t, o, pant) {
  const F1 = o.fur || FUR, F2 = o.belly || FUR_W;
  cube(h, 1, 1.5, 0, 3, 3, 3.3, F1); cube(h, 2.9, 0.9, 0, 1.7, 1.5, 1.7, F2); cube(h, 2.56, 2.2, 0, 0.3, 1.7, 0.8, F2);
  cube(h, 3.85, 1.35, 0, 0.5, 0.7, 0.8, BLACK); cube(h, 2.56, 2.15, 1.0, 0.25, 0.65, 0.65, BLACK); cube(h, 2.56, 2.15, -1.0, 0.25, 0.65, 0.65, BLACK);
  cube(h, 0.5, 3.9, 1.15, 0.9, 2, 1, F1); cube(h, 0.5, 3.9, -1.15, 0.9, 2, 1, F1); cube(h, 0.98, 3.8, 1.15, 0.2, 1.3, 0.5, TONGUE); cube(h, 0.98, 3.8, -1.15, 0.2, 1.3, 0.5, TONGUE);
  if (pant) cube(h, 3.2, -0.1 - Math.abs(Math.sin(t * 7 + o.ph)) * 0.25, 0, 0.9, 0.5, 0.7, TONGUE);
}
function drawBird(x, y, z, yaw, t, ph, body, wing, s = 0.14, bank = 0) {
  const glide = smooth(0.2, 0.8, Math.sin(t * 0.7 + ph * 3) * 0.5 + 0.5), flap = Math.sin(t * 9 + ph) * 0.75 * (1 - glide * 0.85) + 0.12;
  const f = frame(x, y, z, yaw, s, 0, bank);
  cube(f, 0, 0, 0, 5, 1.6, 1.8, body); cube(f, 2.9, 0.5, 0, 1.5, 1.4, 1.4, body); cube(f, 4, 0.3, 0, 1, 0.4, 0.5, BEAK); cube(f, -3.1, 0.1, 0, 1.6, 0.5, 1.5, wing);
  for (const sd of [1, -1]) {
    const w = hinge(f, 0.2, 0.5, sd * 0.8, -sd * flap), w2 = hinge(w, 0, 0, sd * 3.6, -sd * flap * 0.9);
    cube(w, 0, 0, sd * 1.8, 2.4, 0.4, 3.6, wing); cube(w2, -0.2, 0, sd * 1.5, 1.9, 0.35, 3, wing); cube(w2, -0.3, 0, sd * 3.4, 1.3, 0.3, 0.9, BLACK);
  }
}
function drawSeaLion(x, y, z, yaw, t, ph) {
  const f = frame(x, y, z, yaw, 0.19), up = 0.5 + 0.5 * Math.sin(t * 0.9 + ph), bark = up > 0.8 ? Math.abs(Math.sin(t * 9 + ph)) * 0.5 : 0;
  cube(f, -0.6, 1.1, 0, 6.2, 2.2, 2.6, SEALION); cube(f, -4.4, 0.6, 0, 1.8, 1.1, 2.9, SEALION);
  cube(f, 2.4, 2.2 + up * 0.8, 0, 2, 3 + up, 2, SEALION); cube(f, 3.3, 4.3 + up * 1.4 + bark, 0, 2.2, 1.6, 1.7, SEALION); cube(f, 4.6, 4.1 + up * 1.4 + bark, 0, 0.5, 0.6, 0.7, BLACK);
  cube(f, 1.4, 0.3, 1.9, 1.6, 0.5, 1.5, SEALION); cube(f, 1.4, 0.3, -1.9, 1.6, 0.5, 1.5, SEALION);
}
function drawCar(x, y, z, yaw, body, robot) {
  const f = frame(x, y, z, yaw, 1);
  cube(f, 0, 0.62, 0, 3.4, 0.75, 1.7, body); cube(f, -0.1, 1.28, 0, 1.9, 0.6, 1.5, CAR_GLASS); cube(f, -0.1, 1.61, 0, 1.7, 0.08, 1.4, body);
  for (const lx of [1.05, -1.05]) for (const lz of [0.8, -0.8]) cube(f, lx, 0.3, lz, 0.6, 0.6, 0.25, BLACK);
  if (robot) { cube(f, -0.1, 1.82, 0, 0.5, 0.36, 0.5, BLACK); cube(f, 1.55, 0.9, 0.75, 0.2, 0.25, 0.25, BLACK); cube(f, 1.55, 0.9, -0.75, 0.2, 0.25, 0.25, BLACK); }
}
function drawCableCar(x, y, z, yaw) {
  const f = frame(x, y, z, yaw, 1);
  cube(f, 0, 0.85, 0, 7, 1.1, 2.3, CABLE_R); cube(f, 0, 0.25, 0, 5.4, 0.3, 1.6, BLACK);
  cube(f, 0, 1.95, 0, 3, 1.1, 2.2, CABLE_C); cube(f, 0, 1.95, 0, 2.6, 0.7, 2.26, CAR_GLASS);
  for (const lx of [-3.3, -1.6, 1.6, 3.3]) for (const lz of [1.05, -1.05]) cube(f, lx, 1.95, lz, 0.18, 1.1, 0.18, CABLE_C);
  cube(f, 0, 2.62, 0, 7.5, 0.24, 2.7, CABLE_C); cube(f, 0, 2.86, 0, 5.2, 0.24, 1.3, CABLE_R);
  cube(f, 3.56, 1.0, 0, 0.15, 0.4, 0.4, BRASS); cube(f, -3.56, 1.0, 0, 0.15, 0.4, 0.4, BRASS);
  cube(f, 2.4, 1.45, 1.2, 1.6, 0.2, 0.3, BRASS); cube(f, 2.4, 1.45, -1.2, 1.6, 0.2, 0.3, BRASS); cube(f, -2.4, 1.45, 1.2, 1.6, 0.2, 0.3, BRASS); cube(f, -2.4, 1.45, -1.2, 1.6, 0.2, 0.3, BRASS);
}
function drawSailboat(x, z, yaw, t, ph, col) {
  const y = SEA + 0.82 + Math.sin(t * 1.1 + ph) * 0.12, f = frame(x, y, z, yaw, 1, Math.sin(t * 0.9 + ph) * 0.04, 0.14 + Math.sin(t * 0.7 + ph) * 0.05);
  cube(f, 0, 0.25, 0, 6, 0.9, 2, HULL); cube(f, 3.4, 0.3, 0, 1, 0.7, 1.2, HULL); cube(f, 0, -0.05, 0, 6, 0.3, 2.04, col); cube(f, -0.6, 0.95, 0, 2.2, 0.5, 1.3, HULL);
  cube(f, 0.6, 4.6, 0, 0.18, 8, 0.18, TRUNK);
  for (let k = 0; k < 7; k++) cube(f, 0.6 - (3.4 - k * 0.45) / 2 - 0.1, 1.9 + k, 0, 3.4 - k * 0.45, 1, 0.1, SAIL);
  for (let k = 0; k < 5; k++) cube(f, 0.7 + (2.2 - k * 0.42) / 2 + 0.1, 1.9 + k, 0, 2.2 - k * 0.42, 1, 0.1, SAIL);
}
function drawSwan(x, z, yaw, t, ph) {
  const f = frame(x, SEA + 0.82 + Math.sin(t * 1.5 + ph) * 0.03, z, yaw, 0.2);
  cube(f, 0, 0.9, 0, 5, 1.8, 2.6, FUR_W); cube(f, -2.6, 1.5, 0, 1.4, 1.4, 1.6, FUR_W); cube(f, 2.3, 2.6, 0, 0.9, 3.6, 0.9, FUR_W); cube(f, 3, 4.1, 0, 1.8, 0.9, 0.9, FUR_W); cube(f, 4.1, 4, 0, 0.7, 0.5, 0.6, BEAK);
}

// ───────────── who is where ─────────────
function setupActors() {
  const A = actors.list, P = world.plan, r = rng(world.seed * 97 + 5);
  // corgis: [x, z, how]. A runner laps a small circle; a sitter watches the view.
  const runner = (cx, cz, R, speed, name) => { const o = { run: 1, ph: r() * TAU, name, cx, cz, R, w: speed / R * (r() < 0.5 ? 1 : -1), a0: r() * TAU };
    o.at = (t) => { const a = o.a0 + o.w * t; return [cx + R * Math.cos(a), cz + R * Math.sin(a), a + (o.w > 0 ? Math.PI / 2 : -Math.PI / 2)]; }; actors.corgis.push(o); };
  const sitter = (x, z, yaw, name) => { const o = { sit: true, run: 0, ph: r() * TAU, name }; o.at = () => [x, z, yaw]; actors.corgis.push(o); };
  const [ax, az] = P.alamo;
  runner(ax + 10, az - 3, 4.2, 5.2, "Alamo Square"); runner(ax + 9, az + 6, 2.6, 4.4, "Alamo Square"); sitter(ax + 7.5, az - 0.5, 0.15, "Alamo Square"); sitter(ax + 8.2, az + 2.6, 2.5, "Alamo Square");
  runner(P.palace[0] - 9, world.lagoons[0].z0 - 8, 2.6, 4, "Palace of Fine Arts"); sitter(P.palace[0] + 12, world.lagoons[0].z0 - 7, 1.4, "Palace of Fine Arts");
  runner(112, 185, 6.5, 5.5, "Golden Gate Park"); sitter(96, 181, 2.2, "Golden Gate Park");
  runner(74, 216, 3, 5.4, "Ocean Beach"); sitter(P.ferry[0] - 9, P.ferry[1] + 9, Math.PI, "Ferry Building"); sitter(P.yc[0] + 1, P.yc[1] + 10, Math.PI / 2, "Y Combinator");
  sitter(P.sign[0] + 5, P.sign[1] - 4, 0.2, "Twin Peaks");
  A.push((t) => { for (const o of actors.corgis) { const [x, z, yaw] = o.at(t); o.x = x; o.z = z; drawCorgi(x, z, yaw, t, o); } });

  // gulls: flocks that circle a spot; pelicans in a V round the whole island
  const flock = (cx, cz, n, R0, R1, h0, h1, sp) => { for (let k = 0; k < n; k++) { const R = mix(R0, R1, r()), h = mix(h0, h1, r()), a0 = r() * TAU, w = (sp * (0.7 + 0.6 * r())) / R * (k % 3 ? 1 : -1), ph = r() * TAU, ox = (r() - 0.5) * 8, oz = (r() - 0.5) * 8;
    A.push((t) => { const a = a0 + w * t; drawBird(cx + ox + R * Math.cos(a), h + Math.sin(t * 0.6 + ph) * 1.6, cz + oz + R * 0.8 * Math.sin(a), a + (w > 0 ? Math.PI / 2 : -Math.PI / 2), t, ph, FUR_W, GULL_G, 0.14, w > 0 ? 0.3 : -0.3); }); } };
  flock(P.pier39[0] + 12, P.pier39[1] - 4, 8, 8, 24, 13, 24, 7); flock(240, P.bridge.z, 7, 16, 40, P.bridge.y + 14, P.bridge.top + 8, 8);
  flock(72, 214, 5, 5, 14, 9.5, 15, 6); flock(P.ferry[0] + 12, P.ferry[1], 7, 10, 26, 16, 34, 7); flock(P.palace[0], world.lagoons[0].z0 + 26, 4, 8, 16, 12, 20, 6);
  for (let k = 0; k < 7; k++) { const row = Math.ceil(k / 2), sd = k % 2 ? 1 : -1; A.push((t) => { const a = 0.6 + t * 0.04 - row * 0.016, R = 178 + sd * row * 2.4; drawBird(W / 2 + R * Math.cos(a), 21 + Math.sin(t * 0.5 + k) * 0.6, D / 2 + R * Math.sin(a), a + Math.PI / 2, t, k * 1.7, SEALION, SEALION, 0.2, 0.05); }); }

  // sea lions on the floats at Pier 39
  for (const [x, z] of world.rafts) for (let k = 0; k < 3; k++) { const ox = (k - 1) * 1.45 + (r() - 0.5) * 0.3, oz = (r() - 0.5) * 1.2, yaw = r() * TAU, ph = r() * TAU; A.push((t) => drawSeaLion(x + ox, SEA + 1, z + oz, yaw, t, ph)); }
  // swans in the Palace lagoon
  for (let k = 0; k < 2; k++) A.push((t) => { const a = t * 0.12 + k * 0.7; drawSwan(world.swans[0] + 5 * Math.cos(a) - k * 1.5, world.swans[1] + 3 * Math.sin(a), a + Math.PI / 2, t, k * 2); });

  // traffic on the bridge: five each way, in the outer lanes
  const B = P.bridge, span = B.x1 - B.x0 + 36, cols = [CAR_W, CAR_Y, CAR_W, CAR_B, IORANGE, CAR_W, SIGN_BLACK, CAR_W, CAR_B, CAR_W];
  for (let k = 0; k < 10; k++) { const dir = k % 2 ? 1 : -1, off = (k * 0.137 + r() * 0.05) % 1, sp = 6.5 + r() * 1.5;
    A.push((t) => { const u = (((off + (t * sp) / span) % 1) + 1) % 1, x = dir > 0 ? B.x0 - 18 + u * span : B.x1 + 18 - u * span, y = world.deck[clamp(Math.round(x), 0, W - 1)]; if (y) drawCar(x, y + 1, B.z + dir * 1.5 + 0.5, dir > 0 ? 0 : Math.PI, cols[k], k % 3 === 0); }); }
  // robotaxis lapping a few blocks
  const loop = (x0, z0, x1, z1, n, sp) => { const w = x1 - x0, d = z1 - z0, per = 2 * (w + d);
    for (let k = 0; k < n; k++) { const off = (k / n + r() * 0.08) * per; A.push((t) => { const s = (off + t * sp) % per; let x, z, yaw;
      if (s < w) { x = x0 + s; z = z0; yaw = 0; } else if (s < w + d) { x = x1; z = z0 + s - w; yaw = Math.PI / 2; } else if (s < 2 * w + d) { x = x1 - (s - w - d); z = z1; yaw = Math.PI; } else { x = x0; z = z1 - (s - 2 * w - d); yaw = -Math.PI / 2; }
      const ox = yaw === Math.PI / 2 ? -1 : yaw === -Math.PI / 2 ? 1 : 0, oz = yaw === 0 ? 1 : yaw === Math.PI ? -1 : 0;
      drawCar(x + ox + 0.5, groundF(x + ox + 0.5, z + oz + 0.5), z + oz + 0.5, yaw, k % 4 === 3 ? CAR_Y : CAR_W, k % 4 !== 3); }); } };
  loop(202, 264, 278, 296, 4, 5); loop(278, 200, 316, 264, 5, 5.5); loop(164, 200, 202, 232, 3, 4.5); loop(88, 200, 126, 264, 3, 4.5);
  // cable cars on the street over Nob Hill
  world.cable = { z: 232.5, x0: 172, x1: 314 };
  for (let k = 0; k < 2; k++) A.push((t) => { const c = world.cable, per = 52, u = ((t + 16.4 + k * per / 2) % per) / per, v = u < 0.5 ? ease(u * 2) : ease(2 - u * 2), x = mix(c.x0, c.x1, v);
    drawCableCar(x, groundF(x, c.z), c.z, 0); });
  setupPeople(r);
  // boats
  for (let k = 0; k < 4; k++) { const a0 = [0.2, 1.9, 3.7, 5.2][k], R = [205, 196, 215, 200][k], ph = k * 1.3; A.push((t) => { const a = a0 + t * 0.012; drawSailboat(W / 2 + R * Math.cos(a), D / 2 + R * 0.92 * Math.sin(a), a + Math.PI / 2, t, ph, k % 2 ? HULL_B : IORANGE); }); }
}
function drawActors(t) { actors.n = 0; for (const a of actors.list) a(t); for (const a of actors.extra) a(t); } // extra: whoever is online
