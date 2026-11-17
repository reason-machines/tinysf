// tiny SF's server: serves index.html, relays where everyone is over one
// WebSocket, and keeps players' names, looks and corgi counts in DynamoDB.
//
//   bun server/server.ts                       local: no database, memory only
//   PORT=8080 TABLE=tiny-sf AWS_REGION=us-west-2 bun server.js   deployed
//
// There is no sign-in. A browser makes itself a random key, keeps it in
// localStorage and sends it on joining; the key is the whole account.
// Chat is relayed to people nearby and never stored.
import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const here = dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.PORT ?? 4173);
const TABLE = process.env.TABLE ?? "";
const REGION = process.env.AWS_REGION ?? "us-west-2";
const STATIC = [process.env.STATIC_DIR, here, join(here, "..")].filter(Boolean).map((d) => join(d!, "index.html")).find((f) => existsSync(f));
const MAX_PLAYERS = 150, MAX_PER_ADDRESS = 8, TICK_MS = 100, HEAR = 48, LOOKS = [6, 12, 6, 6, 4, 4];
const started = Date.now();

// ───────────── database: DynamoDB over its JSON API, signed here (no SDK) ─────────────
const memory = new Map<string, any>(); // used when there is no TABLE
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (k: string | Buffer, s: string) => createHmac("sha256", k).update(s).digest();
let cached: { id: string; secret: string; token?: string; exp: number } | null = null;
async function credentials() {
  if (cached && cached.exp - Date.now() > 5 * 60_000) return cached;
  if (process.env.AWS_ACCESS_KEY_ID) return (cached = { id: process.env.AWS_ACCESS_KEY_ID, secret: process.env.AWS_SECRET_ACCESS_KEY!, token: process.env.AWS_SESSION_TOKEN, exp: Infinity });
  const meta = "http://169.254.169.254/latest/"; // the instance's role
  const t = await (await fetch(meta + "api/token", { method: "PUT", headers: { "X-aws-ec2-metadata-token-ttl-seconds": "21600" } })).text();
  const h = { "X-aws-ec2-metadata-token": t };
  const role = (await (await fetch(meta + "meta-data/iam/security-credentials/", { headers: h })).text()).trim();
  const c: any = await (await fetch(meta + "meta-data/iam/security-credentials/" + role, { headers: h })).json();
  return (cached = { id: c.AccessKeyId, secret: c.SecretAccessKey, token: c.Token, exp: Date.parse(c.Expiration) });
}
async function dynamo(op: string, body: object): Promise<any> {
  const c = await credentials(), host = `dynamodb.${REGION}.amazonaws.com`, payload = JSON.stringify(body);
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ""), date = amz.slice(0, 8);
  const headers: Record<string, string> = { "content-type": "application/x-amz-json-1.0", host, "x-amz-date": amz, "x-amz-target": "DynamoDB_20120810." + op };
  if (c.token) headers["x-amz-security-token"] = c.token;
  const names = Object.keys(headers).sort(), signed = names.join(";");
  const canonical = ["POST", "/", "", names.map((n) => `${n}:${headers[n]}\n`).join(""), signed, sha(payload)].join("\n");
  const scope = `${date}/${REGION}/dynamodb/aws4_request`;
  const key = ["dynamodb", "aws4_request"].reduce((k, s) => hmac(k, s), hmac(hmac("AWS4" + c.secret, date), REGION));
  const signature = createHmac("sha256", key).update(["AWS4-HMAC-SHA256", amz, scope, sha(canonical)].join("\n")).digest("hex");
  delete headers.host;
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${c.id}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  const res = await fetch(`https://${host}/`, { method: "POST", headers, body: payload, signal: AbortSignal.timeout(4000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`dynamodb ${op} ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}
type Profile = { name: string; look: number[]; found: number; visits: number };
const db = {
  ok: true, lastError: "",
  async player(hash: string): Promise<Profile | null> {
    if (!TABLE) return memory.get(hash) ?? null;
    const r = await dynamo("GetItem", { TableName: TABLE, Key: { pk: { S: "player" }, sk: { S: hash } } });
    const i = r.Item; if (!i) return null;
    return { name: i.name?.S ?? "", look: JSON.parse(i.look?.S ?? "[]"), found: Number(i.found?.N ?? 0), visits: Number(i.visits?.N ?? 0) };
  },
  async save(hash: string, p: Profile) {
    if (!TABLE) return void memory.set(hash, { ...p });
    await dynamo("PutItem", { TableName: TABLE, Item: { pk: { S: "player" }, sk: { S: hash }, name: { S: p.name }, look: { S: JSON.stringify(p.look) }, found: { N: String(p.found) }, visits: { N: String(p.visits) }, seen: { N: String(Math.floor(Date.now() / 1000)) } } });
  },
  // Counts a visit and returns the island's totals.
  async visit(online: number): Promise<{ visits: number; peak: number }> {
    if (!TABLE) { const s = memory.get("stat") ?? { visits: 0, peak: 0 }; s.visits++; s.peak = Math.max(s.peak, online); memory.set("stat", s); return s; }
    const r = await dynamo("UpdateItem", { TableName: TABLE, Key: { pk: { S: "stat" }, sk: { S: "world" } }, UpdateExpression: "ADD visits :one", ExpressionAttributeValues: { ":one": { N: "1" } }, ReturnValues: "ALL_NEW" });
    let peak = Number(r.Attributes?.peak?.N ?? 0);
    if (online > peak) { peak = online; await dynamo("UpdateItem", { TableName: TABLE, Key: { pk: { S: "stat" }, sk: { S: "world" } }, UpdateExpression: "SET peak = :p", ConditionExpression: "attribute_not_exists(peak) OR peak < :p", ExpressionAttributeValues: { ":p": { N: String(online) } } }).catch(() => {}); }
    return { visits: Number(r.Attributes?.visits?.N ?? 0), peak };
  },
};
const tryDb = async <T>(what: string, f: () => Promise<T>, fallback: T): Promise<T> => { try { const v = await f(); db.ok = true; return v; } catch (e) { db.ok = false; db.lastError = `${what}: ${String(e).slice(0, 160)}`; console.error(db.lastError); return fallback; } };

// ───────────── people ─────────────
type Player = { id: number; hash: string; address: string; name: string; look: number[]; found: number; visits: number; x: number; y: number; z: number; yaw: number; flags: number; joined: boolean; said: number; moved: number; count: number; dirty: boolean };
const players = new Map<any, Player>();
let nextId = 1;
const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);
const lookOf = (v: unknown, seed: string) => LOOKS.map((n, i) => (Array.isArray(v) && Number.isInteger(v[i]) && v[i] >= 0 && v[i] < n ? v[i] : parseInt(seed.slice(i * 2, i * 2 + 2), 16) % n));
const ADJ = ["foggy", "sunny", "tiny", "golden", "salty", "sleepy", "breezy", "steep", "pastel", "sourdough"], NOUN = ["corgi", "gull", "sea lion", "pelican", "cable car", "burrito", "robotaxi", "founder", "barista", "skater"];
const nameOf = (seed: string) => `${ADJ[parseInt(seed.slice(20, 24), 16) % ADJ.length]} ${NOUN[parseInt(seed.slice(24, 28), 16) % NOUN.length]}`;
const send = (ws: any, m: object) => { try { ws.send(JSON.stringify(m)); } catch {} };
const everyone = (m: object, but?: any) => { const s = JSON.stringify(m); for (const [ws, p] of players) if (p.joined && ws !== but) try { ws.send(s); } catch {} };
const pub = (p: Player) => ({ id: p.id, name: p.name, look: p.look });
const online = () => { let n = 0; for (const p of players.values()) if (p.joined) n++; return n; };

async function arrive(ws: any, p: Player, m: any) {
  const key = clean(m.key, 80);
  if (key.length < 16) return ws.close(1008, "key");
  p.hash = sha("tiny-sf:" + key);
  const saved = await tryDb("load player", () => db.player(p.hash), null);
  p.name = clean(m.name, 18) || saved?.name || nameOf(p.hash);
  p.look = lookOf(m.look ?? saved?.look, p.hash);
  p.found = saved?.found ?? 0; p.visits = (saved?.visits ?? 0) + 1;
  if (!players.has(ws)) return; // left while the database answered
  p.joined = true;
  const stat = await tryDb("count visit", () => db.visit(online()), { visits: 0, peak: 0 });
  send(ws, { t: "welcome", id: p.id, name: p.name, look: p.look, found: p.found, visits: p.visits, now: Date.now(), island: stat, db: TABLE ? db.ok : null,
    players: [...players.values()].filter((q) => q.joined && q !== p).map((q) => ({ ...pub(q), at: [q.x, q.y, q.z, q.yaw, q.flags] })) });
  everyone({ t: "join", ...pub(p) }, ws);
  p.dirty = true;
}
function message(ws: any, raw: string | Buffer) {
  const p = players.get(ws); if (!p) return;
  if (typeof raw !== "string" || raw.length > 600) return;
  let m: any; try { m = JSON.parse(raw); } catch { return; }
  if (!m || typeof m !== "object") return;
  if (++p.count > 60) return; // per second, reset by the tick
  if (m.t === "hi") { if (!p.joined && !p.hash) { p.hash = "pending"; arrive(ws, p, m).catch((e) => console.error("arrive", e)); } return; }
  if (!p.joined) return;
  if (m.t === "at") { p.x = num(m.x, -200, 700); p.y = num(m.y, 0, 420); p.z = num(m.z, -200, 700); p.yaw = num(m.yaw, -1e4, 1e4); p.flags = num(m.f, 0, 255) | 0; p.moved = Date.now(); }
  else if (m.t === "say") {
    const text = clean(m.text, 140), now = Date.now(); if (!text || now - p.said < 700) return; p.said = now;
    const s = JSON.stringify({ t: "say", id: p.id, text });
    for (const [w, q] of players) if (q.joined && Math.hypot(q.x - p.x, q.z - p.z) <= HEAR) try { w.send(s); } catch {}
  } else if (m.t === "me") { // a new name or look
    const name = clean(m.name, 18); if (name) p.name = name;
    if (m.look) p.look = lookOf(m.look, p.hash);
    p.dirty = true; everyone({ t: "join", ...pub(p) });
  } else if (m.t === "found") { const f = num(m.found, 0, 0xffff) | 0; if (f !== p.found) { p.found = f; p.dirty = true; } }
  else if (m.t === "wave") everyone({ t: "wave", id: p.id }, ws);
}
// Ten times a second, tell everyone where everyone is.
setInterval(() => {
  const now = Date.now(), list: number[][] = [];
  for (const p of players.values()) { p.count = Math.max(0, p.count - 6); if (p.joined) list.push([p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), p.flags]); }
  if (list.length) everyone({ t: "s", now, p: list });
}, TICK_MS);
// Every few seconds, write down what changed.
setInterval(() => { for (const p of players.values()) if (p.joined && p.dirty) { p.dirty = false; tryDb("save player", () => db.save(p.hash, p), undefined); } }, 5000);

// ───────────── http ─────────────
let page: { at: number; body: Uint8Array } | null = null;
const index = () => { if (!STATIC) return null; const at = statSync(STATIC).mtimeMs; if (!page || page.at !== at) page = { at, body: readFileSync(STATIC) }; return page.body; };
const server = Bun.serve({
  port: PORT, hostname: "0.0.0.0",
  fetch(req, srv) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const address = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || srv.requestIP(req)?.address || "?";
      let same = 0; for (const p of players.values()) if (p.address === address) same++;
      if (players.size >= MAX_PLAYERS || same >= MAX_PER_ADDRESS) return new Response("the island is full, try again in a minute", { status: 503 });
      return srv.upgrade(req, { data: { address } }) ? undefined : new Response("expected a WebSocket", { status: 400 });
    }
    if (url.pathname === "/api/health") return Response.json({ ok: true, online: online(), uptime: Math.round((Date.now() - started) / 1000), database: TABLE ? (db.ok ? "ok" : db.lastError) : "memory only" }, { headers: { "cache-control": "no-store" } });
    if (url.pathname === "/" || url.pathname === "/index.html") { const body = index(); return body ? new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } }) : new Response("index.html is missing: run bun build.ts", { status: 500 }); }
    return new Response("not found", { status: 404 });
  },
  websocket: {
    maxPayloadLength: 2048, idleTimeout: 60,
    open(ws) { players.set(ws, { id: nextId++, hash: "", address: (ws.data as any).address, name: "", look: [], found: 0, visits: 0, x: 0, y: 0, z: 0, yaw: 0, flags: 0, joined: false, said: 0, moved: 0, count: 0, dirty: false }); },
    message,
    close(ws) { const p = players.get(ws); players.delete(ws); if (p?.joined) { everyone({ t: "leave", id: p.id }); tryDb("save player", () => db.save(p.hash, p), undefined); } },
  },
});
console.log(`tiny SF on http://localhost:${server.port}  (database: ${TABLE || "none, memory only"}; page: ${STATIC ?? "missing"})`);
