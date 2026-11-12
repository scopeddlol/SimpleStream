import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
const files = [];
async function walk(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const name = directory === "." ? item.name : `${directory}/${item.name}`;
    if (item.isDirectory()) {
      if (["public", "scripts", "test"].includes(name) || directory !== ".")
        await walk(name);
    } else if (/\.(?:cjs|mjs|js)$/.test(name)) files.push(name);
  }
}
await walk(".");
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    process.exit(1);
  }
}
console.log(`Syntax checks passed for ${files.length} JavaScript modules.`);
