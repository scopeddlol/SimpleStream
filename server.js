import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  defaultLayout,
  neutralPose,
  validateState,
} from "./public/avatar-state.js";
import { createMediaRelay } from "./media-relay.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".wasm": "application/wasm",
  ".task": "application/octet-stream",
};
export async function startServer({ port = 32145 } = {}) {
  const clients = new Set();
  let state = {
    avatar: null,
    pose: { ...neutralPose },
    layout: { ...defaultLayout },
    outputMode: "avatar",
  };
  const relay = createMediaRelay((active) => {
    state.outputMode = active ? "lens" : "avatar";
    for (const client of clients)
      client.write(
        "data: " +
          JSON.stringify({
            pose: state.pose,
            layout: state.layout,
            outputMode: state.outputMode,
          }) +
          "\n\n",
      );
  });
  let origin;
  const server = http.createServer(async (req, res) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval' https://cf-st.sc-cdn.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.sc-cdn.net https://*.snapar.com https://*.snapchat.com; connect-src 'self' https://*.snapar.com https://*.snapchat.com https://*.snapkit.com https://*.sc-cdn.net; worker-src 'self' blob:; media-src 'self' blob:; frame-src https://snap.com https://*.snap.com https://*.snapchat.com; object-src 'none'; frame-ancestors 'none'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      res.writeHead(403).end();
      return;
    }
    try {
      const url = new URL(req.url, origin);
      if (await relay.handle(req, res, url)) return;
      if (req.method === "GET" && url.pathname === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(`data: ${JSON.stringify(state)}\n\n`);
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }
      if (req.method === "POST" && url.pathname === "/state") {
        if (
          req.headers.origin !== origin ||
          !req.headers["content-type"]?.startsWith("application/json")
        ) {
          res.writeHead(403).end();
          return;
        }
        let body = "",
          bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 6_000_000) {
            res.writeHead(413).end();
            return;
          }
          body += chunk;
        }
        const input = JSON.parse(body);
        const next = validateState(state, input);
        state = next;
        const update = {
          pose: state.pose,
          layout: state.layout,
          outputMode: state.outputMode,
          ...(input.avatar !== undefined ? { avatar: state.avatar } : {}),
        };
        for (const client of clients) {
          if (client.writableLength > 6_000_000) {
            client.end();
            clients.delete(client);
            continue;
          }
          client.write(`data: ${JSON.stringify(update)}\n\n`);
        }
        res.writeHead(204).end();
        return;
      }
      if (req.method !== "GET") {
        res.writeHead(405).end();
        return;
      }
      let base = path.join(root, "public");
      let relative = decodeURIComponent(
        url.pathname === "/" ? "/index.html" : url.pathname,
      );
      if (relative.startsWith("/vendor/")) {
        base = path.join(root, "node_modules/@mediapipe/tasks-vision");
        relative = relative.slice("/vendor".length);
      }
      const target = path.resolve(base, `.${relative}`);
      if (!target.startsWith(`${base}${path.sep}`)) {
        res.writeHead(403).end();
        return;
      }
      const data = await readFile(target);
      res
        .writeHead(200, {
          "Content-Type":
            mime[path.extname(target)] || "application/octet-stream",
        })
        .end(data);
    } catch (error) {
      res
        .writeHead(error.code === "ENOENT" ? 404 : 400)
        .end("Request could not be processed");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    url: origin,
    outputKey: relay.key,
    close: () => {
      relay.close();
      for (const client of clients) client.end();
      server.close();
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const local = await startServer();
  console.log(
    `SimpleStream: ${local.url}\nOBS avatar: ${local.url}/overlay.html`,
  );
}
