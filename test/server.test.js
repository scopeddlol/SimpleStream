import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../server.js";
test("serves the studio and OBS output, validates updates and rejects foreign origins", async (t) => {
  const app = await startServer({ port: 0 });
  t.after(() => app.close());
  assert.equal((await fetch(app.url)).status, 200);
  assert.equal((await fetch(`${app.url}/overlay.html`)).status, 200);
  assert.equal(
    (
      await fetch(`${app.url}/events`, {
        headers: { Origin: "https://example.com" },
      })
    ).status,
    403,
  );
  const post = (body) =>
    fetch(`${app.url}/state`, {
      method: "POST",
      headers: { Origin: app.url, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal((await post({ pose: { mouth: 0.6 } })).status, 204);
  assert.equal(
    (await post({ avatar: "data:image/svg+xml;base64,PHN2Zz4=" })).status,
    400,
  );
  assert.equal((await post({ pose: { mouth: 4 } })).status, 400);
  const controller = new AbortController();
  const events = await fetch(`${app.url}/events`, {
    signal: controller.signal,
  });
  const reader = events.body.getReader();
  const initial = new TextDecoder().decode((await reader.read()).value);
  assert.equal(JSON.parse(initial.slice(6)).pose.mouth, 0.6);
  await post({ pose: { mouth: 0.2 } });
  const update = new TextDecoder().decode((await reader.read()).value);
  assert.equal(JSON.parse(update.slice(6)).pose.mouth, 0.2);
  controller.abort();
});
