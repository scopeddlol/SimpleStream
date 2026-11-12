import { test } from "node:test";
import assert from "node:assert/strict";
import {
  arrange,
  overlaps,
  firstSpace,
  sanitizePages,
} from "../public/modules/grid-model.js";
import policy from "../dock-policy.cjs";
test("moving or resizing a widget preserves its requested placement and relocates collisions", () => {
  const original = [
    { id: "a", x: 1, y: 1, w: 6, h: 4 },
    { id: "b", x: 7, y: 1, w: 6, h: 4 },
    { id: "c", x: 1, y: 5, w: 6, h: 4 },
  ];
  const moved = { ...original[0], x: 7, y: 1 };
  const result = arrange([moved, ...original.slice(1)], moved);
  assert.deepEqual(result[0], moved);
  for (let i = 0; i < result.length; i++)
    for (let j = i + 1; j < result.length; j++)
      assert.equal(overlaps(result[i], result[j]), false);
  assert.equal(arrange([{ id: "a", x: 12, y: 1, w: 6, h: 4 }])[0].x, 7);
  assert.equal(firstSpace({ w: 6, h: 4 }, original).y, 5);
});
test("saved pages are bounded and malformed or duplicate widgets are rejected", () => {
  const id = "01234567-0123-0123-0123-012345678901";
  const pages = sanitizePages([
    {
      id: "hub",
      name: "Hub",
      widgets: [
        { id, type: "chat", x: -9, y: 0, w: 50, h: 1 },
        { id, type: "chat" },
      ],
    },
    { id: "hub", name: "Duplicate", widgets: [] },
    { id: "../escape", name: "Bad", widgets: [] },
  ]);
  assert.equal(pages.length, 1);
  assert.equal(pages[0].widgets.length, 1);
  assert.equal(pages[0].widgets[0].w, 12);
  assert.equal(pages[0].widgets[0].x, 1);
  assert.deepEqual(sanitizePages({}), []);
});
test("browser docks accept secure websites and local tools but reject app origin and privileged schemes", () => {
  const origin = "http://127.0.0.1:32145";
  for (const url of [
    "file:///C:/secret",
    "javascript:alert(1)",
    "data:text/html,hi",
    `${origin}/`,
    "https://user:password@example.com",
    "http://example.com",
  ])
    assert.equal(policy.dockUrl(url, origin), null);
  assert.equal(
    policy.dockUrl("https://example.com", origin),
    "https://example.com/",
  );
  assert.equal(
    policy.dockUrl("http://localhost:8080/chat", origin),
    "http://localhost:8080/chat",
  );
});
