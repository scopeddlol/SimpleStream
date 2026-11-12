import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
if (process.platform !== "win32")
  throw Error("Windows packaging currently requires Windows.");
await import("./build-sdk.js");
await access("public/models/face_landmarker.task").catch(() => {
  throw Error("Run npm run setup:tracking before packaging.");
});
for (const args of [
  ["node_modules/electron/install.js"],
  [
    "node_modules/electron-builder/out/cli/cli.js",
    "--win",
    "--x64",
    "--publish",
    "never",
    `--config.electronDist=${path.resolve("node_modules/electron/dist")}`,
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
