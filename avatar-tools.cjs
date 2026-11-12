const { ipcMain, safeStorage, shell } = require("electron");
const {
  readFile,
  writeFile,
  rename,
  unlink,
  mkdir,
} = require("node:fs/promises");
const path = require("node:path");
function installAvatarTools(window, origin, dataDirectory, outputKey) {
  const file = path.join(dataDirectory, "camera-kit.json");
  const trusted = (event) =>
    event.sender === window.webContents &&
    event.senderFrame?.url?.startsWith(`${origin}/`);
  async function read() {
    try {
      const saved = JSON.parse(await readFile(file, "utf8"));
      if (!safeStorage.isEncryptionAvailable())
        throw Error("Windows credential encryption is unavailable.");
      return {
        apiToken: safeStorage.decryptString(Buffer.from(saved.token, "base64")),
        groupIds: saved.groupIds,
      };
    } catch (error) {
      if (error.code === "ENOENT") return { apiToken: "", groupIds: [] };
      throw Error(
        "Could not unlock Camera Kit settings. Save the token again.",
      );
    }
  }
  ipcMain.handle("avatar:config", async (event, input) => {
    if (!trusted(event)) throw Error("Invalid caller");
    if (input?.action === "read") return read();
    if (input?.action === "clear") {
      await unlink(file).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
      return { ok: true };
    }
    if (input?.action !== "save") throw Error("Invalid action");
    const previous = input.apiToken?.trim() ? { apiToken: "" } : await read();
    const token = input.apiToken?.trim() || previous.apiToken;
    if (
      typeof token !== "string" ||
      token.length < 12 ||
      token.length > 8192 ||
      /\s/.test(token)
    )
      throw Error("Enter your Camera Kit Web API token.");
    if (
      !Array.isArray(input.groupIds) ||
      input.groupIds.length < 1 ||
      input.groupIds.length > 12 ||
      input.groupIds.some(
        (id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id),
      )
    )
      throw Error("Enter between 1 and 12 valid Lens Group IDs.");
    if (!safeStorage.isEncryptionAvailable())
      throw Error(
        "Windows credential encryption is unavailable; the token was not saved.",
      );
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(
      file + ".tmp",
      JSON.stringify({
        version: 1,
        token: safeStorage.encryptString(token).toString("base64"),
        groupIds: [...new Set(input.groupIds)],
      }),
    );
    await rename(file + ".tmp", file);
    return { ok: true };
  });
  ipcMain.handle("avatar:output-key", (event) => {
    if (!trusted(event)) throw Error("Invalid caller");
    return outputKey;
  });
  ipcMain.handle("avatar:open-setup", async (event, target) => {
    if (!trusted(event)) return false;
    const urls = {
      portal: "https://my-lenses.snapchat.com/",
      studio: "https://ar.snap.com/lens-studio",
      docs: "https://developers.snap.com/camera-kit/getting-started/account-setup",
    };
    if (!urls[target]) return false;
    await shell.openExternal(urls[target]);
    return true;
  });
  window.on("closed", () => {
    for (const name of [
      "avatar:config",
      "avatar:output-key",
      "avatar:open-setup",
    ])
      ipcMain.removeHandler(name);
  });
}
module.exports = { installAvatarTools };
