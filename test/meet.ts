// Two people on the island at once: opens the page in two headless browsers,
// puts them next to each other, has one talk and the other wave, and checks
// that each sees the other. Screenshots go to out/meet-a.png and out/meet-b.png.
//
//   bun server/server.ts &          then:  bun test/meet.ts http://localhost:4173
//   bun test/meet.ts https://<the deployed site>
//
// Software WebGL, so no GPU is needed (and it is slow: about a frame a second).
import { spawn } from "bun";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const here = dirname(new URL(import.meta.url).pathname), out = join(here, "..", "out");
mkdirSync(out, { recursive: true });
const site = (process.argv[2] ?? "http://localhost:4173").replace(/\/$/, "");
const fail = (why: string): never => { console.error("FAIL", why); for (const c of clients) c.stop(); process.exit(1); };
type Client = { name: string; evaluate: (js: string) => Promise<any>; shot: (file: string) => Promise<void>; stop: () => void };
const clients: Client[] = [];

async function open(name: string): Promise<Client> {
  const port = 9300 + Math.floor(Math.random() * 600), profile = mkdtempSync(join(tmpdir(), "tiny-sf-meet-"));
  const chrome = spawn([process.env.CHROME ?? "chromium", "--headless=new", "--no-sandbox", "--hide-scrollbars", "--mute-audio", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
    "--force-device-scale-factor=1", "--window-size=1280,720", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    ...(process.env.CHROME_PROXY ? [`--proxy-server=${process.env.CHROME_PROXY}`] : []), // a proxy Chromium can use without a password
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdout: "ignore", stderr: "ignore" });
  const stop = () => { try { chrome.kill(); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };
  let page: any;
  for (let i = 0; i < 150 && !page; i++) { await Bun.sleep(200); try { page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t: any) => t.type === "page"); } catch {} }
  if (!page) { stop(); fail("Chromium did not start"); }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let seq = 0; const waiting = new Map<number, (v: any) => void>();
  ws.onmessage = (m) => { const d = JSON.parse(String(m.data)); if (d.id && waiting.has(d.id)) { waiting.get(d.id)!(d); waiting.delete(d.id); } };
  const call = (method: string, params: any = {}): Promise<any> => new Promise((res, rej) => { const id = ++seq; waiting.set(id, (d) => (d.error ? rej(new Error(method + ": " + d.error.message)) : res(d.result))); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression: string) => { const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(name + ": " + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)); return r.result.value; };
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await call("Page.enable"); await call("Page.navigate", { url: site + "/" });
  for (let i = 0; ; i++) { await Bun.sleep(250); const s = await evaluate("window.ERROR ? 'ERR ' + window.ERROR : window.READY ? 'ok' : ''").catch(() => ""); if (s === "ok") break; if (s.startsWith("ERR")) fail(name + " " + s); if (i > 240) fail(name + ": the page did not become ready (is " + site + " reachable from here?)"); }
  const c: Client = { name, evaluate, stop, shot: async (file) => writeFileSync(join(out, file), Buffer.from((await call("Page.captureScreenshot", { format: "png" })).data, "base64")) };
  clients.push(c); return c;
}
const until = async (c: Client, what: string, js: string, seconds = 30) => { for (let i = 0; i < seconds * 4; i++) { if (await c.evaluate(js)) return; await Bun.sleep(250); } fail(`${c.name}: ${what}`); };

// Other people may be on the island too, so each looks the other up by name.
const other = (name: string) => `[...net.others.values()].find(o => o.name === '${name}')`;
const [a, b] = await Promise.all([open("A"), open("B")]);
await a.evaluate(`document.getElementById('name').value='Ada'; document.getElementById('start').click()`);
await b.evaluate(`document.getElementById('name').value='Bo'; document.getElementById('start').click()`);
await until(a, "never got an id from the server", "net.id > 0"); await until(b, "never got an id from the server", "net.id > 0");
// A stands on Alamo Square; B opens A's meet-here spot and looks at A.
await a.evaluate(`walk.goTo(world.places.find(p => p.name === 'Alamo Square')); walk.me.yaw += 0.5; 1`);
const spot = await a.evaluate(`JSON.stringify([walk.me.x, walk.me.z])`);
await b.evaluate(`(() => { const [x, z] = ${spot}; walk.near(x, z); 1 })()`);
await until(a, "does not see B", `(${other("Bo")}?.snaps.length ?? 0) > 2`);
await until(b, "does not see A", `(${other("Ada")}?.snaps.length ?? 0) > 2`);
const face = (name: string) => `(() => { const q = ${other(name)}, o = q.snaps[q.snaps.length - 1], me = walk.me; me.yaw = Math.atan2(o.x - me.x, -(o.z - me.z)); me.pitch = Math.atan2(o.y + 1.3 - (me.y + 1.62), Math.hypot(o.x - me.x, o.z - me.z)); return Math.hypot(o.x - me.x, o.z - me.z).toFixed(1); })()`;
await Bun.sleep(1500);
const dA = await a.evaluate(face("Bo")), dB = await b.evaluate(face("Ada"));
await b.evaluate(`document.getElementById('saybtn').click(); document.getElementById('say').value = 'hello from the other browser'; 1`);
if ((await b.evaluate(`document.activeElement && document.activeElement.id`)) !== "say") fail("B: the Say button did not open the message box");
await b.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); 1`);
await a.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyG' })); 1`);
await until(a, "did not hear B", `${other("Bo")}?.said === 'hello from the other browser'`);
await until(b, "did not see A wave", `${other("Ada")}?.wave > 0`);
await Bun.sleep(3000); // a few frames, so both pictures show it
const see = `JSON.stringify({ me: net.name, id: net.id, online: document.getElementById('online').textContent, sees: [...net.others.values()].map(o => ({ name: o.name, x: +o.x.toFixed(1), z: +o.z.toFixed(1), said: o.said, tag: o.el.style.display !== 'none' })), log: [...document.getElementById('log').children].map(d => d.textContent), clock: +worldClock(0).toFixed(1) })`;
const sa = JSON.parse(await a.evaluate(see)), sb = JSON.parse(await b.evaluate(see));
await a.shot("meet-a.png"); await b.shot("meet-b.png");
console.log("A", JSON.stringify(sa)); console.log("B", JSON.stringify(sb));
console.log(`distance apart: A measures ${dA}, B measures ${dB}; island clocks differ by ${Math.abs(sa.clock - sb.clock).toFixed(2)} s`);
if (!sa.sees.some((o: any) => o.name === "Bo") || !sb.sees.some((o: any) => o.name === "Ada")) fail("names did not arrive");
if (Math.abs(sa.clock - sb.clock) > 1.5) fail("the two clocks disagree");
for (const c of clients) c.stop();
console.log("PASS: two browsers on " + site + " see each other, by name, and heard and saw each other");
process.exit(0);
