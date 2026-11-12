import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const url =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const response = await fetch(url);
if (!response.ok) throw Error(`Model download failed: ${response.status}`);
await mkdir(new URL("../public/models/", import.meta.url), { recursive: true });
const model = Buffer.from(await response.arrayBuffer());
if (
  createHash("sha256").update(model).digest("hex") !==
  "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff"
)
  throw Error("Tracking model checksum mismatch");
await writeFile(
  new URL("../public/models/face_landmarker.task", import.meta.url),
  model,
);
console.log(
  "Face tracking model installed locally. Webcam frames stay on your computer.",
);
