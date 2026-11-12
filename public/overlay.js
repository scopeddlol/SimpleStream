import { drawAvatar } from "./avatar.js";
import { MediaReceiver } from "./modules/media-output.js";
const canvas = document.querySelector("canvas");
const video = document.querySelector("#lens-output");
let mode = "avatar",
  playing = false;
function visibility() {
  video.hidden = mode !== "lens" || !playing;
  canvas.hidden = mode === "lens";
}
const receiver = new MediaReceiver(video, (value) => {
  playing = value;
  visibility();
});
receiver.start();
window.addEventListener("pagehide", () => receiver.close());
let image, source, latest;
new EventSource("/events").onmessage = async (event) => {
  latest = JSON.parse(event.data);
  mode = latest.outputMode || mode;
  visibility();
  if (Object.hasOwn(latest, "avatar") && source !== latest.avatar) {
    source = latest.avatar;
    if (source) {
      const next = new Image();
      next.src = source;
      await next.decode();
      if (source === next.src) image = next;
    } else image = null;
  }
  drawAvatar(canvas, image, latest.layout, latest.pose);
};
