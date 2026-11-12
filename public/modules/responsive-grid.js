import { arrange, firstSpace } from "./grid-model.js";

export function layoutMode(width, height) {
  if (width < 700) return "compact";
  return width < 1180 || height > width * 1.15 ? "portrait" : "landscape";
}

export function responsiveWidgets(widgets, mode) {
  if (mode === "landscape") return widgets.map((item) => ({ ...item }));
  const ordered = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed = [];
  for (const item of ordered) {
    const heights =
      mode === "compact"
        ? { viewers: 3, chat: 7, alerts: 5, avatar: 6, browser: 7 }
        : { viewers: 3, chat: 6, alerts: 4, avatar: 5, browser: 6 };
    const saved = item.layouts?.[mode];
    const next = saved
      ? { ...item, ...saved }
      : firstSpace({ ...item, w: 12, h: heights[item.type] || 6 }, placed);
    placed.push(next);
  }
  const resolved = arrange(placed);
  return widgets.map((item) => resolved.find((other) => other.id === item.id));
}

export function saveResponsiveLayout(widgets, rectangles, mode) {
  return widgets.map((item) => {
    const rectangle = rectangles.find((other) => other.id === item.id);
    if (!rectangle) return item;
    const { x, y, w, h } = rectangle;
    return mode === "landscape"
      ? { ...item, x, y, w, h }
      : { ...item, layouts: { ...item.layouts, [mode]: { x, y, w, h } } };
  });
}

export function rowHeight(widgets, availableHeight, editing = false) {
  const rows = Math.max(1, ...widgets.map((item) => item.y + item.h - 1));
  // Scroll once the minimum readable panel height is reached. Never squash chat
  // controls to make an arbitrarily large workspace fit on one screen.
  return Math.floor(
    Math.max(
      editing ? 48 : 44,
      Math.min(100, (availableHeight - (rows - 1) * 16) / rows),
    ),
  );
}
