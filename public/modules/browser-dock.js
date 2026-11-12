const docks = new Map();
let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    sync();
  });
}
function sync() {
  if (!window.browserDocks) return;
  const modal = !!document.querySelector("dialog[open]");
  const rectangles = [];
  for (const [id, entry] of docks) {
    const rect = entry.host.getBoundingClientRect();
    const visible =
      !modal &&
      !!entry.host.getClientRects().length &&
      !entry.host.closest(".editing");
    rectangles.push({
      id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      visible,
    });
  }
  window.browserDocks.layout(rectangles);
}
export function initDocks() {
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  document.addEventListener("page-changed", schedule);
  document.addEventListener("dock-layout", schedule);
  new MutationObserver(schedule).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "open", "class", "style"],
  });
  window.browserDocks?.onStatus((status) => {
    const entry = docks.get(status.id);
    if (!entry) return;
    if (status.url) {
      entry.address.value = status.url;
      document.dispatchEvent(
        new CustomEvent("dock-url", {
          detail: { id: status.id, url: status.url },
        }),
      );
    }
    entry.status.textContent = status.error || status.title || "Browser dock";
  });
}
export function mountBrowserDock(item, body) {
  body.classList.add("browser-widget");
  const toolbar = document.createElement("form");
  toolbar.className = "dock-toolbar";
  const address = document.createElement("input");
  address.value = item.url;
  address.setAttribute("aria-label", `URL for ${item.title}`);
  address.type = "url";
  address.required = true;
  const status = document.createElement("p");
  status.className = "dock-status";
  status.setAttribute("role", "status");
  status.textContent = window.browserDocks
    ? "Loading browser dock…"
    : "Browser docks are available in the Windows desktop app. Open with npm start.";
  for (const [action, label] of [
    ["back", "←"],
    ["forward", "→"],
    ["reload", "↻"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "dock-control";
    button.textContent = label;
    button.setAttribute("aria-label", `${action} ${item.title}`);
    button.onclick = () => window.browserDocks?.command(item.id, action);
    toolbar.append(button);
  }
  const go = document.createElement("button");
  go.className = "dock-control";
  go.textContent = "Go";
  toolbar.append(address, go);
  const host = document.createElement("div");
  host.className = "native-dock-host";
  host.textContent =
    "Your browser dock lives here. Finish editing to interact with it.";
  body.append(toolbar, status, host);
  docks.set(item.id, { host, address, status });
  const observer = new ResizeObserver(schedule);
  observer.observe(host);
  let disposed = false;
  window.browserDocks
    ?.create(item.id, item.url)
    .then((result) => {
      if (disposed) {
        window.browserDocks.remove(item.id);
        return;
      }
      if (!result.ok) status.textContent = result.error;
      schedule();
    })
    .catch(() => (status.textContent = "Could not open this browser dock."));
  toolbar.onsubmit = async (event) => {
    event.preventDefault();
    if (!window.browserDocks) return;
    const result = await window.browserDocks.command(
      item.id,
      "navigate",
      address.value,
    );
    if (!result.ok) status.textContent = result.error || "Could not navigate.";
  };
  schedule();
  return () => {
    disposed = true;
    observer.disconnect();
    docks.delete(item.id);
    window.browserDocks?.remove(item.id);
    schedule();
  };
}
