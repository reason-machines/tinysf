// ───────────────────────── on foot ─────────────────────────
// The same world, walked: you are dropped somewhere at random. Blocks are
// solid, leaves are not, the sea holds you up, and a one-block step is climbed
// without jumping, because the whole island is made of one-block steps.
function startWalk() {
  const SOFT = new Set([LEAF_A, LEAF_B, LEAF_C, CYPRESS, PALM]);
  const solid = (x, y, z) => { const m = getv(Math.floor(x), Math.floor(y), Math.floor(z)); return m !== 0 && !SOFT.has(m); };
  const R = 0.3, TALL = 1.8, EYE = 1.62, WALK = 5.6, RUN = 10, FLY = 26, GRAV = 27, JUMP = 8.6;
  const me = { x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, ground: false, swim: false, fly: false, third: false, lift: 0, bob: 0, pace: 0 };
  const api = { me, onFound: null, onBegin: null }; // what the multiplayer part (75-net.js) is given
  const free = (x, y, z) => {
    for (let yy = Math.floor(y + 0.001); yy <= Math.floor(y + TALL); yy++) for (let zz = Math.floor(z - R); zz <= Math.floor(z + R); zz++) for (let xx = Math.floor(x - R); xx <= Math.floor(x + R); xx++) if (solid(xx, yy, zz)) return false;
    return true;
  };
  const slide = (dx, dz) => {
    const step = me.swim ? 1.6 : 1.02;
    for (const [ax, az] of [[dx, 0], [0, dz]]) {
      if (!ax && !az) continue;
      if (free(me.x + ax, me.y, me.z + az)) { me.x += ax; me.z += az; }
      else if ((me.ground || me.swim) && free(me.x, me.y + step, me.z) && free(me.x + ax, me.y + step, me.z + az)) { me.x += ax; me.z += az; me.y += step; me.lift -= step; }
    }
  };
  const fall = (dy) => {
    if (free(me.x, me.y + dy, me.z)) { me.y += dy; me.ground = false; return; }
    if (dy < 0) { me.y = Math.floor(me.y + dy + 1e-6) + 1; me.ground = true; }
    me.vy = 0;
  };

  // ───────────── where you can be put down ─────────────
  const spots = [], OPEN = new Set([ASPHALT, PAVE, LAWN, GRASS, SAND, QUAY]);
  for (let z = 4; z < D - 4; z += 2) for (let x = 4; x < W - 4; x += 2) {
    const i = z * W + x; if (world.kind[i] || !OPEN.has(world.surf[i])) continue;
    const h = world.hgt[i]; if (free(x + 0.5, h, z + 0.5) && !solid(x + 0.5, h + 3, z + 0.5)) spots.push([x + 0.5, h, z + 0.5]);
  }
  const facing = (x, z) => Math.atan2(x - me.x, -(z - me.z));
  const putAt = (s, lookX, lookZ) => { me.x = s[0]; me.y = s[1]; me.z = s[2]; me.vy = 0; me.lift = 0; me.fly = false; me.yaw = facing(lookX, lookZ); me.pitch = 0.06; $("fly").textContent = "Fly"; };
  const near = (x, z) => { let best = spots[0], bd = 1e9; for (const s of spots) { const d = Math.abs(Math.hypot(s[0] - x, s[2] - z) - 2.5) + Math.random(); if (d < bd) { bd = d; best = s; } } putAt(best, x, z); }; // a free spot a couple of steps from a point
  const spawn = () => { const s = spots[Math.floor(Math.random() * spots.length)], B = world.plan.bridge; putAt(s, 240, Math.abs(s[2] - B.z) < 30 ? 215 : B.z); };
  // Go to a place: stand back from it, at a spot with open ground between you and it.
  const goTo = (p) => {
    const want = clamp(p.r * 0.9, 16, 26); let best = null, bd = 1e9;
    for (const sp of spots) {
      const dx = p.x - sp[0], dz = p.z - sp[2], d = Math.hypot(dx, dz); let cost = Math.abs(d - want);
      if (cost > 6) continue;
      for (let k = 1; k <= 9; k++) if (solid(sp[0] + (dx / d) * k, sp[1] + 1.6, sp[2] + (dz / d) * k)) { cost += 30 - k; break; }
      if (cost < bd) { bd = cost; best = sp; }
    }
    if (!best) for (const sp of spots) { const d = Math.hypot(sp[0] - p.x, sp[2] - p.z); if (d < bd) { bd = d; best = sp; } }
    putAt(best, p.x, p.z); hud();
  };

  // ───────────── light ─────────────
  const SKY = [["day", 205, "noon"], ["gold", 250, "golden hour"], ["karl", 205, "Karl the Fog"], ["dusk", 236, "dusk"], ["noon", 150, "high noon"]];
  let sky = Math.random() < 0.5 ? 0 : 1;

  // ───────────── picture size: as many pixels as the machine keeps up with ─────────────
  let quality = 1, refl = true, raised = 0;
  const resize = () => { const dpr = Math.min(devicePixelRatio || 1, 2); let w = innerWidth * dpr * quality, h = innerHeight * dpr * quality; const k = Math.sqrt(2.6e6 / (w * h)); if (k < 1) { w *= k; h *= k; } sizeTargets(w, h); };
  resize(); addEventListener("resize", resize);

  // ───────────── controls ─────────────
  const keys = new Set(); let started = false, dragging = false;
  const stick = { id: null, x0: 0, y0: 0, dx: 0, dz: 0 }, lookTouch = { id: null, x: 0, y: 0 };
  const turn = (dx, dy, k = 0.0023) => { me.yaw += dx * k; me.pitch = clamp(me.pitch - dy * k, -1.5, 1.5); };
  const toast = (s) => { const t = $("toast"); t.textContent = s; t.style.opacity = 1; clearTimeout(toast.h); toast.h = setTimeout(() => (t.style.opacity = 0), 2200); };
  const lock = () => { try { const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} }; // where the page may not hold the pointer, dragging looks around instead
  const start = () => { if (started) return; started = true; $("start").style.display = "none"; window.focus(); if (api.onBegin) api.onBegin(); };
  const act = { respawn: () => { spawn(); toast("somewhere else"); }, sky: () => { sky = (sky + 1) % SKY.length; toast(SKY[sky][2]); }, third: () => { me.third = !me.third; toast(me.third ? "over the shoulder" : "through your eyes"); }, fly: () => { me.fly = !me.fly; me.vy = 0; $("fly").textContent = me.fly ? "Walk" : "Fly"; toast(me.fly ? "flying · space up · C down" : "on foot"); } };
  $("start").addEventListener("click", (e) => { if (e.target.id === "name") return; start(); if (e.pointerType !== "touch") lock(); });
  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT/.test(e.target.tagName) || e.code === "Enter" || e.code === "Escape") return; // typing a name or a message is not walking
    start(); keys.add(e.code);
    if (e.code === "KeyR") act.respawn(); else if (e.code === "KeyT") act.sky(); else if (e.code === "KeyF") act.fly(); else if (e.code === "KeyV") act.third();
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  });
  addEventListener("keyup", (e) => keys.delete(e.code)); addEventListener("blur", () => keys.clear());
  canvas.addEventListener("mousedown", () => { start(); dragging = true; if (document.pointerLockElement !== canvas) lock(); });
  addEventListener("mouseup", () => (dragging = false));
  addEventListener("mousemove", (e) => { if (document.pointerLockElement === canvas || dragging) turn(e.movementX, e.movementY); });
  for (const id of ["respawn", "sky", "fly", "third"]) $(id).addEventListener("click", (e) => { start(); act[id](); e.currentTarget.blur(); });
  const sel = $("jumpto"); for (const p of world.places) { const o = document.createElement("option"); o.textContent = p.name; o.value = p.name; sel.appendChild(o); }
  sel.addEventListener("change", () => { const p = world.places.find((q) => q.name === sel.value); if (p) { start(); goTo(p); } sel.value = ""; sel.blur(); });
  // touch: left thumb moves, the rest of the screen looks
  addEventListener("touchstart", (e) => { document.body.classList.add("touch"); if (e.target.closest && e.target.closest("#bar")) return; start();
    for (const t of e.changedTouches) { if (e.target.id === "jump") keys.add("Space"); else if (t.clientX < innerWidth * 0.42 && t.clientY > innerHeight * 0.4 && stick.id === null) { stick.id = t.identifier; stick.x0 = t.clientX; stick.y0 = t.clientY; } else if (lookTouch.id === null) { lookTouch.id = t.identifier; lookTouch.x = t.clientX; lookTouch.y = t.clientY; } } }, { passive: true });
  addEventListener("touchmove", (e) => { for (const t of e.changedTouches) {
    if (t.identifier === stick.id) { const dx = clamp((t.clientX - stick.x0) / 46, -1, 1), dz = clamp((t.clientY - stick.y0) / 46, -1, 1); stick.dx = dx; stick.dz = dz; $("stick").firstElementChild.style.transform = `translate(${dx * 30}px,${dz * 30}px)`; }
    else if (t.identifier === lookTouch.id) { turn(t.clientX - lookTouch.x, t.clientY - lookTouch.y, 0.0052); lookTouch.x = t.clientX; lookTouch.y = t.clientY; } } }, { passive: true });
  const touchEnd = (e) => { for (const t of e.changedTouches) { if (t.identifier === stick.id) { stick.id = null; stick.dx = stick.dz = 0; $("stick").firstElementChild.style.transform = ""; } if (t.identifier === lookTouch.id) lookTouch.id = null; } if (e.target.id === "jump") keys.delete("Space"); };
  addEventListener("touchend", touchEnd); addEventListener("touchcancel", touchEnd);

  // ───────────── a step of time ─────────────
  const found = new Set();
  const mask = () => { let m = 0; for (const i of found) m |= 1 << i; return m; };
  function step(dt, t) {
    const k = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0);
    let f = k("KeyW", "ArrowUp") - k("KeyS", "ArrowDown") - stick.dz, s = k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft") + stick.dx;
    const len = Math.hypot(f, s); if (len > 1) { f /= len; s /= len; }
    const sy = Math.sin(me.yaw), cy = Math.cos(me.yaw), fast = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const sea = G.waterY - 1.3;
    if (me.fly) {
      const v = FLY * (fast ? 2.4 : 1), cp = Math.cos(me.pitch);
      me.x += (sy * cp * f + cy * s) * v * dt; me.z += (-cy * cp * f + sy * s) * v * dt;
      me.y += (Math.sin(me.pitch) * f + (keys.has("Space") ? 1 : 0) - (keys.has("KeyC") ? 1 : 0)) * v * dt;
      me.y = clamp(me.y, G.waterY - 1, 400); me.swim = false; me.ground = false;
    } else {
      const v = (me.swim ? 3.4 : fast ? RUN : WALK), mx = (sy * f + cy * s) * v * dt, mz = (-cy * f + sy * s) * v * dt;
      const n = Math.max(1, Math.ceil(Math.hypot(mx, mz) / 0.2));
      for (let i = 0; i < n; i++) slide(mx / n, mz / n);
      if (keys.has("Space") && me.ground) { me.vy = JUMP; me.ground = false; }
      me.vy -= GRAV * dt; fall(clamp(me.vy * dt, -0.9, 0.9));
      me.swim = me.y <= sea + 0.02;
      if (me.y < sea) { me.y = sea; me.vy = 0; }
      if (me.ground && len > 0.1) me.bob += dt * v * 1.5;
      me.pace = mix(me.pace, me.ground && len > 0.1 ? 1 : 0, 0.2);
    }
    me.x = clamp(me.x, -160, W + 160); me.z = clamp(me.z, -160, D + 160);
    me.lift *= Math.exp(-dt * 13);
    // the corgis you have met
    for (let i = 0; i < actors.corgis.length; i++) { const c = actors.corgis[i]; if (!found.has(i) && c.x != null && Math.hypot(c.x - me.x, c.z - me.z) < 3.2 && Math.abs(groundF(c.x, c.z) - me.y) < 4) { found.add(i); if (api.onFound) api.onFound(mask()); toast(found.size === actors.corgis.length ? "that is every corgi on the island" : `a corgi · ${found.size} of ${actors.corgis.length}`); } }
  }
  function hud() {
    let best = "", br = 1e9; for (const p of world.places) if (Math.hypot(p.x - me.x, p.z - me.z) < p.r && p.r < br) { br = p.r; best = p.name; } // the smallest place you are inside
    const on = !world.kind[clamp(Math.round(me.z), 0, D - 1) * W + clamp(Math.round(me.x), 0, W - 1)] || me.fly;
    $("place").textContent = best || (on ? "" : "the Bay"); $("corgis").textContent = `corgis found ${found.size}/${actors.corgis.length}`;
  }
  const camera = () => {
    const cp = Math.cos(me.pitch), y = me.y + EYE + me.lift + (me.swim ? Math.sin(performance.now() / 600) * 0.06 : me.third ? 0 : Math.sin(me.bob) * 0.035);
    const d = [Math.sin(me.yaw) * cp, Math.sin(me.pitch), -Math.cos(me.yaw) * cp];
    if (!me.third) return { pos: [me.x, y, me.z], at: [me.x + d[0], y + d[1], me.z + d[2]], fov: 64, near: 0.16 };
    let back = 5.5; for (let k = 0.5; k <= 5.5; k += 0.5) if (solid(me.x - d[0] * k, y + 0.5 - d[1] * k, me.z - d[2] * k)) { back = k - 0.5; break; } // not through walls
    return { pos: [me.x - d[0] * back, y + 0.5 - d[1] * back, me.z - d[2] * back], at: [me.x + d[0] * 6, y + d[1] * 6, me.z + d[2] * 6], fov: 64, near: 0.16 };
  };

  spawn();
  { const at = (Q.get("at") || "").split(",").map(Number); if (at.length === 2 && at.every(Number.isFinite)) near(clamp(at[0], 0, W), clamp(at[1], 0, D)); } // a meet-here link
  Object.assign(api, { toast, near, started: () => started, begin: start, heading: () => me.yaw - Math.PI / 2, stride: () => me.pace,
    addFound: (m) => { for (let i = 0; i < actors.corgis.length; i++) if (m & (1 << i)) found.add(i); } });
  startNet(api);
  const t0 = performance.now(); let last = t0, slow = 0, count = 0, frames = 0;
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000), t = worldClock((now - t0) / 1000);
    if (now - last < 250) { slow += now - last; count++; } // a pause (another tab, a menu) says nothing about speed
    last = now;
    if (count >= 40) { // keep it smooth: fewer pixels first, then no reflections. Before drawing, because a resize clears the picture.
      const ms = slow / count; slow = 0; count = 0;
      if (ms > 30 && quality > 0.42) { quality *= 0.8; resize(); } else if (ms > 30 && refl) refl = false;
      else if (ms < 11 && quality < 1 && raised < 3) { quality = Math.min(1, quality * 1.15); raised++; resize(); }
    }
    step(dt, t);
    drawFrame(camera(), light(SKY[sky][0], SKY[sky][1]), t, { noRefl: !refl });
    if (frames++ % 2 === 0) hud();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.walk = { me, goTo, spawn, near, act, advance: (s) => { for (let i = 0; i < s / 0.02; i++) step(0.02, 0); hud(); }, // for tests: time without waiting for frames
    spots: spots.length, state: () => ({ x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), ground: me.ground, swim: me.swim, quality, refl, size: [RW, RH], place: $("place").textContent }) };
}
