import { test } from "node:test";
import assert from "node:assert/strict";
import {
  layoutMode,
  responsiveWidgets,
  saveResponsiveLayout,
  rowHeight,
} from "../public/modules/responsive-grid.js";
import { overlaps } from "../public/modules/grid-model.js";
const widgets = [
  { id: "a", type: "viewers", x: 1, y: 1, w: 12, h: 3 },
  { id: "b", type: "chat", x: 1, y: 4, w: 7, h: 7 },
  { id: "c", type: "alerts", x: 8, y: 4, w: 5, h: 7 },
];
test("monitor orientation changes the profile even on a 1080px-wide portrait screen", () => {
  assert.equal(layoutMode(1920, 1080), "landscape");
  assert.equal(layoutMode(1080, 1920), "portrait");
  assert.equal(layoutMode(720, 1280), "portrait");
  assert.equal(layoutMode(480, 800), "compact");
  assert.deepEqual(responsiveWidgets(widgets, "landscape"), widgets);
  for (const mode of ["portrait", "compact"]) {
    const result = responsiveWidgets(widgets, mode);
    assert.equal(result.length, 3);
    assert.ok(result.every((item) => item.x === 1 && item.w === 12));
    for (let i = 0; i < result.length; i++)
      for (let j = i + 1; j < result.length; j++)
        assert.equal(overlaps(result[i], result[j]), false);
  }
});
test("portrait edits persist independently and switching back restores the original desktop grid", () => {
  const portrait = responsiveWidgets(widgets, "portrait");
  portrait[1].h = 7;
  portrait[2].y = 11;
  const saved = saveResponsiveLayout(widgets, portrait, "portrait");
  assert.deepEqual(
    saved.map(({ x, y, w, h }) => ({ x, y, w, h })),
    widgets.map(({ x, y, w, h }) => ({ x, y, w, h })),
  );
  assert.equal(responsiveWidgets(saved, "portrait")[1].h, 7);
  assert.equal(responsiveWidgets(saved, "portrait")[2].y, 11);
  assert.deepEqual(
    responsiveWidgets(saved, "landscape").map(({ x, y, w, h }) => ({
      x,
      y,
      w,
      h,
    })),
    widgets.map(({ x, y, w, h }) => ({ x, y, w, h })),
  );
});
test("row scaling fits normal pages but preserves readable panels when many elements require scrolling", () => {
  const value = rowHeight(widgets, 700);
  assert.ok(value * 10 + 9 * 16 <= 700);
  assert.equal(rowHeight([{ y: 1, h: 50 }], 300), 44);
  assert.equal(rowHeight(widgets, 300, true), 48);
});
