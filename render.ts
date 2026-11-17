// Renders the film in index.html to video by stepping it one frame at a time in headless
// Chromium (software WebGL, so it runs on a machine with no GPU).
//
//   bun render.ts --jobs 3              whole film -> out/tiny-sf.mp4
//   bun render.ts --frames 0,90,400     stills -> out/f0000.png ...
//   bun render.ts --frames mid          one still from the middle of every shot
//   bun render.ts --frames cuts         first and last frame of every shot
//   bun render.ts --range 300-420       part of the film
//   bun render.ts --shots out/x.json    scouting: [{ "name": "a", "js": "debugCam([...])" }]
//
//   --scale 0.75  draw the 3D picture at that share of 1080p (captions stay 1080p)
//   --msaa 0      no multisampling
//   --step 3      every third frame, played at the same speed (a motion preview)
//   --jobs 3      that many browsers at once; more than the CPU count is slower
//   --out <file>  name of the video
//   --walk        with --shots: load the walkable world instead of the film
//
// A film render is resumable: it is made in chunks of 48 frames kept under
// out/chunks, and a rerun draws only the chunks that are missing.
// Chunks are named after index.html's contents, so an edit starts afresh.
import { spawn } from "bun";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf("--" + name); return i >= 0 ? args[i + 1] : undefined; };
const outDir = resolve(arg("dir") ?? join(here, "out"));
const chunkDir = join(outDir, "chunks");
mkdirSync(chunkDir, { recursive: true });
const step = Number(arg("step") ?? 1);
const crf = arg("crf") ?? "15";
const film = readFileSync(join(here, "index.html"), "utf8");

type Chunk = [from: number, to: number];
const tag = createHash("sha1").update(film).update([arg("scale"), arg("msaa"), step, crf].join("|")).digest("hex").slice(0, 10);
const chunkFile = ([a, b]: Chunk) => join(chunkDir, `${tag}-${String(a).padStart(5, "0")}-${b}.mp4`);

// ───────────── the film: split into chunks, draw the missing ones, join ─────────────
if (!arg("shots") && !arg("frames") && !arg("chunks")) {
  // Frame count without a browser: the shot durations are in index.html.
  const total = [...film.matchAll(/\{ dur: (\d+),/g)].reduce((n, m) => n + Number(m[1]), 0);
  const [a, b] = (arg("range") ?? `0-${total - 1}`).split("-").map(Number) as [number, number];
  const out = resolve(arg("out") ?? join(outDir, "tiny-sf.mp4"));
  const jobs = Number(arg("jobs") ?? 1), size = Number(arg("chunk") ?? 48) * step;
  const chunks: Chunk[] = [];
  for (let f = a; f <= b; f += size) chunks.push([f, Math.min(b, f + size - 1)]);
  const missing = chunks.filter((c) => !existsSync(chunkFile(c)));
  console.log(`${chunks.length} chunks, ${missing.length} to draw (${tag})`);
  const pass = ["scale", "msaa", "crf", "step", "dir"].flatMap((k) => (arg(k) ? ["--" + k, arg(k)!] : []));
  const live = new Set<ReturnType<typeof spawn>>();
  const worker = async (j: number, mine: Chunk[]) => {
    if (!mine.length) return;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const p = spawn(["bun", import.meta.path, "--chunks", mine.map((c) => c.join("-")).join(","), ...pass], { stdout: "inherit", stderr: "inherit" });
      live.add(p);
      const code = await p.exited;
      live.delete(p);
      if (code === 0) return;
      console.error(`job ${j} failed, attempt ${attempt}`); // finished chunks are kept, so a retry resumes
    }
    for (const p of live) p.kill();
    process.exit(1);
  };
  const runs = [];
  for (let j = 0; j < jobs; j++) {
    runs.push(worker(j, missing.filter((_, i) => i % jobs === j)));
    await Bun.sleep(1500); // let each browser start before the next
  }
  await Promise.all(runs);
  const list = join(chunkDir, `${tag}.txt`);
  writeFileSync(list, chunks.map((c) => `file '${chunkFile(c)}'`).join("\n"));
  const code = await spawn(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out], { stdout: "inherit", stderr: "inherit" }).exited;
  if (code !== 0) process.exit(1);
  console.log("wrote", out);
  process.exit(0);
}

// ───────────── one browser ─────────────
const query = new URLSearchParams(args.includes("--walk") ? {} : { film: "1", hold: "1" }); // --walk: the walkable world, for --shots
if (arg("scale")) query.set("scale", arg("scale")!);
if (arg("msaa")) query.set("msaa", arg("msaa")!);
const port = 9300 + Math.floor(Math.random() * 600);
// A fresh profile each run: a lock left in a reused profile by a killed
// browser makes the next one hand over to a process that is gone, and exit.
const profile = mkdtempSync(join(tmpdir(), "tiny-sf-chrome-"));
const chrome = spawn([
  process.env.CHROME ?? "chromium", "--headless=new", "--no-sandbox", "--hide-scrollbars", "--mute-audio",
  "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
  "--force-device-scale-factor=1", "--window-size=1920,1080", "--force-color-profile=srgb",
  "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
], { stdout: "ignore", stderr: "ignore" });
const stop = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
const fail = (why: string): never => { console.error(why); stop(); process.exit(1); };
process.on("exit", stop);

let page: any;
for (let i = 0; i < 300 && !page; i++) {
  await Bun.sleep(200);
  try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t: any) => t.type === "page"); } catch {}
}
if (!page) fail("Chromium did not start");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onclose = () => fail("lost the browser");
let seq = 0;
const waiting = new Map<number, (v: any) => void>();
ws.onmessage = (m) => { const d = JSON.parse(String(m.data)); if (d.id && waiting.has(d.id)) { waiting.get(d.id)!(d); waiting.delete(d.id); } };
const send = (method: string, params: any = {}): Promise<any> => new Promise((res, rej) => {
  const id = ++seq;
  // A call that never answers fails the run instead of hanging it.
  const timer = setTimeout(() => fail(`${method} did not answer in 180 s`), 180_000);
  waiting.set(id, (d) => { clearTimeout(timer); d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result); });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression: string) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const shot = async () => Buffer.from((await send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true })).data, "base64");

await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await send("Page.enable");
await send("Page.navigate", { url: `file://${join(here, "index.html")}?${query}` });
for (let i = 0; ; i++) {
  await Bun.sleep(250);
  const state = await evaluate("window.ERROR ? 'ERR ' + window.ERROR : window.READY ? 'ok' : ''").catch(() => "");
  if (state === "ok") break;
  if (state.startsWith("ERR")) fail(state);
  if (i > 480) fail("index.html did not become ready");
}
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";

if (arg("shots")) {
  for (const s of JSON.parse(readFileSync(arg("shots")!, "utf8"))) {
    const v = await evaluate(s.js);
    if (v !== undefined && v !== null) console.log(s.name, "=>", v);
    writeFileSync(join(outDir, `${s.name}.png`), await shot());
    console.log(s.name, secs());
  }
} else if (arg("frames")) {
  console.log(await evaluate("JSON.stringify(world.stats)"));
  const durs: number[] = JSON.parse(await evaluate("JSON.stringify(SHOTS.map(s => s.dur))"));
  const starts = durs.map((_, i) => durs.slice(0, i).reduce((x, y) => x + y, 0));
  const spec = arg("frames")!;
  const list = spec === "mid" ? starts.map((s, i) => s + Math.floor(durs[i]! / 2)) : spec === "cuts" ? starts.flatMap((s, i) => [s, s + durs[i]! - 1]) : spec.split(",").map(Number);
  for (const f of list) {
    await evaluate(`seek(${f})`);
    writeFileSync(join(outDir, `f${String(f).padStart(4, "0")}.png`), await shot());
    console.log("frame", f, secs());
  }
} else {
  const chunks = arg("chunks")!.split(",").map((c) => c.split("-").map(Number) as Chunk);
  let done = 0;
  for (const c of chunks) {
    const file = chunkFile(c);
    if (existsSync(file)) continue;
    const tmp = join(chunkDir, `tmp-${process.pid}-${c[0]}.mp4`);
    const ff = spawn(["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", String(30 / step), "-c:v", "png", "-i", "-",
      "-c:v", "libx264", "-preset", "medium", "-crf", crf, "-pix_fmt", "yuv420p",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", tmp], { stdin: "pipe", stdout: "inherit", stderr: "inherit" });
    for (let f = c[0]; f <= c[1]; f += step) {
      await evaluate(`seek(${f})`);
      ff.stdin.write(await shot());
      await ff.stdin.flush();
      done++;
    }
    await ff.stdin.end();
    if ((await ff.exited) !== 0) fail("ffmpeg failed on " + file);
    renameSync(tmp, file); // only a finished chunk gets its name
    console.log(`chunk ${c[0]}-${c[1]}  ${secs()}  ${((Date.now() - t0) / 1000 / done).toFixed(2)}s/frame`);
  }
}
ws.onclose = null; ws.close(); stop(); process.exit(0);
