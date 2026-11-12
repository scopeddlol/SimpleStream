import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const privatePath =
  /(^|\/)(?:\.private|\.local-data[^/]*|\.npm-cache|\.electron-cache|node_modules|artifacts|dist|release|coverage|test-results|playwright-report)(\/|$)|(^|\/)\.env(?:\.|$)|\.(?:pem|pfx|p12|key|sqlite\w*|db|log)$/i;
const secrets = [
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /AIza[A-Za-z0-9_-]{30,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const privateReferences = [
  /(?:chatgpt\.com|chat\.openai\.com)\/(?:c|share)\/[A-Za-z0-9-]+/,
  /codex:\/\/[^\s"']+/,
  /[A-Z]:[\\/]Users[\\/][A-Za-z0-9_.-]+[\\/]/,
];
const failures = [];
for (const file of files) {
  if (privatePath.test(file)) {
    failures.push(`${file}: private runtime file`);
    continue;
  }
  if (/\.(png|ico|task|wasm)$/i.test(file)) continue;
  const text = await readFile(file, "utf8");
  if (secrets.some((pattern) => pattern.test(text)))
    failures.push(`${file}: possible credential`);
  if (privateReferences.some((pattern) => pattern.test(text)))
    failures.push(`${file}: private conversation or home-directory reference`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Public-source checks passed for ${files.length} tracked files. Runtime profiles, credentials and conversation links are excluded.`,
);
