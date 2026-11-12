import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
    pose: { mouth: 0, left: 0, right: 0, roll: 0 },
    layout: { eyesY: 43, mouthY: 65, spacing: 20, size: 100 },
  };
  let origin;
  const server = http.createServer(async (req, res) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'",
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
        const next = structuredClone(state);
        if (input.avatar !== undefined) {
          if (
            input.avatar !== null &&
            !(
              typeof input.avatar === "string" &&
              /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.avatar)
            )
          )
            throw Error("PNG required");
          next.avatar = input.avatar;
        }
        for (const [key, ranges] of Object.entries({
          pose: {
            mouth: [0, 1],
            left: [0, 1],
            right: [0, 1],
            roll: [-0.5, 0.5],
          },
          layout: {
            eyesY: [10, 80],
            mouthY: [20, 90],
            spacing: [5, 40],
            size: [50, 130],
          },
        })) {
          if (input[key])
            for (const [name, [min, max]] of Object.entries(ranges)) {
              const value = input[key][name];
              if (value !== undefined) {
                if (!Number.isFinite(value) || value < min || value > max)
                  throw Error("Invalid value");
                next[key][name] = value;
              }
            }
        }
        state = next;
        const update = {
          pose: state.pose,
          layout: state.layout,
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
    close: () => {
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
