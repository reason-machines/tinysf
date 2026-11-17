// ───────────────────────── other people ─────────────────────────
// Online, once you walk in, the page keeps one WebSocket to the server it was loaded from. It
// says where you are ten times a second and hears where everyone else is, and
// it sets the island's clock from the server's, so the walkers, dogs, cars and
// gulls are in the same place for everybody. Opened as a file, or when the
// server cannot be reached, the island is simply yours alone.
const net = { ws: null, id: 0, on: false, offset: null, others: new Map(), name: "", look: null, island: null };
// The island's time in seconds: the server's clock when there is one (wrapped every two hours), else the page's own.
function worldClock(local) { return net.offset == null ? local : ((Date.now() + net.offset) / 1000) % 7200; }

function startNet(api) {
  const keep = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  let key = keep.get("tinysf.key");
  if (!key) { key = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join(""); keep.set("tinysf.key", key); }
  net.name = keep.get("tinysf.name") || ""; $("name").value = net.name;
  net.look = [0, 1, 2, 3, 4, 5].map((i) => parseInt(key.slice(i * 2, i * 2 + 2), 16) % [6, 12, 6, 6, 4, 4][i]); // until the server says
  const url = Q.get("server") || (location.protocol === "file:" ? null : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  const labels = $("labels"), log = $("log"), say = $("say"), who = $("people");
  const send = (m) => { if (net.on) try { net.ws.send(JSON.stringify(m)); } catch {} };

  // ───────────── what is on screen ─────────────
  const line = (name, text) => { const d = document.createElement("div"); if (name) { const b = document.createElement("b"); b.textContent = name + " "; d.appendChild(b); } d.appendChild(document.createTextNode(text)); log.appendChild(d); while (log.children.length > 7) log.firstChild.remove(); setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 900); }, 14000); };
  let lobby = ""; // how many are here, shown before you walk in
  const status = () => { const n = net.others.size + 1; $("online").textContent = !url ? "" : net.on ? (n === 1 ? "only you here right now" : `${n} people here`) : api.started() ? "offline · on your own" : lobby; who.style.display = net.others.size ? "" : "none"; };
  const listPeople = () => { who.length = 1; for (const o of net.others.values()) { const op = document.createElement("option"); op.value = o.id; op.textContent = o.name || "someone"; who.appendChild(op); } who.options[0].textContent = `People (${net.others.size})`; status(); };
  const other = (id) => { let o = net.others.get(id); if (!o) { o = { id, name: "", look: [0, 0, 0, 0, 0, 0], snaps: [], x: 0, y: 0, z: 0, yaw: 0, f: 0, ph: 0, walk: 0, wave: 0, said: "", saidAt: 0, el: document.createElement("div") }; o.el.className = "tag"; o.el.appendChild(document.createElement("i")); o.el.appendChild(document.createElement("span")); labels.appendChild(o.el); net.others.set(id, o); } return o; };
  const drop = (id) => { const o = net.others.get(id); if (o) { o.el.remove(); net.others.delete(id); } };

  // ───────────── the connection ─────────────
  let wait = 1500, sent = "", sentAt = 0, waving = 0;
  function connect() {
    let ws; try { ws = new WebSocket(url); } catch { return; }
    net.ws = ws;
    ws.onopen = () => { net.on = true; wait = 1500; ws.send(JSON.stringify({ t: "hi", key, name: net.name })); status(); };
    ws.onclose = () => { const was = net.on; net.on = false; net.id = 0; for (const id of [...net.others.keys()]) drop(id); listPeople(); if (was) line("", "lost the connection, trying again"); setTimeout(connect, wait); wait = Math.min(wait * 1.7, 20000); };
    ws.onerror = () => {};
    ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "s") {
        const off = m.now - Date.now(); net.offset = net.offset == null ? off : Math.max(off, net.offset - 0.05); // the least delayed message is the truest
        for (const [id, x, y, z, yaw, f] of m.p) { if (id === net.id) continue; const o = other(id); o.snaps.push({ now: m.now, x, y, z, yaw, f }); if (o.snaps.length > 12) o.snaps.shift(); }
      } else if (m.t === "welcome") {
        net.id = m.id; net.name = m.name; net.look = m.look; net.island = m.island; net.offset = m.now - Date.now();
        api.addFound(m.found);
        for (const p of m.players) { const o = other(p.id); o.name = p.name; o.look = p.look; o.snaps = [{ now: m.now, x: p.at[0], y: p.at[1], z: p.at[2], yaw: p.at[3], f: p.at[4] }]; }
        listPeople(); line("", `you are ${m.name}` + (m.island && m.island.visits ? ` · visit ${fmt(m.island.visits)} to the island` : ""));
      } else if (m.t === "join") { if (m.id === net.id) { net.name = m.name; net.look = m.look; return; } const o = other(m.id), fresh = !o.name; o.name = m.name; o.look = m.look; listPeople(); if (fresh) line("", `${m.name} arrived`); }
      else if (m.t === "leave") { const o = net.others.get(m.id); if (o && o.name) line("", `${o.name} left`); drop(m.id); listPeople(); }
      else if (m.t === "say") { const o = net.others.get(m.id); if (o) { o.said = m.text; o.saidAt = performance.now(); } line(m.id === net.id ? net.name : o ? o.name : "someone", m.text); }
      else if (m.t === "wave") { const o = net.others.get(m.id); if (o) o.wave = performance.now() + 2200; }
    };
  }
  setInterval(() => { // where I am, when it changed (and once a second regardless)
    if (!net.on || !net.id) return;
    const me = api.me, f = (me.fly ? 1 : 0) | (me.swim ? 2 : 0) | (performance.now() < waving ? 4 : 0), s = [me.x.toFixed(2), me.y.toFixed(2), me.z.toFixed(2), api.heading().toFixed(2), f].join();
    if (s === sent && performance.now() - sentAt < 1000) return;
    sent = s; sentAt = performance.now(); send({ t: "at", x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +api.heading().toFixed(2), f });
  }, 100);
  api.onFound = (mask) => send({ t: "found", found: mask });

  // ───────────── drawing them, and their name tags ─────────────
  let lastDraw = performance.now();
  actors.extra.push((t) => {
    const now = performance.now(), at = Date.now() + (net.offset || 0) - 150, me = api.me; lastDraw = now;
    if (me.third) drawHuman(me.x, me.y, me.z, api.heading(), t, net.look, { walk: api.stride(), ph: me.bob * 1.4, wave: now < waving });
    const VP = G.VP;
    for (const o of net.others.values()) {
      const S = o.snaps; if (!S.length) continue;
      if (Date.now() + (net.offset || 0) - S[S.length - 1].now > 6000) { o.el.style.display = "none"; continue; } // gone quiet
      let a = S[0], b = S[S.length - 1]; for (let i = S.length - 1; i > 0; i--) if (S[i - 1].now <= at) { a = S[i - 1]; b = S[i]; break; }
      const u = clamp((at - a.now) / Math.max(1, b.now - a.now), 0, 1), x = mix(a.x, b.x, u), y = mix(a.y, b.y, u), z = mix(a.z, b.z, u);
      const dyaw = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)), moved = Math.hypot(x - o.x, z - o.z);
      o.ph += Math.min(moved, 1) * 2.1; o.walk = mix(o.walk, moved > 0.004 && !(b.f & 3) ? 1 : 0, 0.2); o.x = x; o.y = y; o.z = z; o.yaw = a.yaw + dyaw * u; o.f = b.f;
      drawHuman(x, y, z, o.yaw, t, o.look, { walk: o.walk, ph: o.ph, wave: now < o.wave || (b.f & 4) > 0 });
      // the tag over their head
      const hx = x, hy = y + 2.15, hz = z, w = VP[3] * hx + VP[7] * hy + VP[11] * hz + VP[15], d = Math.hypot(x - me.x, z - me.z);
      if (w < 0.2 || d > 110) { o.el.style.display = "none"; continue; }
      const sx = ((VP[0] * hx + VP[4] * hy + VP[8] * hz + VP[12]) / w * 0.5 + 0.5) * innerWidth, sy = (0.5 - (VP[1] * hx + VP[5] * hy + VP[9] * hz + VP[13]) / w * 0.5) * innerHeight;
      const talking = o.said && now - o.saidAt < 7000;
      o.el.style.display = ""; o.el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-100%)`; o.el.style.opacity = d > 80 ? 0.5 : 1;
      if (o.el.firstChild.textContent !== (talking ? o.said : "")) o.el.firstChild.textContent = talking ? o.said : "";
      if (o.el.lastChild.textContent !== o.name) o.el.lastChild.textContent = o.name;
    }
  });

  // ───────────── saying things, meeting up ─────────────
  const openSay = () => { say.style.display = "block"; say.focus(); }, closeSay = () => { say.value = ""; say.style.display = "none"; say.blur(); };
  addEventListener("keydown", (e) => {
    if (e.code === "Enter" || e.code === "NumpadEnter") {
      if (document.activeElement === say) { const text = say.value.trim(); if (text) { if (net.on) send({ t: "say", text }); else line("", "nobody can hear you: you are offline"); } closeSay(); e.preventDefault(); }
      else if (document.activeElement === $("name")) { $("start").click(); }
      else if (api.started()) { openSay(); e.preventDefault(); }
    } else if (e.code === "Escape" && document.activeElement === say) closeSay();
    else if (e.code === "KeyG" && api.started() && !/INPUT|SELECT/.test(e.target.tagName)) wave();
  });
  const wave = () => { waving = performance.now() + 2200; send({ t: "wave" }); api.toast("you wave"); };
  $("saybtn").addEventListener("click", (e) => { api.begin(); openSay(); e.currentTarget.blur(); });
  $("wave").addEventListener("click", (e) => { api.begin(); wave(); e.currentTarget.blur(); });
  $("meet").addEventListener("click", async (e) => {
    e.currentTarget.blur(); api.begin();
    const me = api.me, link = `${location.origin}${location.pathname}?at=${Math.round(me.x)},${Math.round(me.z)}`;
    try { await navigator.clipboard.writeText(link); api.toast("link copied · whoever opens it lands right here"); } catch { line("", "send this link, and whoever opens it lands right here: " + link); }
  });
  who.addEventListener("change", () => { const o = net.others.get(+who.value); if (o) { api.begin(); api.near(o.x, o.z); api.toast("you are next to " + (o.name || "someone")); } who.value = ""; who.blur(); });
  // You join when you walk in, under the name typed on the first screen.
  api.onBegin = () => { const name = $("name").value.trim().slice(0, 18); if (name) { net.name = name; keep.set("tinysf.name", name); } status(); if (url && !net.ws) connect(); };
  status();
  if (url && !Q.get("server")) fetch("api/health").then((r) => r.json()).then((j) => { lobby = j.online ? `${j.online} ${j.online === 1 ? "person" : "people"} here now` : "nobody here yet"; status(); }).catch(() => {});
  window.net = net;
}
