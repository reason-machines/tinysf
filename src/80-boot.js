// ───────────────────────── start ─────────────────────────
const $ = (id) => document.getElementById(id);
async function boot() {
  if (!gl) throw new Error("this browser has WebGL2 turned off");
  const t0 = performance.now();
  world.seed = +(Q.get("seed") || 7);
  const img = new Image(); img.src = "data:image/png;base64," + MARK_PNG; await img.decode();
  for (const id of ["bugmark", "cmark", "hudmark"]) $(id).src = img.src;
  const mw = Math.round(img.width * MARK), mh = Math.round(img.height * MARK);
  const cv = document.createElement("canvas"); cv.width = mw; cv.height = mh; const cx = cv.getContext("2d", { willReadFrequently: true }); cx.imageSmoothingQuality = "high"; cx.drawImage(img, 0, 0, mw, mh);
  buildWorld(cx.getImageData(0, 0, mw, mh).data, mw, mh);
  world.mark = { w: mw, h: mh };
  // The film builds the unfinished tower on camera; on foot it is simply there, and solid.
  if (!FILM && world.site) { const l = world.site.blocksList; for (let k = 0; k < l.length; k += 3) setv(l[k], l[k + 1], l[k + 2], SITE); world.site = null; }
  const t1 = performance.now();
  const mesh = meshWorld();
  const t2 = performance.now();
  initGL(); G.worldVao = vao(mesh); if (world.site) G.siteVao = vao(meshSite(world.site));
  setupActors();
  // Fonts load before the first frame, and a font that fails stops the page
  // instead of letting a fallback face through.
  for (const [name, b64] of Object.entries(FONTS)) { const face = new FontFace(name, `url(data:font/woff2;base64,${b64}) format("woff2")`, { weight: "100 900" }); await face.load(); document.fonts.add(face); }
  await document.fonts.ready;
  drawActors(0);
  Object.assign(world.stats, { ms: { world: Math.round(t1 - t0), mesh: Math.round(t2 - t1) }, quads: mesh.nv / 4, blocks: world.blocks, corgis: actors.corgis.length, moving: actors.n,
    fonts: [...document.fonts].map((f) => f.family + ":" + f.status).join(",") });
  window.world = world;
  if (FILM) await startFilm(); else startWalk();
  $("loading").remove();
  window.READY = true;
}
boot().catch((e) => { window.ERROR = String((e && e.stack) || e); console.error(e); const l = $("loading"); if (l) { l.textContent = "tiny SF needs WebGL2 and could not start: " + ((e && e.message) || e); l.style.display = "flex"; } });
