import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
// Official MediaPipe public test image; downloaded only into the ignored test
// directory, never bundled with the app or copied into a user profile.
let data = await readFile(".fixtures/portrait.jpg").catch(() => null);
if (!data) {
  const response = await fetch(
    "https://storage.googleapis.com/mediapipe-assets/portrait.jpg",
  );
  if (!response.ok)
    throw Error("Could not download the MediaPipe test fixture");
  data = Buffer.from(await response.arrayBuffer());
}
if (
  createHash("sha256").update(data).digest("hex") !==
  "a6f11efaa834706db23f275b6115058fa87fc7f14362681e6abe14e82749de3e"
)
  throw Error("Test fixture checksum mismatch");
await mkdir(".fixtures", { recursive: true });
await writeFile(".fixtures/portrait.jpg", data);
console.log("Downloaded the checksum-verified public face test fixture.");
