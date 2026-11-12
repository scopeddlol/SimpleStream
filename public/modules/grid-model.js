export const types = ["avatar", "chat", "alerts", "viewers", "browser"];
export const titles = {
  avatar: "Avatar preview",
  chat: "Combined chat",
  alerts: "Alert list",
  viewers: "Current viewers",
  browser: "Browser dock",
};
export const uid = () => crypto.randomUUID();
export function overlaps(a, b) {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}
export function firstSpace(widget, others) {
  for (let y = 1; y < 500; y++)
    for (let x = 1; x <= 13 - widget.w; x++) {
      const candidate = { ...widget, x, y };
      if (!others.some((item) => overlaps(candidate, item))) return candidate;
    }
  throw Error("This page is full. Create another page for more elements.");
}
export function arrange(widgets, priority) {
  const ordered = priority
    ? [priority, ...widgets.filter((item) => item.id !== priority.id)]
    : widgets;
  const placed = [];
  for (const item of ordered) {
    const candidate = {
      ...item,
      x: Math.max(1, Math.min(13 - item.w, item.x)),
    };
    placed.push(
      placed.some((other) => overlaps(candidate, other))
        ? firstSpace(candidate, placed)
        : candidate,
    );
  }
  return widgets.map((item) => placed.find((other) => other.id === item.id));
}
export function sanitizePages(input) {
  const ids = new Set(),
    widgetIds = new Set();
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, 24)
    .filter((page) => {
      if (
        !page ||
        typeof page.id !== "string" ||
        !/^(hub|[a-f0-9-]{36})$/.test(page.id) ||
        ids.has(page.id) ||
        typeof page.name !== "string" ||
        !Array.isArray(page.widgets)
      )
        return false;
      ids.add(page.id);
      return true;
    })
    .map((page) => ({
      id: page.id,
      name: page.name.trim().slice(0, 40) || "Untitled page",
      widgets: arrange(
        page.widgets
          .slice(0, 30)
          .filter((item) => {
            if (
              !item ||
              !types.includes(item.type) ||
              typeof item.id !== "string" ||
              !/^[a-f0-9-]{36}$/.test(item.id) ||
              widgetIds.has(item.id)
            )
              return false;
            widgetIds.add(item.id);
            return true;
          })
          .map((item) => ({
            id: item.id,
            type: item.type,
            title:
              typeof item.title === "string"
                ? item.title.slice(0, 40)
                : titles[item.type],
            url: typeof item.url === "string" ? item.url.slice(0, 2048) : "",
            x: bound(item.x, 1, 12, 1),
            y: bound(item.y, 1, 480, 1),
            w: bound(item.w, 2, 12, 6),
            h: bound(item.h, 3, 12, 6),
            layouts: sanitizeLayouts(item.layouts),
          })),
      ),
    }));
}
function bound(value, min, max, fallback) {
  return Number.isInteger(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
function sanitizeLayouts(input) {
  const result = {};
  for (const mode of ["portrait", "compact"]) {
    const value = input?.[mode];
    if (
      !value ||
      !["x", "y", "w", "h"].every((key) => Number.isInteger(value[key]))
    )
      continue;
    const w = bound(value.w, 2, 12, 12);
    result[mode] = {
      x: Math.min(bound(value.x, 1, 12, 1), 13 - w),
      y: bound(value.y, 1, 480, 1),
      w,
      h: bound(value.h, 2, 12, 6),
    };
  }
  return result;
}
