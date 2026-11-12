const { ipcMain, WebContentsView, View, session } = require("electron");
const { dockUrl } = require("./dock-policy.cjs");
function installBrowserDocks(window, origin) {
  const docks = new Map();
  const trusted = (event) =>
    event.sender === window.webContents &&
    event.senderFrame?.url?.startsWith(`${origin}/`);
  const validId = (id) => typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
  const notify = (id, status) => {
    if (!window.isDestroyed())
      window.webContents.send("dock:status", { id, ...status });
  };
  const remove = (id) => {
    const entry = docks.get(id);
    if (!entry) return;
    window.contentView.removeChildView(entry.container);
    entry.view.webContents.close();
    docks.delete(id);
  };
  ipcMain.handle("dock:create", async (event, input) => {
    if (!trusted(event) || !input || !validId(input.id))
      return { ok: false, error: "Invalid dock request." };
    const url = dockUrl(input.url, origin);
    if (!url) return { ok: false, error: "This URL is not supported." };
    if (docks.has(input.id)) return { ok: true };
    if (docks.size >= 12)
      return {
        ok: false,
        error:
          "Up to 12 browser docks can be open. Remove a dock before adding another.",
      };
    const partition = `persist:dock-${input.id}`,
      guestSession = session.fromPartition(partition);
    guestSession.setPermissionRequestHandler((contents, permission, callback) =>
      callback(false),
    );
    guestSession.setPermissionCheckHandler(() => false);
    guestSession.on("will-download", (event) => event.preventDefault());
    // A remote dock must never contact the local app server, even via subresources.
    guestSession.webRequest.onBeforeRequest((details, callback) => {
      let blocked = false;
      try {
        const target = new URL(details.url);
        blocked =
          target.port === new URL(origin).port &&
          ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
      } catch {}
      callback({ cancel: blocked });
    });
    const container = new View(),
      view = new WebContentsView({
        webPreferences: {
          partition,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          backgroundThrottling: true,
        },
      });
    container.addChildView(view);
    container.setVisible(false);
    window.contentView.addChildView(container);
    docks.set(input.id, { container, view });
    view.setBackgroundColor("#11151d");
    const contents = view.webContents;
    contents.setWindowOpenHandler(() => {
      notify(input.id, {
        error:
          "This site requested a pop-up. Pop-up windows are not supported in docks.",
      });
      return { action: "deny" };
    });
    for (const name of ["will-navigate", "will-redirect"])
      contents.on(name, (event, target) => {
        if (!dockUrl(target, origin)) {
          event.preventDefault();
          notify(input.id, {
            error: "Navigation to this address was blocked.",
          });
        }
      });
    contents.on("did-navigate", (_, target) =>
      notify(input.id, { url: target, error: "" }),
    );
    contents.on("did-finish-load", () =>
      notify(input.id, {
        url: contents.getURL(),
        title: contents.getTitle(),
        error: "",
      }),
    );
    contents.on("did-fail-load", (_, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3)
        notify(input.id, { error: `Could not load this dock: ${description}` });
    });
    contents.on("render-process-gone", () =>
      notify(input.id, {
        error: "This dock stopped. Use Reload to try again.",
      }),
    );
    contents
      .loadURL(url)
      .catch((error) => notify(input.id, { error: error.message }));
    return { ok: true };
  });
  ipcMain.on("dock:layout", (event, input) => {
    if (!trusted(event) || !Array.isArray(input) || input.length > 12) return;
    const visible = new Set();
    const [width, height] = window.getContentSize();
    for (const rect of input) {
      const entry = docks.get(rect?.id);
      if (
        !entry ||
        !["x", "y", "width", "height"].every(
          (key) => Number.isFinite(rect[key]) && Math.abs(rect[key]) < 100000,
        )
      )
        continue;
      const left = Math.max(0, Math.round(rect.x)),
        top = Math.max(82, Math.round(rect.y)),
        right = Math.min(width, Math.round(rect.x + rect.width)),
        bottom = Math.min(height, Math.round(rect.y + rect.height));
      if (!rect.visible || right <= left || bottom <= top) continue;
      entry.container.setBounds({
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      });
      entry.view.setBounds({
        x: Math.round(rect.x) - left,
        y: Math.round(rect.y) - top,
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      });
      entry.container.setVisible(true);
      visible.add(rect.id);
    }
    for (const [id, entry] of docks)
      if (!visible.has(id)) entry.container.setVisible(false);
  });
  ipcMain.handle("dock:command", async (event, input) => {
    if (!trusted(event) || !input) return { ok: false };
    const entry = docks.get(input.id);
    if (!entry) return { ok: false };
    const contents = entry.view.webContents;
    if (input.action === "navigate") {
      const url = dockUrl(input.url, origin);
      if (!url)
        return { ok: false, error: "Use an HTTPS website or local HTTP tool." };
      contents
        .loadURL(url)
        .catch((error) => notify(input.id, { error: error.message }));
    } else if (input.action === "reload") contents.reload();
    else if (input.action === "back" && contents.navigationHistory.canGoBack())
      contents.navigationHistory.goBack();
    else if (
      input.action === "forward" &&
      contents.navigationHistory.canGoForward()
    )
      contents.navigationHistory.goForward();
    else if (!["back", "forward"].includes(input.action)) return { ok: false };
    return { ok: true };
  });
  ipcMain.handle("dock:remove", (event, id) => {
    if (trusted(event) && validId(id)) remove(id);
    return { ok: true };
  });
  window.webContents.on(
    "did-start-navigation",
    (_event, _url, inPlace, isMainFrame) => {
      if (isMainFrame && !inPlace)
        for (const id of [...docks.keys()]) remove(id);
    },
  );
  window.on("closed", () => {
    for (const { view } of docks.values())
      if (!view.webContents.isDestroyed()) view.webContents.close();
    docks.clear();
    for (const name of ["dock:create", "dock:command", "dock:remove"])
      ipcMain.removeHandler(name);
    ipcMain.removeAllListeners("dock:layout");
  });
}
module.exports = { installBrowserDocks };
