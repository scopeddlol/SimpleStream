import { initAvatar } from "./modules/avatar-page.js";
import { initHome } from "./modules/home-page.js";
import {
  initWorkspace,
  customPages,
  onWorkspaceChange,
  mountWorkspace,
} from "./modules/workspace.js";
import { initDocks } from "./modules/browser-dock.js";
async function boot() {
  const pages = document.querySelector("#pages");
  pages.replaceChildren();
  for (const id of ["home", "avatar"]) {
    const response = await fetch(`/pages/${id}.html`);
    if (!response.ok) throw Error(`Could not load ${id}`);
    const section = document.createElement("section");
    section.id = `page-${id}`;
    section.className = "page";
    section.hidden = true;
    section.innerHTML = await response.text();
    pages.append(section);
  }
  const dialogs = await fetch("/pages/connections.html");
  document.querySelector("#dialogs").innerHTML = await dialogs.text();
  initDocks();
  initWorkspace();
  await initAvatar();
  initHome();
  for (const button of document.querySelectorAll("[data-close]"))
    button.onclick = () =>
      document.getElementById(button.dataset.close).close();
  function navigation() {
    const nav = document.querySelector("#page-nav");
    nav.replaceChildren();
    for (const [id, name] of [
      ["home", "Home"],
      ["avatar", "Avatar"],
      ["hub", "Stream Hub"],
      ...customPages().map((page) => [page.id, page.name]),
    ]) {
      const link = document.createElement("a");
      link.href = `#${id}`;
      link.textContent = name;
      link.dataset.page = id;
      nav.append(link);
    }
  }
  function route() {
    let id = location.hash.slice(1) || "home";
    if (
      ![
        "home",
        "avatar",
        "hub",
        ...customPages().map((page) => page.id),
      ].includes(id)
    ) {
      id = "home";
      history.replaceState(null, "", "#home");
    }
    if (id === "hub" || customPages().some((page) => page.id === id))
      mountWorkspace(id);
    for (const section of pages.children)
      section.hidden = section.id !== `page-${id}`;
    for (const link of document.querySelectorAll("#page-nav a")) {
      if (link.dataset.page === id) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    document.title = `SimpleStream · ${document.querySelector("#page-nav [aria-current]")?.textContent || "Home"}`;
    document
      .querySelector(".page:not([hidden]) h1")
      ?.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("page-changed", { detail: id }));
    if (id === "avatar" || id === "hub")
      document.dispatchEvent(new CustomEvent("setup-progress", { detail: id }));
    window.scrollTo(0, 0);
  }
  onWorkspaceChange(() => {
    navigation();
    route();
  });
  navigation();
  window.addEventListener("hashchange", route);
  route();
}
boot().catch((error) => {
  document.querySelector("#pages").textContent =
    `Could not open the workspace: ${error.message}. Restart SimpleStream to try again.`;
});
