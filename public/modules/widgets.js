import { drawAvatar, defaultLayout, neutralPose } from "../avatar.js";
import { mountBrowserDock } from "./browser-dock.js";
let avatarState = { image: null, layout: defaultLayout, pose: neutralPose };
const avatarViews = new Set(),
  chatViews = new Set(),
  alertViews = new Set();
document.addEventListener("avatar-frame", (event) => {
  avatarState = event.detail;
  for (const entry of avatarViews) renderAvatarPreview(entry);
});
function renderAvatarPreview(entry) {
  const source = avatarState.outputCanvas;
  if (source) {
    if (entry.source !== source) {
      entry.stream?.getTracks().forEach((track) => track.stop());
      entry.source = source;
      entry.stream = source.captureStream(30);
      entry.video.srcObject = entry.stream;
      entry.video.play().catch(() => {});
    }
    entry.canvas.hidden = true;
    entry.video.hidden = false;
  } else {
    entry.stream?.getTracks().forEach((track) => track.stop());
    entry.stream = null;
    entry.source = null;
    entry.video.srcObject = null;
    entry.video.hidden = true;
    entry.canvas.hidden = false;
    drawAvatar(
      entry.canvas,
      avatarState.image,
      avatarState.layout,
      avatarState.pose,
    );
  }
}
const messages = [
  {
    platform: "Twitch",
    user: "moonlit",
    text: "That little avatar is so good ✨",
  },
  {
    platform: "Kick",
    user: "pixelpilot",
    text: "All the chats in one place? Finally.",
  },
  {
    platform: "YouTube",
    user: "cozycorner",
    text: "Hello from the YouTube side 👋",
  },
  {
    platform: "Twitch",
    user: "fern",
    text: "Try blinking! The ears are adorable.",
  },
  { platform: "Kick", user: "juno", text: "Ready when you are." },
];
const alerts = [
  {
    platform: "YouTube",
    title: "cozycorner became a member",
    detail: "Example event · demo",
  },
  {
    platform: "Twitch",
    title: "moonlit followed",
    detail: "Example event · demo",
  },
];
export function testAlert() {
  const platform = ["Twitch", "Kick", "YouTube"][alerts.length % 3];
  alerts.unshift({
    platform,
    title: "Test alert received",
    detail: `${platform} · local demo · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
  });
  alerts.splice(30);
  for (const render of alertViews) render();
}
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function icon(platform) {
  const element = node(
    "span",
    `platform ${platform.toLowerCase()}`,
    platform === "YouTube" ? "▶" : platform[0],
  );
  element.title = platform;
  return element;
}
export function mountWidget(item, host) {
  if (item.type === "browser") return mountBrowserDock(item, host);
  if (item.type === "avatar") {
    host.classList.add("preview-widget");
    const canvas = node("canvas");
    canvas.width = 800;
    canvas.height = 650;
    canvas.setAttribute("aria-label", "Shared avatar preview");
    const video = node("video");
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.hidden = true;
    host.append(
      canvas,
      video,
      node(
        "p",
        "preview-hint",
        "Tracking and appearance are controlled on the Avatar page.",
      ),
    );
    const entry = { canvas, video, source: null, stream: null };
    avatarViews.add(entry);
    renderAvatarPreview(entry);
    return () => {
      avatarViews.delete(entry);
      entry.stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }
  if (item.type === "viewers") {
    host.classList.add("viewer-widget");
    host.innerHTML =
      '<div class="viewer-total"><strong>—</strong><span>viewers right now</span><small>Connect accounts to see live counts</small></div><div class="viewer-platforms"><span class="twitch">Twitch <b>—</b></span><span class="kick">Kick <b>—</b></span><span class="youtube">YouTube <b>—</b></span></div>';
    return () => {};
  }
  if (item.type === "alerts") {
    const button = node("button", "subtle test-alert", "Test alert");
    button.onclick = testAlert;
    const toolbar = node("div", "widget-toolbar");
    toolbar.append(node("span", "hint", "Demo activity"), button);
    const log = node("div", "alert-list");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "polite");
    host.append(toolbar, log);
    const render = () => {
      log.replaceChildren();
      for (const event of alerts) {
        const row = node("div", "alert"),
          text = node("div");
        text.append(
          node("strong", "", event.title),
          node("p", "", event.detail),
        );
        row.append(icon(event.platform), text);
        log.append(row);
      }
    };
    alertViews.add(render);
    render();
    return () => alertViews.delete(render);
  }
  if (item.type === "chat") {
    let filter = "All";
    const tabs = node("div", "tabs");
    tabs.setAttribute("aria-label", "Filter chat");
    const log = node("div", "message-list");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "polite");
    const render = () => {
      log.replaceChildren();
      for (const message of messages.filter(
        (message) => filter === "All" || message.platform === filter,
      )) {
        const row = node("div", "message"),
          content = node("div");
        content.append(
          node("strong", "", message.user),
          node("p", "", message.text),
        );
        row.append(icon(message.platform), content);
        log.append(row);
      }
      log.scrollTop = log.scrollHeight;
    };
    for (const platform of ["All", "Twitch", "Kick", "YouTube"]) {
      const button = node(
        "button",
        platform === "All" ? "selected" : "",
        platform,
      );
      button.onclick = () => {
        filter = platform;
        for (const child of tabs.children)
          child.classList.toggle("selected", child === button);
        render();
      };
      tabs.append(button);
    }
    const form = node("form", "chat-form"),
      input = node("input"),
      send = node("button", "primary", "↑");
    input.placeholder = "Try a local demo message…";
    input.maxLength = 500;
    input.setAttribute("aria-label", "Demo chat message");
    send.setAttribute("aria-label", "Send demo message");
    form.append(input, send);
    form.onsubmit = (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      messages.push({
        platform: filter === "All" ? "Twitch" : filter,
        user: "You · demo",
        text,
      });
      if (messages.length > 150) messages.shift();
      input.value = "";
      for (const update of chatViews) update();
    };
    host.classList.add("chat-widget");
    host.append(
      tabs,
      log,
      form,
      node(
        "p",
        "hint demo-note",
        "Demo messages stay here. Nothing is sent to a platform.",
      ),
    );
    chatViews.add(render);
    render();
    return () => chatViews.delete(render);
  }
}
