// ───────────────────────── meshing ─────────────────────────
// Greedy quads per face direction. A face with any ambient occlusion on a
// corner is kept as its own quad so the corner shading stays per block.
function meshWorld() {
  const pos = [], info = [], index = [];
  let nv = 0;
  const dims = [W, H, D];
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && vox[(y * D + z) * W + x] !== 0;
  let top = 0; for (let y = H - 1; y > 0 && !top; y--) { const o = y * D * W; for (let i = 0; i < W * D; i++) if (vox[o + i]) { top = y; break; } }
  const YMAX = top + 2;
  // direction: axis d and sign, with in-plane axes u,v
  const dirs = [[0, 1, 0], [0, -1, 1], [1, 1, 2], [1, -1, 3], [2, 1, 4], [2, -1, 5]];
  for (const [d, sgn, nidx] of dirs) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const U = u === 1 ? YMAX : dims[u], V = v === 1 ? YMAX : dims[v], Dn = d === 1 ? YMAX : dims[d];
    const mask = new Int32Array(U * V);
    const p = [0, 0, 0], q = [0, 0, 0];
    for (p[d] = 0; p[d] < Dn; p[d]++) {
      let any = false;
      for (p[v] = 0; p[v] < V; p[v]++) for (p[u] = 0; p[u] < U; p[u]++) {
        const m = vox[(p[1] * D + p[2]) * W + p[0]]; let key = 0;
        if (m && p[1] >= SEA - 1 && !(d === 1 && sgn < 0 && p[1] <= SEA)) {
          q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[d] += sgn;
          if (!solid(q[0], q[1], q[2])) {
            let ao = 0;
            for (let c = 0; c < 4; c++) {
              const du = c & 1 ? 1 : -1, dv = c & 2 ? 1 : -1;
              const a = [q[0], q[1], q[2]], b = [q[0], q[1], q[2]], cc = [q[0], q[1], q[2]];
              a[u] += du; b[v] += dv; cc[u] += du; cc[v] += dv;
              const s1 = solid(a[0], a[1], a[2]) ? 1 : 0, s2 = solid(b[0], b[1], b[2]) ? 1 : 0, s3 = solid(cc[0], cc[1], cc[2]) ? 1 : 0;
              ao |= (s1 && s2 ? 0 : 3 - s1 - s2 - s3) << (c * 2);
            }
            key = m | (ao << 8); any = true;
          }
        }
        mask[p[v] * U + p[u]] = key;
      }
      if (!any) continue;
      for (let j = 0; j < V; j++) for (let i = 0; i < U;) {
        const key = mask[j * U + i]; if (!key) { i++; continue; }
        let w = 1, h = 1;
        if (key >> 8 === 255) {
          while (i + w < U && mask[j * U + i + w] === key) w++;
          outer: for (; j + h < V; h++) for (let k = 0; k < w; k++) if (mask[(j + h) * U + i + k] !== key) break outer;
        }
        for (let b = 0; b < h; b++) for (let a = 0; a < w; a++) mask[(j + b) * U + i + a] = 0;
        const m = key & 255, ao = key >> 8;
        const base = [0, 0, 0]; base[d] = p[d] + (sgn > 0 ? 1 : 0); base[u] = i; base[v] = j;
        const corner = (cu, cv) => { const c = [base[0], base[1], base[2]]; c[u] += cu * w; c[v] += cv * h; pos.push(c[0], c[1], c[2]); info.push(nidx, m, (ao >> ((cu | (cv << 1)) * 2)) & 3, 0); };
        corner(0, 0); corner(1, 0); corner(1, 1); corner(0, 1);
        const a00 = ao & 3, a10 = (ao >> 2) & 3, a01 = (ao >> 4) & 3, a11 = (ao >> 6) & 3;
        const flip = a00 + a11 < a10 + a01;
        const tri = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
        if (sgn > 0) for (let k = 0; k < 6; k++) index.push(nv + tri[k]); else for (let k = 5; k >= 0; k--) index.push(nv + tri[k]);
        nv += 4; i += w;
      }
    }
  }
  return { pos: new Float32Array(pos), info: new Uint8Array(info), index: new Uint32Array(index), idx: null, nv };
}
// The tower under construction: every block as its own cube, numbered in
// build order, so the shader can show the first n blocks.
function meshSite(b) {
  const pos = [], info = [], idx = [], index = []; let nv = 0;
  const F = [[[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]], [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]];
  const L = b.blocksList;
  for (let k = 0; k < L.length; k += 3) for (let f = 0; f < 6; f++) {
    for (const c of F[f]) { pos.push(L[k] + c[0], L[k + 1] + c[1], L[k + 2] + c[2]); info.push(f, b.mat, 3, 1); idx.push(k / 3); }
    index.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3); nv += 4;
  }
  return { pos: new Float32Array(pos), info: new Uint8Array(info), idx: new Float32Array(idx), index: new Uint32Array(index), nv };
}

