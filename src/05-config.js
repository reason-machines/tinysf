// ───────────────────────── modes ─────────────────────────
//   (nothing)      walk around: spawn somewhere on the island
//   ?film          play the 40 s film
//   ?film&hold     draw nothing until seek(frame) is called (render.ts)
//   ?film&frame=N  hold one frame of the film
//   ?scale=0.5     film: draw the 3D picture at half of 1080p
//   ?msaa=0        no multisampling
//   ?seed=N        another arrangement of the ordinary buildings
const FPS = 30;
const Q = new URLSearchParams(location.search);
const FILM = Q.has("film");
const SCALE = parseFloat(Q.get("scale") || "1");
const MSAA = Q.get("msaa") === "0" ? 0 : 4;
