import { build } from "esbuild";
await build({
  stdin: {
    contents:
      'export { bootstrapCameraKit, createMediaStreamSource, Transform2D } from "@snap/camera-kit";',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "chrome120",
  outfile: "public/generated/camera-kit.js",
  minify: true,
  legalComments: "eof",
});
console.log(
  "Built the Camera Kit browser SDK. No API credentials are included.",
);
