import { randomBytes } from "node:crypto";
export function createMediaRelay(onActive) {
  const key = randomBytes(32).toString("hex"),
    viewers = new Map();
  let producer = null,
    active = false;
  const send = (response, data) =>
    response?.write(`data: ${JSON.stringify(data)}\n\n`);
  const begin = (response) =>
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
  function reset(value) {
    active = value;
    onActive(value);
    for (const [id, response] of viewers) {
      send(response, { type: value ? "waiting" : "stopped" });
      if (value) send(producer, { type: "viewer", id });
    }
  }
  async function handle(req, res, url) {
    if (!url.pathname.startsWith("/media/")) return false;
    const authorized = req.headers["x-output-key"] === key;
    if (req.method === "GET" && url.pathname === "/media/producer") {
      if (!authorized) {
        res.writeHead(403).end();
        return true;
      }
      producer?.end();
      producer = res;
      begin(res);
      send(res, { type: "ready" });
      req.on("close", () => {
        if (producer === res) {
          producer = null;
          reset(false);
        }
      });
      return true;
    }
    if (req.method === "GET" && url.pathname === "/media/viewer") {
      const id = url.searchParams.get("id");
      if (
        !/^[a-f0-9-]{36}$/.test(id || "") ||
        (viewers.size >= 4 && !viewers.has(id))
      ) {
        res.writeHead(400).end();
        return true;
      }
      viewers.get(id)?.end();
      viewers.set(id, res);
      begin(res);
      send(res, { type: active ? "waiting" : "stopped" });
      if (active) send(producer, { type: "viewer", id });
      req.on("close", () => {
        if (viewers.get(id) === res) {
          viewers.delete(id);
          send(producer, { type: "leave", id });
        }
      });
      return true;
    }
    if (req.method === "POST" && url.pathname === "/media/signal") {
      if (
        !req.headers["content-type"]?.startsWith("application/json") ||
        !req.headers.origin
      ) {
        res.writeHead(403).end();
        return true;
      }
      let body = "",
        size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 150000) {
          res.writeHead(413).end();
          return true;
        }
        body += chunk;
      }
      const data = JSON.parse(body);
      if (data.type === "reset") {
        if (!authorized || !producer) {
          res.writeHead(403).end();
          return true;
        }
        reset(data.active === true);
        res.writeHead(204).end();
        return true;
      }
      if (
        !viewers.has(data.id) ||
        !data.description ||
        typeof data.description.sdp !== "string" ||
        data.description.sdp.length > 140000
      ) {
        res.writeHead(400).end();
        return true;
      }
      if (
        data.type === "offer" &&
        authorized &&
        data.description.type === "offer"
      )
        send(viewers.get(data.id), {
          type: "offer",
          description: data.description,
        });
      else if (
        data.type === "answer" &&
        data.description.type === "answer" &&
        producer
      )
        send(producer, {
          type: "answer",
          id: data.id,
          description: data.description,
        });
      else {
        res.writeHead(403).end();
        return true;
      }
      res.writeHead(204).end();
      return true;
    }
    res.writeHead(404).end();
    return true;
  }
  return {
    key,
    handle,
    close() {
      producer?.end();
      for (const response of viewers.values()) response.end();
      viewers.clear();
    },
  };
}
