import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../server.js";
test("local video signaling authenticates publishers and routes offers/answers without storing media", async (t) => {
  const app = await startServer({ port: 0 });
  const controllers = [];
  t.after(() => {
    controllers.forEach((controller) => controller.abort());
    app.close();
  });
  assert.equal((await fetch(app.url + "/media/producer")).status, 403);
  async function events(path, headers = {}) {
    const controller = new AbortController();
    controllers.push(controller);
    const response = await fetch(app.url + path, {
      headers,
      signal: controller.signal,
    });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    return {
      controller,
      read: async () => {
        const chunk = await reader.read();
        return new TextDecoder()
          .decode(chunk.value)
          .split("\n\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line.slice(6)));
      },
    };
  }
  const producer = await events("/media/producer", {
    "x-output-key": app.outputKey,
  });
  assert.equal((await producer.read())[0].type, "ready");
  const id = crypto.randomUUID(),
    viewer = await events("/media/viewer?id=" + id);
  assert.equal((await viewer.read())[0].type, "stopped");
  async function post(data, key) {
    return fetch(app.url + "/media/signal", {
      method: "POST",
      headers: {
        Origin: app.url,
        "Content-Type": "application/json",
        ...(key ? { "x-output-key": key } : {}),
      },
      body: JSON.stringify(data),
    });
  }
  assert.equal((await post({ type: "reset", active: true })).status, 403);
  assert.equal(
    (await post({ type: "reset", active: true }, app.outputKey)).status,
    204,
  );
  assert.equal((await viewer.read())[0].type, "waiting");
  assert.deepEqual((await producer.read())[0], { type: "viewer", id });
  assert.equal(
    (
      await post({
        type: "offer",
        id,
        description: { type: "offer", sdp: "fixture" },
      })
    ).status,
    403,
  );
  await post(
    { type: "offer", id, description: { type: "offer", sdp: "fixture" } },
    app.outputKey,
  );
  assert.equal((await viewer.read())[0].description.sdp, "fixture");
  await post({
    type: "answer",
    id,
    description: { type: "answer", sdp: "reply" },
  });
  assert.equal((await producer.read())[0].description.sdp, "reply");
  producer.controller.abort();
  assert.equal((await viewer.read())[0].type, "stopped");
});
