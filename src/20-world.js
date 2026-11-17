// ───────────────────────── world ─────────────────────────
// The island is the Reason mark, drawn at MARK blocks per pixel: a hexagon
// with two long lagoons. North is -z, east is +x, one block is one unit.
const MARK = 0.8, H = 150, OX = 48, OZ = 47, SEA = 6;
let W = 0, D = 0, vox = null;
const vi = (x, y, z) => (y * D + z) * W + x;
const inb = (x, y, z) => x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < H;
const setv = (x, y, z, m) => { if (inb(x, y, z)) vox[vi(x, y, z)] = m; };
const getv = (x, y, z) => (inb(x, y, z) ? vox[vi(x, y, z)] : 0);
const put = (x, y, z, m) => { if (inb(x, y, z) && !vox[vi(x, y, z)]) vox[vi(x, y, z)] = m; }; // into air only
const box = (x0, y0, z0, x1, y1, z1, m) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) setv(x, y, z, m); };
const world = { places: [], lagoons: [], stats: {}, site: null, cells: [], seed: 7 };
const ground = (x, z) => world.hgt[clamp(Math.round(z), 0, D - 1) * W + clamp(Math.round(x), 0, W - 1)]; // first air block above the land
const place = (name, x, z, r = 30) => world.places.push({ name, x, z, r });

function distanceFrom(isSource) {
  const d = new Float32Array(W * D).fill(1e6);
  for (let i = 0; i < W * D; i++) if (isSource(i)) d[i] = 0;
  const A = 1, Bd = Math.SQRT2;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + A);
    if (z > 0) { v = Math.min(v, d[i - W] + A); if (x > 0) v = Math.min(v, d[i - W - 1] + Bd); if (x < W - 1) v = Math.min(v, d[i - W + 1] + Bd); }
    d[i] = v;
  }
  for (let z = D - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
    const i = z * W + x; let v = d[i];
    if (x < W - 1) v = Math.min(v, d[i + 1] + A);
    if (z < D - 1) { v = Math.min(v, d[i + W] + A); if (x < W - 1) v = Math.min(v, d[i + W + 1] + Bd); if (x > 0) v = Math.min(v, d[i + W - 1] + Bd); }
    d[i] = v;
  }
  return d;
}

// ───────────── plants ─────────────
function tree(x, y, z, r, big) {
  const th = 3 + Math.floor(r() * (big ? 4 : 2)), R = (big ? 2.3 : 1.7) + r() * (big ? 1.4 : 0.7);
  const leaf = [LEAF_A, LEAF_B, LEAF_C][Math.floor(r() * 3)];
  for (let i = 0; i < th; i++) setv(x, y + i, z, TRUNK);
  const cy = y + th + R * 0.45, c = Math.ceil(R);
  for (let dy = -c; dy <= c; dy++) for (let dz = -c; dz <= c; dz++) for (let dx = -c; dx <= c; dx++) {
    const q = dx * dx + dz * dz + dy * dy * 1.5;
    if (q < R * R && (q < R * R * 0.55 || r() > 0.22)) put(x + dx, Math.round(cy + dy), z + dz, leaf);
  }
}
// Monterey cypress: a bare trunk under a wide, flat, wind-pushed crown.
function cypress(x, y, z, r) {
  const th = 4 + Math.floor(r() * 4), R = 2.4 + r() * 1.6, lean = r() < 0.6 ? 1 : 0;
  for (let i = 0; i < th; i++) setv(x, y + i, z, TRUNK);
  for (let dy = 0; dy <= 2; dy++) { const rr = R * (dy === 1 ? 1 : 0.68), c = Math.ceil(rr);
    for (let dz = -c; dz <= c; dz++) for (let dx = -c; dx <= c; dx++) if (dx * dx + dz * dz < rr * rr && r() > 0.12) put(x + dx + lean * (dy > 0 ? 1 : 0), y + th - 1 + dy, z + dz, CYPRESS); }
}
function palm(x, y, z, r) {
  const th = 6 + Math.floor(r() * 4);
  for (let i = 0; i < th; i++) setv(x, y + i, z, TRUNK);
  const t = y + th;
  setv(x, t, z, PALM);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { put(x + dx, t, z + dz, PALM); put(x + dx * 2, t, z + dz * 2, PALM); put(x + dx * 3, t - 1, z + dz * 3, PALM); }
  for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { put(x + dx, t, z + dz, PALM); put(x + dx * 2, t - 1, z + dz * 2, PALM); }
}

// ───────────── the island ─────────────
// Street grid: city blocks of 32 x 26 with 6-wide streets between them.
const PX = 38, PZ = 32, IW = 32, ID = 26, GX = 13, GZ = 9;
const cellRect = (gx, gz) => { const x0 = GX + gx * PX + 3, z0 = GZ + gz * PZ + 3; return [x0, z0, x0 + IW - 1, z0 + ID - 1]; };
const interior = (x, z) => { const lx = (x - GX) % PX, lz = (z - GZ) % PZ; return x >= GX && z >= GZ && lx >= 3 && lx < 3 + IW && lz >= 3 && lz < 3 + ID; };
// lot: what a column is kept for when it holds no ordinary building
const LOT_LAWN = 1, LOT_PARK = 2, LOT_PLAZA = 3, LOT_FOREST = 4, LOT_ROAD = 5, LOT_SAND = 6;

function buildWorld(alpha, mw, mh) {
  W = mw + OX * 2; D = mh + OZ * 2; vox = new Uint8Array(W * D * H);
  const N = W * D;
  const kind = new Uint8Array(N); // 0 land, 1 sea, 2 lagoon
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const mx = x - OX, mz = z - OZ;
    const a = mx >= 0 && mz >= 0 && mx < mw && mz < mh ? alpha[(mz * mw + mx) * 4 + 3] : 0;
    kind[z * W + x] = a > 127 ? 0 : 2;
  }
  // Water reachable from the corner is sea; the rest is the two lagoons.
  const stack = [0]; kind[0] = 1;
  while (stack.length) { const i = stack.pop(), x = i % W, z = (i / W) | 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Z = z + dz; if (X < 0 || Z < 0 || X >= W || Z >= D) continue; const j = Z * W + X; if (kind[j] === 2) { kind[j] = 1; stack.push(j); } } }
  const dSea = distanceFrom((i) => kind[i] === 1), dLag = distanceFrom((i) => kind[i] === 2);
  // Lagoon bounding boxes, west to east.
  { const seen = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (kind[i] === 2 && !seen[i]) { const bb = { x0: 1e9, x1: -1, z0: 1e9, z1: -1 }; const st = [i]; seen[i] = 1; while (st.length) { const j = st.pop(), x = j % W, z = (j / W) | 0; bb.x0 = Math.min(bb.x0, x); bb.x1 = Math.max(bb.x1, x); bb.z0 = Math.min(bb.z0, z); bb.z1 = Math.max(bb.z1, z); for (const k of [j + 1, j - 1, j + W, j - W]) if (k >= 0 && k < N && kind[k] === 2 && !seen[k]) { seen[k] = 1; st.push(k); } } world.lagoons.push(bb); }
    world.lagoons.sort((a, b) => a.x0 - b.x0); }
  const L1 = world.lagoons[0], L2 = world.lagoons[1];
  world.kind = kind; world.dSea = dSea; world.dLag = dLag;

  // Heights: a low shelf round the shore, and the hills.
  const hgt = new Int16Array(N), surf = new Uint8Array(N), lot = new Uint8Array(N);
  const zone = new Uint8Array(N); // 1 = may hold an ordinary building or a street
  world.hgt = hgt; world.surf = surf; world.lot = lot; world.zone = zone;
  const strip = (x, z) => x > L1.x1 && x < L2.x0 && z >= L1.z0 - 6 && z <= L1.z1 + 6;
  const beach = (x, z, ds) => x < 150 && z > 96 && z < 306 && ds < 11 - 6 * smooth(250, 306, z) - 6 * smooth(150, 96, z); // Ocean Beach, the west shore
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x; if (kind[i]) continue;
    const ds = dSea[i], dl = dLag[i];
    let h = SEA + 1; if (ds >= 3) h += Math.min(3, (ds - 3) / 4);
    let up = 2.4 * (noise2(x / 48, z / 48, 3) - 0.4) * smooth(10, 40, ds);
    for (const [cx, cz, r, hh] of HILLS) up += hh * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (2 * (r * 0.55) ** 2)) * smooth(2, 9, ds);
    h += up;
    h = Math.min(h, SEA + 2 + Math.max(0, dl - 5) / 1.7);
    if (strip(x, z)) h = SEA + 2;
    if (beach(x, z, ds)) { h = Math.min(h, SEA + 1 + ds / 7); lot[i] = LOT_SAND; }
    hgt[i] = Math.max(SEA + 1, Math.round(h));
    zone[i] = ds >= 9 && dl >= 4 && !strip(x, z) && !lot[i] ? 1 : 0;
    if (strip(x, z)) lot[i] = LOT_PARK;
  }
  // Land kept for landmarks and parks. level: a number, "median", or nothing to keep the slope.
  const reserve = (x0, z0, x1, z1, kindLot, level, inside) => {
    const cols = [];
    for (let z = Math.max(0, z0); z <= Math.min(D - 1, z1); z++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) { const i = z * W + x; if (kind[i] || (inside && !inside(x, z))) continue; cols.push(i); }
    let lv = level;
    if (level === "median") { const hs = cols.map((i) => hgt[i]).sort((a, b) => a - b); lv = hs[hs.length >> 1]; }
    for (const i of cols) { zone[i] = 0; if (lot[i] !== LOT_SAND || kindLot === LOT_PLAZA) lot[i] = kindLot; if (lv != null && dSea[i] >= 3 && dLag[i] >= 2) hgt[i] = lv; }
    return lv;
  };
  const reserveDisc = (cx, cz, r, kindLot, level) => reserve(cx - r, cz - r, cx + r, cz + r, kindLot, level, (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= r * r);
  const plan = planLandmarks({ reserve, reserveDisc, L1, L2 });

  // City blocks.
  const cells = [], street = new Uint8Array(N), cellOf = new Int16Array(N).fill(-1);
  world.street = street;
  for (let gz = 0; GZ + gz * PZ + ID < D; gz++) for (let gx = 0; GX + gx * PX + IW < W; gx++) {
    const x0 = GX + gx * PX + 3, z0 = GZ + gz * PZ + 3; let n = 0;
    for (let z = 0; z < ID; z++) for (let x = 0; x < IW; x++) if (zone[(z0 + z) * W + x0 + x]) n++;
    if (n < IW * ID * 0.3) continue;
    const c = { x0, z0, gx, gz, n, occ: new Uint8Array(IW * ID), used: false, id: cells.length, items: [] };
    c.cx = x0 + IW / 2; c.cz = z0 + ID / 2; c.district = districtOf(c.cx, c.cz);
    const hs = []; for (let z = 0; z < ID; z++) for (let x = 0; x < IW; x++) { const i = (z0 + z) * W + x0 + x; if (zone[i]) { hs.push(hgt[i]); cellOf[i] = c.id; } }
    hs.sort((a, b) => a - b); c.level = hs[hs.length >> 1];
    cells.push(c);
  }
  world.cells = cells;

  const fits = (c, px, pz, w, d) => {
    if (px < 0 || pz < 0 || px + w > IW || pz + d > ID) return false;
    for (let z = -1; z <= d; z++) for (let x = -1; x <= w; x++) {
      const X = px + x, Z = pz + z, inside = x >= 0 && z >= 0 && x < w && z < d;
      if (X < 0 || Z < 0 || X >= IW || Z >= ID) continue;
      if (c.occ[Z * IW + X]) return false;
      if (inside && !zone[(c.z0 + Z) * W + c.x0 + X]) return false;
    }
    return true;
  };
  const claim = (c, px, pz, w, d) => { for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) c.occ[(pz + z) * IW + px + x] = 1; c.used = true; };
  const placeIn = (c, b) => {
    for (const rot of [0, 1]) {
      const w = rot ? b.d : b.w, d = rot ? b.w : b.d;
      for (let pz = 1; pz + d < ID; pz++) for (let px = 1; px + w < IW; px++) if (fits(c, px, pz, w, d)) {
        b.w = w; b.d = d; claim(c, px, pz, w, d);
        b.x = c.x0 + px; b.z = c.z0 + pz; b.y = c.level; c.items.push(b); return true;
      }
    }
    return false;
  };
  const towers = [], houses = [];
  for (const c of cells) {
    const r = rng(hashStr("cell" + c.gx + "," + c.gz + "," + world.seed));
    if (c.district === "fidi" || c.district === "soma") {
      const fidi = c.district === "fidi", near = Math.exp(-Math.hypot(c.cx - plan.salesforce[0], c.cz - plan.salesforce[1]) / 60);
      for (let k = 0, miss = 0; k < 14 && miss < 5; k++) {
        const b = fidi ? { w: 7 + Math.floor(r() * 8), d: 7 + Math.floor(r() * 7), h: Math.round(14 + (10 + 50 * near) * (0.32 + 0.68 * r())), mat: TOWER_MATS[Math.floor(r() * TOWER_MATS.length)] }
          : { w: 8 + Math.floor(r() * 9), d: 7 + Math.floor(r() * 7), h: 4 + Math.floor(r() * r() * 13), mat: MID_MATS[Math.floor(r() * MID_MATS.length)] };
        b.nt = b.h > 40 ? (r() < 0.6 ? 3 : 2) : b.h > 22 && r() < 0.5 ? 2 : 1; b.r = r;
        if (placeIn(c, b)) towers.push(b); else miss++;
      }
    } else {
      const pal = c.district === "marina" ? [6, 8, 0, 5, 11, 2, 8, 6] : c.district === "mission" ? [0, 1, 2, 3, 4, 5, 9, 10, 7] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      for (const side of [0, 1]) for (let x = 1 + Math.floor(r() * 2); x + 3 <= IW - 1;) {
        const w = r() < 0.45 ? 4 : 3, d = 7 + Math.floor(r() * 2), h = 3 + Math.floor(r() * 2.4), pz = side ? ID - 1 - d : 1;
        if (x + w > IW - 1) break;
        let ok = true; for (let z = -1; z <= d && ok; z++) for (let xx = 0; xx < w; xx++) if (!zone[(c.z0 + clamp(pz + z, 0, ID - 1)) * W + c.x0 + x + xx]) { ok = false; break; }
        if (ok) { claim(c, x, pz, w, d); houses.push({ x: c.x0 + x, z: c.z0 + pz, y: c.level, w, d, h, side, mat: PASTELS[pal[Math.floor(r() * pal.length)]], front: r() < 0.6, cell: c }); }
        x += w + (r() < 0.07 ? 2 : 0);
      }
    }
  }
  world.stats.cells = cells.length; world.stats.towers = towers.length; world.stats.houses = houses.length;

  // Terrain: flatten built city blocks, then choose a surface per column.
  for (const c of cells) if (c.used) for (let z = 0; z < ID; z++) for (let x = 0; x < IW; x++) { const i = (c.z0 + z) * W + c.x0 + x; if (zone[i]) hgt[i] = c.level; }
  const LOT_SURF = [0, LAWN, GRASS, PAVE, GRASS, ASPHALT, SAND];
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x; if (kind[i]) continue;
    const ds = dSea[i], dl = dLag[i], c = cellOf[i] >= 0 ? cells[cellOf[i]] : null;
    let s = GRASS;
    if (dl < 4.5) s = QUAY; else if (ds < 3) s = SAND;
    else if (lot[i]) s = LOT_SURF[lot[i]];
    else if (c && c.used) s = PAVE;
    else if (zone[i] && !interior(x, z)) {
      // street: sidewalk where it touches a city block
      let edge = false; for (const [X, Z] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) if (interior(X, Z)) edge = true;
      s = edge ? PAVE : ASPHALT; street[i] = edge ? 2 : 1;
    }
    surf[i] = s;
  }
  // Back yards: grass where nothing is built nearby.
  for (const c of cells) if (c.used) for (let z = 0; z < ID; z++) for (let x = 0; x < IW; x++) {
    const i = (c.z0 + z) * W + c.x0 + x; if (!zone[i] || c.occ[z * IW + x]) continue;
    let near = false; for (let dz = -2; dz <= 2 && !near; dz++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Z = z + dz; if (X >= 0 && Z >= 0 && X < IW && Z < ID && c.occ[Z * IW + X]) { near = true; break; } }
    const rows = c.district !== "fidi" && c.district !== "soma";
    if (!near || (rows && z > 1 && z < ID - 2)) surf[i] = GRASS;
  }
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x; if (kind[i]) continue;
    const h = hgt[i], s = surf[i];
    for (let y = SEA - 1; y < h; y++) vox[vi(x, y, z)] = y === h - 1 ? s : s === GRASS || s === LAWN ? DIRT : s === SAND ? SAND : STONE;
  }

  // Ordinary buildings.
  for (const b of towers) {
    const r = b.r; let y = b.y, left = b.h;
    for (let t = 0; t < b.nt; t++) {
      const hh = t === b.nt - 1 ? left : Math.max(3, Math.round(left * (b.nt === 3 ? [0.5, 0.6][t] : 0.62)));
      box(b.x + t, y, b.z + t, b.x + b.w - 1 - t, y + hh - 1, b.z + b.d - 1 - t, b.mat); y += hh; left -= hh;
    }
    b.top = y;
    if (b.h > 18) { // plant on the roof, and now and then a mast
      const t = b.nt - 1, w = b.w - 2 * t, d = b.d - 2 * t;
      if (w > 4 && d > 4) box(b.x + t + 1 + Math.floor(r() * 2), y, b.z + t + 1, b.x + t + 1 + Math.floor(w / 2), y + (r() < 0.5 ? 1 : 0), b.z + t + Math.floor(d / 2), CONCRETE);
      if (b.h > 44 && r() < 0.6) for (let k = 0; k < 4 + Math.floor(r() * 6); k++) setv(b.x + (b.w >> 1), y + 1 + k, b.z + (b.d >> 1), CONCRETE);
    }
  }
  for (const h of houses) {
    box(h.x, h.y, h.z, h.x + h.w - 1, h.y + h.h - 1, h.z + h.d - 1, h.mat);
    const zf = h.side ? h.z + h.d : h.z - 1, zr = h.side ? h.z + h.d - 1 : h.z; // bay window over the garage, and a false front
    for (let x = h.x + 1; x < h.x + h.w - 1; x++) for (let y = h.y + 1; y < h.y + h.h; y++) setv(x, y, zf, h.mat);
    if (h.front) for (let x = h.x; x < h.x + h.w; x++) setv(x, h.y + h.h, zr, TRIM);
    setv(h.x, h.y, zf, STEP);
  }

  buildLandmarks(plan);

  // Trees: the green belt, parks, back yards and some sidewalks.
  for (let z = 2; z < D - 2; z++) for (let x = 2; x < W - 2; x++) {
    const i = z * W + x; if (kind[i]) continue;
    const s = surf[i], c = cellOf[i] >= 0 ? cells[cellOf[i]] : null, r = h2(x, z, 11), L = lot[i];
    let p = 0, big = true, cyp = 0.12;
    if (L === LOT_FOREST) { p = 0.085; cyp = 0.75; }
    else if (L === LOT_PARK) { p = 0.034; cyp = 0.4; }
    else if (L) p = 0;
    else if (s === GRASS && !zone[i]) { p = dSea[i] > 5 ? 0.024 + 0.045 * noise2(x / 20, z / 20, 5) : 0; cyp = 0.45; }
    else if (s === GRASS && c && c.used) { p = 0.04; big = false; }
    else if (s === GRASS) p = 0.05;
    else if (s === PAVE && street[i] && (x * 7 + z * 13) % 11 === 0) { p = 0.5; big = false; }
    else if (s === QUAY && dLag[i] > 2.5 && dLag[i] < 3.6 && (x + z) % 9 === 0) { p = 0.5; big = false; }
    if (r >= p || vox[vi(x, hgt[i], z)] || vox[vi(x, hgt[i] + 3, z)]) continue;
    const tr = rng(hashStr(x + "," + z));
    if (h2(x, z, 23) < cyp) cypress(x, hgt[i], z, tr); else tree(x, hgt[i], z, tr, big);
  }
  let n = 0; for (let i = 0; i < vox.length; i++) if (vox[i]) n++;
  world.blocks = n + (world.site ? world.site.n : 0);
}
