const { app, BrowserWindow, session } = require("electron");
const path = require("node:path");
const { installBrowserDocks } = require("./browser-docks.cjs");
const { installAvatarTools } = require("./avatar-tools.cjs");
if (process.env.SIMPLESTREAM_DATA_DIR)
  app.setPath("userData", process.env.SIMPLESTREAM_DATA_DIR);
let local;
app
  .whenReady()
  .then(async () => {
    const { startServer } = await import("./server.js");
    local = await startServer({
      port: process.env.SIMPLESTREAM_PORT
        ? Number(process.env.SIMPLESTREAM_PORT)
        : 32145,
    });
    const allowed = `${local.url}/`;
    session.defaultSession.setPermissionRequestHandler(
      (contents, permission, callback, details) => {
        callback(
          contents.getURL().startsWith(allowed) &&
            permission === "media" &&
            details.mediaTypes?.every((type) => type === "video"),
        );
      },
    );
    session.defaultSession.setPermissionCheckHandler(
      (contents, permission, origin, details) =>
        origin === local.url &&
        permission === "media" &&
        details.mediaType === "video",
    );
    const window = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 480,
      minHeight: 560,
      backgroundColor: "#0d1017",
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    installBrowserDocks(window, local.url);
    installAvatarTools(
      window,
      local.url,
      app.getPath("userData"),
      local.outputKey,
    );
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith(allowed)) event.preventDefault();
    });
    await window.loadURL(local.url);
  })
  .catch((error) => {
    console.error(error);
    app.quit();
  });
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => local?.close());
