import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
const files = (await readdir("dist"))
  .filter((name) => /\.(exe|zip)$/.test(name))
  .sort();
if (!files.length) throw Error("No Windows build artifacts found");
const lines = [];
for (const file of files) {
  const hash = createHash("sha256")
    .update(await readFile(`dist/${file}`))
    .digest("hex");
  lines.push(`${hash}  ${file}`);
}
await writeFile("dist/SHA256SUMS.txt", lines.join("\n") + "\n");
console.log(`Wrote checksums for ${files.length} Windows artifacts.`);
