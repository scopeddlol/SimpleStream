const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("browserDocks", {
  create: (id, url) => ipcRenderer.invoke("dock:create", { id, url }),
  layout: (rectangles) => ipcRenderer.send("dock:layout", rectangles),
  command: (id, action, url) =>
    ipcRenderer.invoke("dock:command", { id, action, url }),
  remove: (id) => ipcRenderer.invoke("dock:remove", id),
  onStatus: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on("dock:status", handler);
    return () => ipcRenderer.removeListener("dock:status", handler);
  },
});
