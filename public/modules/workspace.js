import {
  uid,
  titles,
  firstSpace,
  arrange,
  sanitizePages,
} from "./grid-model.js";
import { mountWidget } from "./widgets.js";
import {
  layoutMode,
  responsiveWidgets,
  saveResponsiveLayout,
  rowHeight,
} from "./responsive-grid.js";
const $ = (selector) => document.querySelector(selector);
const key = "simplestream:workspace:v1";
const hub = {
  id: "hub",
  name: "Stream Hub",
  widgets: [
    {
      id: uid(),
      type: "viewers",
      title: titles.viewers,
      x: 1,
      y: 1,
      w: 12,
      h: 3,
    },
    { id: uid(), type: "chat", title: titles.chat, x: 1, y: 4, w: 7, h: 7 },
    { id: uid(), type: "alerts", title: titles.alerts, x: 8, y: 4, w: 5, h: 7 },
  ],
};
let pages = [];
try {
  pages = sanitizePages(JSON.parse(localStorage.getItem(key) || "[]"));
} catch {}
if (!pages.some((page) => page.id === "hub")) pages.unshift(hub);
const mounted = new Map(),
  listeners = new Set();
let current = "hub",
  editingPage = null,
  dragged = null;
export const customPages = () => pages.filter((page) => page.id !== "hub");
export const onWorkspaceChange = (callback) => listeners.add(callback);
function save(notify = false) {
  localStorage.setItem(key, JSON.stringify(pages));
  if (notify) for (const callback of listeners) callback();
  document.dispatchEvent(new Event("dock-layout"));
}
function currentPage() {
  return pages.find((page) => page.id === current);
}
export function initWorkspace() {
  let resizeFrame;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      for (const page of pages)
        if (mounted.has(page.id) && !mounted.get(page.id).section.hidden)
          applyPositions(page);
      document.dispatchEvent(new Event("dock-layout"));
    });
  });
  document.addEventListener("page-changed", () => {
    for (const page of pages)
      if (mounted.has(page.id) && !mounted.get(page.id).section.hidden)
        applyPositions(page);
  });
  $("#new-page").onclick = () => {
    if (customPages().length >= 23) {
      $("#status").textContent =
        "You have reached the limit of 23 custom pages.";
      return;
    }
    editingPage = null;
    $("#page-dialog-title").textContent = "Create a page";
    $("#page-submit").textContent = "Create page";
    $("#page-name").value = "";
    $("#page-dialog").showModal();
  };
  $("#page-form").onsubmit = (event) => {
    event.preventDefault();
    const name = $("#page-name").value.trim();
    if (!name) return;
    if (editingPage) {
      const page = pages.find((page) => page.id === editingPage);
      page.name = name;
      mounted
        .get(page.id)
        ?.section.querySelector("h1")
        .replaceChildren(document.createTextNode(name));
    } else {
      const page = { id: uid(), name, widgets: [] };
      pages.push(page);
      location.hash = page.id;
    }
    $("#page-dialog").close();
    save(true);
  };
  $("#widget-type").onchange = () => {
    $("#dock-fields").hidden = $("#widget-type").value !== "browser";
    $("#dock-url").required = $("#widget-type").value === "browser";
  };
  $("#widget-form").onsubmit = (event) => {
    event.preventDefault();
    const page = currentPage();
    if (!page) return;
    if (page.widgets.length >= 30) {
      $("#widget-error").textContent = "This page already has 30 elements.";
      return;
    }
    const type = $("#widget-type").value;
    let url = "";
    if (type === "browser") {
      try {
        const target = new URL($("#dock-url").value);
        if (
          !["https:", "http:"].includes(target.protocol) ||
          target.origin === location.origin ||
          target.username ||
          target.password
        )
          throw Error();
        if (
          target.protocol === "http:" &&
          !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
        )
          throw Error();
        url = target.href;
      } catch {
        $("#widget-error").textContent =
          "Use an HTTPS website or a local HTTP tool, without credentials in the URL.";
        return;
      }
    }
    const item = firstSpace(
      {
        id: uid(),
        type,
        title:
          type === "browser"
            ? $("#dock-name").value.trim() || titles.browser
            : titles[type],
        url,
        w: 6,
        h: type === "viewers" ? 3 : 6,
      },
      page.widgets,
    );
    page.widgets.push(item);
    $("#widget-dialog").close();
    const instance = mounted.get(page.id);
    instance.section.classList.add("editing");
    instance.edit.textContent = "Done editing";
    addWidget(page, item, instance.grid);
    instance.empty.hidden = true;
    save();
  };
  $("#confirm-delete").onclick = () => {
    const page = currentPage();
    if (!page || page.id === "hub") return;
    const instance = mounted.get(page.id);
    for (const dispose of instance.disposers.values()) dispose();
    instance.section.remove();
    mounted.delete(page.id);
    pages = pages.filter((other) => other.id !== page.id);
    $("#delete-dialog").close();
    location.hash = "home";
    save(true);
  };
  document.addEventListener("page-changed", (event) => {
    current = event.detail;
  });
  document.addEventListener("dock-url", (event) => {
    for (const page of pages) {
      const item = page.widgets.find((item) => item.id === event.detail.id);
      if (item && item.url !== event.detail.url) {
        item.url = event.detail.url;
        save();
        break;
      }
    }
  });
}
export function mountWorkspace(id) {
  current = id;
  if (mounted.has(id)) return;
  const page = pages.find((page) => page.id === id);
  if (!page) return;
  const section = document.createElement("section");
  section.id = `page-${id}`;
  section.className = "page workspace-page";
  section.hidden = true;
  section.innerHTML =
    '<header class="page-heading"><div><div class="eyebrow">YOUR MAIN CONTROL ROOM</div><h1 tabindex="-1"></h1><p>Everything you need, exactly where you want it.</p></div><div class="page-actions"><button class="subtle edit-layout">Edit layout</button><button class="primary add-element">＋ Add element</button></div></header><div class="workspace-meta"><span class="badge muted">Local workspace · demo platform data</span><div class="workspace-tools"></div></div><p class="layout-help">Drag element headers to place them on the grid. Use column, row, width, and height for precise placement. Changes save automatically.</p><div class="widget-grid"></div><div class="card empty-workspace"><span class="empty-art">▦</span><h2>A blank canvas, all yours.</h2><p>Start with an avatar preview, your community, or a favorite browser dock.<br>Mix, arrange, and make it work for you.</p><button class="primary empty-add">＋ Add your first element</button></div>';
  section.querySelector("h1").textContent = page.name;
  const grid = section.querySelector(".widget-grid"),
    empty = section.querySelector(".empty-workspace"),
    edit = section.querySelector(".edit-layout");
  const instance = { section, grid, empty, edit, disposers: new Map() };
  mounted.set(id, instance);
  const add = () => {
    current = id;
    $("#widget-error").textContent = "";
    $("#widget-form").reset();
    $("#dock-fields").hidden = true;
    $("#dock-url").required = false;
    $("#widget-dialog").showModal();
  };
  section.querySelector(".add-element").onclick = add;
  section.querySelector(".empty-add").onclick = add;
  edit.onclick = () => {
    section.classList.toggle("editing");
    edit.textContent = section.classList.contains("editing")
      ? "Done editing"
      : "Edit layout";
    applyPositions(page);
    document.dispatchEvent(new Event("dock-layout"));
  };
  const tools = section.querySelector(".workspace-tools");
  if (id === "hub") {
    const connect = document.createElement("button");
    connect.className = "text-button";
    connect.textContent = "Manage connections ↗";
    connect.onclick = () => $("#connection-dialog").showModal();
    tools.append(connect);
  } else {
    for (const [label, action] of [
      [
        "Rename page",
        () => {
          editingPage = id;
          $("#page-dialog-title").textContent = "Rename page";
          $("#page-submit").textContent = "Save name";
          $("#page-name").value = page.name;
          $("#page-dialog").showModal();
        },
      ],
      ["Delete page", () => $("#delete-dialog").showModal()],
    ]) {
      const button = document.createElement("button");
      button.className = "text-button";
      button.textContent = label;
      button.onclick = action;
      tools.append(button);
    }
  }
  grid.ondragover = (event) => {
    if (section.classList.contains("editing") && dragged) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  };
  grid.ondrop = (event) => {
    event.preventDefault();
    const rectangles = currentRectangles(page);
    const item = rectangles.find((item) => item.id === dragged);
    if (!item) return;
    const rect = grid.getBoundingClientRect(),
      gap = 16;
    item.x = Math.max(
      1,
      Math.min(
        13 - item.w,
        Math.floor((event.clientX - rect.left) / ((rect.width + gap) / 12)) + 1,
      ),
    );
    item.y = Math.max(
      1,
      Math.min(
        480,
        Math.floor((event.clientY - rect.top) / (instance.unit + 16)) + 1,
      ),
    );
    commitRectangles(page, arrange(rectangles, item));
    applyPositions(page);
    save();
  };
  document.querySelector("#pages").append(section);
  for (const item of page.widgets) addWidget(page, item, grid);
  empty.hidden = page.widgets.length > 0;
}
function addWidget(page, item, grid) {
  const card = document.createElement("article");
  card.className = "card grid-widget";
  card.dataset.widgetId = item.id;
  card.dataset.type = item.type;
  const header = document.createElement("div");
  header.className = "widget-heading";
  header.draggable = true;
  header.ondragstart = (event) => {
    if (!mounted.get(page.id).section.classList.contains("editing")) {
      event.preventDefault();
      return;
    }
    dragged = item.id;
    event.dataTransfer.setData("text/plain", item.id);
    event.dataTransfer.effectAllowed = "move";
  };
  header.ondragend = () => {
    dragged = null;
  };
  const title = document.createElement("h2");
  title.textContent = item.title;
  header.append(title);
  const badge = document.createElement("span");
  badge.className = "widget-grip";
  badge.textContent = "⠿";
  badge.title = "Drag to move";
  header.append(badge);
  const controls = document.createElement("div");
  controls.className = "widget-layout-controls";
  for (const [key, label, min, max] of [
    ["x", "Column", 1, 12],
    ["y", "Row", 1, 480],
    ["w", "Width", 2, 12],
    ["h", "Height", 3, 12],
  ]) {
    const field = document.createElement("label");
    field.textContent = label;
    const input = document.createElement("input");
    input.type = "number";
    input.min = min;
    input.max = max;
    input.value = item[key];
    input.dataset.dimension = key;
    input.setAttribute("aria-label", `${label} of ${item.title}`);
    input.onchange = () => {
      const rectangles = currentRectangles(page);
      const active = rectangles.find((other) => other.id === item.id);
      const value = Number(input.value);
      if (!Number.isInteger(value) || value < min || value > max) {
        input.value = active[key];
        return;
      }
      active[key] = value;
      commitRectangles(page, arrange(rectangles, active));
      applyPositions(page);
      save();
    };
    field.append(input);
    controls.append(field);
  }
  const remove = document.createElement("button");
  remove.className = "remove-widget";
  remove.textContent = "×";
  remove.setAttribute("aria-label", `Remove ${item.title}`);
  remove.onclick = () => {
    const instance = mounted.get(page.id);
    instance.disposers.get(item.id)?.();
    instance.disposers.delete(item.id);
    page.widgets = page.widgets.filter((other) => other.id !== item.id);
    card.remove();
    instance.empty.hidden = page.widgets.length > 0;
    save();
  };
  controls.append(remove);
  const body = document.createElement("div");
  body.className = "widget-body";
  card.append(header, controls, body);
  grid.append(card);
  mounted.get(page.id).disposers.set(item.id, mountWidget(item, body));
  applyPositions(page);
  const resize = document.createElement("button");
  resize.className = "resize-widget";
  resize.textContent = "◢";
  resize.setAttribute("aria-label", `Resize ${item.title}`);
  resize.title =
    "Drag to resize; use width and height fields for keyboard control";
  resize.onpointerdown = (event) => {
    event.preventDefault();
    const startX = event.clientX,
      startY = event.clientY,
      initial = currentRectangles(page),
      active = initial.find((other) => other.id === item.id),
      step = (grid.getBoundingClientRect().width + 16) / 12;
    resize.setPointerCapture(event.pointerId);
    resize.onpointermove = (move) => {
      const candidate = {
        ...active,
        w: Math.max(
          2,
          Math.min(
            13 - active.x,
            active.w + Math.round((move.clientX - startX) / step),
          ),
        ),
        h: Math.max(
          3,
          Math.min(
            12,
            active.h +
              Math.round(
                (move.clientY - startY) / (mounted.get(page.id).unit + 16),
              ),
          ),
        ),
      };
      commitRectangles(
        page,
        arrange(
          initial.map((other) => (other.id === item.id ? candidate : other)),
          candidate,
        ),
      );
      applyPositions(page);
    };
    const finish = () => {
      resize.onpointermove = null;
      resize.onpointerup = null;
      resize.onpointercancel = null;
      save();
    };
    resize.onpointerup = finish;
    resize.onpointercancel = finish;
  };
  card.append(resize);
}
function applyPositions(page) {
  const instance = mounted.get(page.id);
  const mode = layoutMode(window.innerWidth, window.innerHeight);
  instance.section.dataset.layoutMode = mode;
  const rectangles = responsiveWidgets(page.widgets, mode);
  const top = instance.grid.getBoundingClientRect().top + window.scrollY;
  instance.unit = rowHeight(
    rectangles,
    window.innerHeight - top - 44,
    instance.section.classList.contains("editing"),
  );
  instance.grid.style.setProperty("--row-height", instance.unit + "px");
  instance.section.querySelector(".layout-help").textContent =
    "Editing the " +
    mode +
    " layout. Drag headers or corners, or use the position fields. Each screen layout saves separately.";
  for (const item of rectangles) {
    const card = instance.grid.querySelector(`[data-widget-id="${item.id}"]`);
    if (!card) continue;
    card.style.gridColumn = `${item.x} / span ${item.w}`;
    card.style.gridRow = `${item.y} / span ${item.h}`;
    for (const input of card.querySelectorAll("[data-dimension]"))
      input.value = item[input.dataset.dimension];
  }
}

function currentRectangles(page) {
  return responsiveWidgets(
    page.widgets,
    layoutMode(window.innerWidth, window.innerHeight),
  );
}
function commitRectangles(page, rectangles) {
  page.widgets = saveResponsiveLayout(
    page.widgets,
    rectangles,
    layoutMode(window.innerWidth, window.innerHeight),
  );
}
