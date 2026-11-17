// ───────────────────────── people ─────────────────────────
// Block people: the walkers who live on the island, and (online) everyone
// else who is on it. The walkers are not simulated anywhere. Each one's whole
// walk is fixed by the island's seed: a random ramble over the street grid
// that ends where it began, walked round and round. Where they are is a
// function of the clock alone, so every visitor sees the same person at the
// same corner without the server sending anything.

// look: [skin, shirt, trousers, hair, hair style, extra]
//   hair style: 0 short, 1 long, 2 beanie, 3 cap     extra: 0 nothing, 1 backpack, 2 vest, 3 coffee
// o: { walk: 0..1 how much the limbs swing, ph: where in the stride, wave, board }
function drawHuman(x, y, z, yaw, t, look, o) {
  const s = 0.1 * (o.tall || 1), skin = SKINS[look[0]], shirt = SHIRTS[look[1]], pants = PANTS[look[2]], hair = HAIRS[look[3]], style = look[4], extra = look[5];
  const walk = o.board ? 0 : o.walk || 0, sw = Math.sin(o.ph || 0) * 0.75 * walk, bob = Math.abs(Math.cos(o.ph || 0)) * 0.3 * walk;
  if (o.board) { const b = frame(x, y, z, yaw, s); cube(b, 0, 0.55, 0, 8.4, 0.5, 2.4, BOARD); for (const lx of [-2.8, 2.8]) for (const lz of [-0.9, 0.9]) cube(b, lx, 0.2, lz, 0.9, 0.5, 0.5, BLACK); y += 0.08; yaw += 0.5; }
  const f = frame(x, y + bob * s, z, yaw, s);
  for (const sd of [1, -1]) { // legs, hinged at the hip
    const leg = frame(...at(f, 0, 7, sd * 1.15), yaw, s, sd * sw);
    cube(leg, 0, -3.4, 0, 2.1, 6.8, 2.1, pants); cube(leg, 0.35, -6.55, 0, 2.8, 0.9, 2.2, BLACK);
  }
  cube(f, 0, 9.9, 0, 2.6, 5.8, 4.6, shirt);
  if (extra === 1) cube(f, -2, 10.3, 0, 1.5, 4.4, 3.6, PANTS[(look[2] + 2) % PANTS.length]);
  if (extra === 2) cube(f, 0, 10.2, 0, 3, 4.6, 4.9, VEST);
  for (const sd of [1, -1]) { // arms, hinged at the shoulder
    const up = o.wave && sd === 1, hold = extra === 3 && sd === 1;
    const arm = frame(...at(f, 0, 12.5, sd * 3.05), yaw, s, up ? 2.6 + Math.sin(t * 11) * 0.35 : hold ? 1.15 : -sd * sw * 0.9);
    cube(arm, 0, -2.6, 0, 1.6, 5.2, 1.5, extra === 2 ? SHIRTS[(look[1] + 3) % SHIRTS.length] : shirt); cube(arm, 0, -5.7, 0, 1.45, 1.1, 1.4, skin);
    if (hold) { cube(arm, 0.2, -6.9, 0, 1.3, 1.7, 1.3, CUP); cube(arm, 0.2, -7.8, 0, 1.4, 0.3, 1.4, BLACK); }
  }
  cube(f, 0, 14.7, 0, 3.5, 3.5, 3.5, skin);
  cube(f, 1.78, 15, 0.85, 0.12, 0.6, 0.6, BLACK); cube(f, 1.78, 15, -0.85, 0.12, 0.6, 0.6, BLACK);
  if (style === 2) { cube(f, 0, 16.4, 0, 3.8, 1.5, 3.8, SHIRTS[(look[1] + 5) % SHIRTS.length]); cube(f, 0, 17.4, 0, 1, 0.7, 1, SHIRTS[(look[1] + 5) % SHIRTS.length]); }
  else if (style === 3) { cube(f, 0, 16.5, 0, 3.8, 1.1, 3.8, SHIRTS[(look[1] + 7) % SHIRTS.length]); cube(f, 2.5, 16.2, 0, 1.5, 0.3, 3.2, SHIRTS[(look[1] + 7) % SHIRTS.length]); cube(f, -1.7, 15.2, 0, 0.5, 1.6, 3.7, hair); }
  else { cube(f, -0.1, 16.6, 0, 3.8, 0.9, 3.8, hair); cube(f, -1.65, 15.3, 0, 0.6, 2.3, 3.8, hair); if (style === 1) { cube(f, -1.2, 13.4, 0, 1.3, 2.4, 3.9, hair); cube(f, 0, 15.4, 1.8, 2.4, 2.2, 0.35, hair); cube(f, 0, 15.4, -1.8, 2.4, 2.2, 0.35, hair); } }
}
function drawCat(x, z, yaw, t, ph, fur) {
  const f = frame(x, groundF(x, z), z, yaw, 0.1);
  cube(f, -0.4, 1.7, 0, 3.2, 3.2, 2.4, fur); cube(f, 1.3, 1, 0.7, 0.8, 2, 0.7, fur); cube(f, 1.3, 1, -0.7, 0.8, 2, 0.7, fur);
  const h = frame(...at(f, 1, 4.3, 0), yaw + Math.sin(t * 0.7 + ph) * 0.5, 0.1);
  cube(h, 0, 0, 0, 2.2, 2, 2.4, fur); cube(h, 0, 1.3, 0.8, 0.7, 0.8, 0.7, fur); cube(h, 0, 1.3, -0.8, 0.7, 0.8, 0.7, fur); cube(h, 1.12, 0.2, 0.55, 0.1, 0.5, 0.45, BLACK); cube(h, 1.12, 0.2, -0.55, 0.1, 0.5, 0.45, BLACK);
  cube(f, -2.3, 0.5, Math.sin(t * 2 + ph) * 0.8 + 1.2, 0.6, 0.6, 2.6, fur);
}
// A thin box from one point to another (a leash).
function drawLine(a, b, w, mat) {
  const d = V3.sub(b, a), len = Math.hypot(d[0], d[1], d[2]); if (len < 0.01) return;
  cube(frame((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, Math.atan2(d[2], d[0]), 1, Math.asin(clamp(d[1] / len, -1, 1))), 0, 0, 0, len, w, w, mat);
}

// ───────────── the street grid as a graph ─────────────
// Corners are where two street centre lines cross; two corners are joined
// when the whole street between them is there (landmarks and parks cut some).
function streetGraph() {
  const S = world.street, on = (x, z) => x >= 1 && z >= 1 && x < W && z < D && S[z * W + x] > 0 && S[(z - 1) * W + x - 1] > 0;
  const nodes = new Map(), key = (gx, gz) => gx * 100 + gz, px = (gx) => GX + gx * PX, pz = (gz) => GZ + gz * PZ;
  for (let gz = 0; pz(gz) < D; gz++) for (let gx = 0; px(gx) < W; gx++) if (on(px(gx), pz(gz))) nodes.set(key(gx, gz), { gx, gz, x: px(gx), z: pz(gz), to: [] });
  for (const n of nodes.values()) for (const [dx, dz] of [[1, 0], [0, 1]]) {
    const m = nodes.get(key(n.gx + dx, n.gz + dz)); if (!m) continue;
    let ok = true; for (let k = 1; ok && k < (dx ? PX : PZ); k++) ok = on(n.x + dx * k, n.z + dz * k);
    if (ok) { n.to.push(m); m.to.push(n); }
  }
  return [...nodes.values()].filter((n) => n.to.length);
}
// A ramble from a corner and back to it: random turns, no doubling back unless the street ends.
function ramble(nodes, r) {
  const start = nodes[Math.floor(r() * nodes.length)], path = [start]; let prev = null, at = start;
  for (let k = 0, n = 8 + Math.floor(r() * 14); k < n; k++) { const next = at.to.filter((m) => m !== prev), go = next.length ? next[Math.floor(r() * next.length)] : prev; prev = at; at = go; path.push(at); }
  const seen = new Map([[at, null]]), queue = [at]; // the shortest way home
  while (queue.length) { const n = queue.shift(); if (n === start) break; for (const m of n.to) if (!seen.has(m)) { seen.set(m, n); queue.push(m); } }
  const back = []; for (let n = start; n && n !== at; n = seen.get(n)) back.push(n);
  path.push(...back.reverse());
  return path; // ends on start
}
// The ramble as a line on the right-hand pavement, with the distance along it at each point.
function pavement(path, off) {
  const n = path.length - 1, dir = (i) => { const a = path[((i % n) + n) % n], b = path[(((i + 1) % n) + n) % n]; return [Math.sign(b.x - a.x), Math.sign(b.z - a.z)]; };
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = dir(i - 1), b = dir(i), p = path[i], ra = [-a[1], a[0]], rb = [-b[1], b[0]];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    if (a[0] === -b[0] && a[1] === -b[1]) { pts.push([p.x + ra[0] * off + a[0] * off, p.z + ra[1] * off + a[1] * off], [p.x + rb[0] * off - b[0] * off, p.z + rb[1] * off - b[1] * off]); continue; } // turned round at a dead end
    pts.push([p.x + (ra[0] + rb[0]) * off, p.z + (ra[1] + rb[1]) * off]);
  }
  if (pts.length < 2) return null;
  const len = [0]; for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; len.push(len[i] + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1])); }
  return { pts, len, total: len[pts.length] };
}
function along(line, s) {
  s = ((s % line.total) + line.total) % line.total;
  let i = 0; while (line.len[i + 1] < s) i++;
  const a = line.pts[i], b = line.pts[(i + 1) % line.pts.length], u = (s - line.len[i]) / Math.max(1e-6, line.len[i + 1] - line.len[i]);
  return [mix(a[0], b[0], u), mix(a[1], b[1], u)];
}
// Where a walker is: on the line, stepping round street trees, facing the way they are going.
function walkerAt(line, s) {
  const a = along(line, s - 0.5), b = along(line, s + 0.5), p = along(line, s), yaw = Math.atan2(b[1] - a[1], b[0] - a[0]), dx = Math.cos(yaw), dz = Math.sin(yaw);
  let dodge = 0;
  for (let d = -1.5; d <= 1.5; d += 0.5) { const X = Math.floor(p[0] + dx * d), Z = Math.floor(p[1] + dz * d); if (X >= 0 && Z >= 0 && X < W && Z < D && getv(X, world.hgt[Z * W + X], Z) === TRUNK) dodge = Math.max(dodge, 1 - Math.abs(d) / 1.5); }
  return [p[0] + dz * dodge * 1.15, p[1] - dx * dodge * 1.15, yaw];
}

// ───────────── who lives here ─────────────
const KINDS = [ // what they wear, how fast they go
  { name: "in a vest", look: (r) => [pick(r, 6), pick(r, 4, [1, 3, 0, 8]), pick(r, 3, [0, 2, 3]), pick(r, 6), pick(r, 2), 2], speed: 3.1 },
  { name: "with a coffee", look: (r) => [pick(r, 6), pick(r, 12), pick(r, 6), pick(r, 6), pick(r, 3), 3], speed: 2.5 },
  { name: "tourist", look: (r) => [pick(r, 6), pick(r, 5, [2, 5, 7, 9, 10]), pick(r, 2, [3, 1]), pick(r, 6), 3, 1], speed: 2.1 },
  { name: "runner", look: (r) => [pick(r, 6), pick(r, 4, [9, 5, 7, 10]), pick(r, 2, [4, 0]), pick(r, 6), pick(r, 2), 0], speed: 5.4 },
  { name: "skater", look: (r) => [pick(r, 6), pick(r, 3, [1, 8, 6]), pick(r, 2, [4, 3]), pick(r, 6), 2, 0], speed: 7, board: true },
  { name: "local", look: (r) => [pick(r, 6), pick(r, 12), pick(r, 6), pick(r, 6), pick(r, 2), 0], speed: 2.8 },
  { name: "local", look: (r) => [pick(r, 6), pick(r, 12), pick(r, 6), pick(r, 6), pick(r, 4), pick(r, 2)], speed: 2.6 },
];
const pick = (r, n, from) => (from ? from[Math.floor(r() * n)] : Math.floor(r() * n));
const DOGS = [{}, { fur: DOG_K, belly: DOG_K }, { fur: DOG_Y, belly: FUR_W }, { fur: DOG_B, belly: DOG_Y }, { fur: FUR_W, belly: FUR_W }, { fur: CAT_G, belly: FUR_W }];
const people = { walkers: [], cats: [] };
function setupPeople(r) {
  const nodes = streetGraph(), A = actors.list;
  world.stats.corners = nodes.length;
  for (let k = 0; k < 34 && nodes.length > 3; k++) {
    const kind = KINDS[k % KINDS.length], line = pavement(ramble(nodes, r), 2.5); if (!line || line.total < 40) continue;
    const w = { line, look: kind.look(r), speed: kind.speed * (0.9 + 0.2 * r()), s0: r() * line.total, ph: r() * TAU, board: kind.board, tall: 0.94 + 0.12 * r(), kind: kind.name, dog: null, x: 0, z: 0 };
    if (!kind.board && kind.name !== "runner" && r() < 0.42) w.dog = { run: 0.75, ph: r() * TAU, ...DOGS[Math.floor(r() * DOGS.length)] };
    people.walkers.push(w);
    A.push((t) => {
      const s = w.s0 + t * w.speed, [x, z, yaw] = walkerAt(line, s), y = groundF(x, z);
      w.x = x; w.z = z;
      drawHuman(x, y, z, yaw, t, w.look, { walk: 1, ph: w.ph + s * 2.1, board: w.board, tall: w.tall });
      if (w.dog) { const [dx, dz, dyaw] = walkerAt(line, s + 1.7); const ox = dx + Math.sin(dyaw) * 0.55, oz = dz - Math.cos(dyaw) * 0.55; drawCorgi(ox, oz, dyaw, t * (w.speed / 4), w.dog);
        drawLine([x + Math.sin(yaw) * 0.3, y + 0.72, z - Math.cos(yaw) * 0.3], [ox - Math.cos(dyaw) * 0.25, groundF(ox, oz) + 0.5, oz - Math.sin(dyaw) * 0.25], 0.035, LEASH); }
    });
  }
  // cats, sitting where cats sit
  const P = world.plan, sit = [[P.ladies[0] - 2.5, P.ladies[1] + 1.5, Math.PI], [P.ladies[0] - 2.5, P.ladies[1] + 13.5, Math.PI], [P.yc[0] - 8.5, P.yc[1] + 7.5, 1.2], [P.ferry[0] - 6.5, P.ferry[1] - 12.5, Math.PI], [P.pier39[0] - 9.5, P.pier39[1] + 5.5, 0.4], [P.palace[0] + 14.5, P.palace[1] + 12.5, 2]];
  sit.forEach(([x, z, yaw], k) => { const ph = r() * TAU, fur = [CAT_G, CAT_O, BLACK, FUR_W][k % 4]; people.cats.push([x, z]); A.push((t) => drawCat(x, z, yaw, t, ph, fur)); });
  world.stats.walkers = people.walkers.length; world.stats.dogs = people.walkers.filter((w) => w.dog).length; world.stats.cats = people.cats.length;
}
