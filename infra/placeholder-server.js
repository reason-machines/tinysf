// Stand-in for dist/server.js with the same contract, so the stack can be
// proven before the real server exists. Run by bun on the instance.
//   GET /api/health -> 200 JSON
//   GET /           -> index.html from STATIC_DIR
//   /ws             -> WebSocket, echoes every message
const PORT = Number(process.env.PORT || 8080);
const STATIC_DIR = process.env.STATIC_DIR || import.meta.dir;
const started = Date.now();

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  fetch(req, server) {
    const { pathname } = new URL(req.url);
    if (pathname === "/ws") {
      if (server.upgrade(req)) return;
      return new Response("expected a websocket upgrade", { status: 426 });
    }
    if (pathname === "/api/health") {
      return Response.json({
        ok: true,
        placeholder: true,
        table: process.env.TABLE ?? null,
        region: process.env.AWS_REGION ?? null,
        uptime_s: Math.round((Date.now() - started) / 1000),
      });
    }
    if (pathname === "/" || pathname === "/index.html") {
      return new Response(Bun.file(`${STATIC_DIR}/index.html`), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    return new Response("not found", { status: 404 });
  },
  websocket: {
    message(ws, message) {
      ws.send(message);
    },
  },
});

console.log(`tiny-sf placeholder listening on :${PORT}, static ${STATIC_DIR}`);
