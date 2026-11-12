import { drawAvatar } from "./avatar.js";
const canvas = document.querySelector("canvas");
let image, source, latest;
new EventSource("/events").onmessage = async (event) => {
  latest = JSON.parse(event.data);
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
