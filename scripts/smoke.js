import { _electron as electron, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
await mkdir("artifacts", { recursive: true });
// A local fixture deliberately refuses iframe embedding. Native docks must still load it.
const fixture = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/html",
    "X-Frame-Options": "DENY",
  });
  res.end(
    '<!doctype html><title>Fixture browser dock</title><body style="background:#243447;color:#fff;font:20px sans-serif;padding:30px">A real, isolated browser dock.</body>',
  );
});
await new Promise((resolve) => fixture.listen(0, "127.0.0.1", resolve));
const dockURL = `http://127.0.0.1:${fixture.address().port}/`;
const packaged = process.argv.includes("--packaged");
const options = {
  ...(packaged
    ? { executablePath: path.resolve("dist/win-unpacked/SimpleStream.exe") }
    : {}),
  timeout: 20000,
  args: [
    ...(!packaged ? ["."] : []),
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
  env: {
    ...process.env,
    SIMPLESTREAM_PORT: packaged ? "32147" : "32146",
    SIMPLESTREAM_DATA_DIR: path.resolve(
      packaged ? ".local-data-packaged-smoke" : ".local-data-smoke",
    ),
  },
};
let app;
try {
  app = await electron.launch(options);
  const page = await app.firstWindow({ timeout: 20000 });
  // Hosted Windows runners can start with a small virtual monitor. Keep the
  // baseline deterministic; the responsive checks exercise other sizes below.
  await page.setViewportSize({ width: 1440, height: 960 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator("#welcome-title")).toBeVisible();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#welcome-title")).toBeVisible();
  await expect(page.locator("aside")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Personalize your workspace" })
    .click();
  await page.locator("#display-name").fill("Creator");
  await page
    .locator("#profile-form")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator("#welcome-title")).toHaveText(
    "Welcome home, Creator.",
  );
  await page.getByRole("button", { name: "Take a little tour" }).click();
  await expect(page.locator("#tour-step")).toContainText("1 OF 3");
  await page.locator("#tour-next").click();
  await expect(page.locator("#page-avatar")).toBeVisible();
  await page.locator("#tour-next").click();
  await expect(page.locator("#page-hub")).toBeVisible();
  await page.locator("#tour-next").click();
  await expect(page.locator("#page-home")).toBeVisible();
  await page.screenshot({ path: "artifacts/home.png", fullPage: true });
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("link", { name: "Avatar", exact: true })
    .click();
  await page.getByRole("button", { name: "Talk", exact: true }).click();
  await page.getByRole("button", { name: "Start face tracking" }).click();
  await expect(page.locator("#tracking-status")).toHaveText(
    /Looking for a face|● Tracking/,
    { timeout: 25000 },
  );
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("link", { name: "Stream Hub", exact: true })
    .click();
  await expect(page.locator("#tracking-status")).not.toHaveText("Camera off");
  const hub = page.locator("#page-hub");
  await hub.getByRole("button", { name: "Kick", exact: true }).click();
  await expect(hub.locator(".message")).toHaveCount(2);
  await hub
    .getByRole("textbox", { name: "Demo chat message" })
    .fill("<script>demo</script>");
  await hub.getByRole("button", { name: "Send demo message" }).click();
  await expect(hub.locator(".message-list")).toContainText(
    "<script>demo</script>",
  );
  await hub.getByRole("button", { name: "Test alert", exact: true }).click();
  await expect(hub.locator(".alert")).toHaveCount(3);
  await hub.getByRole("button", { name: "Manage connections" }).click();
  await expect(page.locator("#connection-dialog")).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();
  await page.screenshot({ path: "artifacts/hub.png", fullPage: true });
  await verifyResponsive(page);
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("link", { name: "Avatar", exact: true })
    .click();
  await page.getByRole("button", { name: "Stop tracking" }).click();
  await page.getByRole("button", { name: "Neutral", exact: true }).click();
  await page.screenshot({ path: "artifacts/avatar.png", fullPage: true });
  await page.getByRole("button", { name: "New page" }).click();
  await page.locator("#page-name").fill("Command Center");
  await page.locator("#page-submit").click();
  const custom = page.locator(".workspace-page:not([hidden])");
  await expect(custom.locator("h1")).toHaveText("Command Center");
  for (const type of ["avatar", "chat", "alerts", "viewers", "browser"]) {
    await custom
      .getByRole("button", { name: "Add element", exact: false })
      .first()
      .click();
    await page.locator("#widget-type").selectOption(type);
    if (type === "browser") {
      await page.locator("#dock-name").fill("My tool");
      await page.locator("#dock-url").fill(dockURL);
    }
    await page
      .locator("#widget-form")
      .getByRole("button", { name: "Add element", exact: true })
      .click();
  }
  await expect(custom.locator(".grid-widget")).toHaveCount(5);
  await custom
    .getByRole("spinbutton", { name: "Width of Avatar preview" })
    .fill("4");
  await custom
    .getByRole("spinbutton", { name: "Width of Avatar preview" })
    .press("Tab");
  await expect(custom.locator('[data-type="avatar"]')).toHaveCSS(
    "grid-column-end",
    "span 4",
  );
  const gridBounds = await custom.locator(".widget-grid").boundingBox();
  const rowStep = await custom
    .locator(".widget-grid")
    .evaluate((grid) => parseFloat(getComputedStyle(grid).gridAutoRows) + 16);
  await custom
    .locator('[data-type="avatar"] .widget-heading')
    .dragTo(custom.locator(".widget-grid"), {
      targetPosition: { x: 10, y: rowStep + 8 },
    });
  await expect(custom.locator('[data-type="avatar"]')).toHaveCSS(
    "grid-row-start",
    "2",
  );
  const handle = custom.locator('[data-type="avatar"] .resize-widget');
  await handle.scrollIntoViewIfNeeded();
  const handleBounds = await handle.boundingBox();
  await page.mouse.move(
    handleBounds.x + handleBounds.width / 2,
    handleBounds.y + handleBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handleBounds.x + handleBounds.width / 2 + (gridBounds.width + 16) / 12,
    handleBounds.y + handleBounds.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect(custom.locator('[data-type="avatar"]')).toHaveCSS(
    "grid-column-end",
    "span 5",
  );
  await custom.getByRole("button", { name: "Done editing" }).click();
  await expect
    .poll(async () =>
      app.evaluate(
        ({ webContents }, url) =>
          webContents
            .getAllWebContents()
            .some((contents) => contents.getURL() === url),
        dockURL,
      ),
    )
    .toBe(true);
  const guest = await app.evaluate(async ({ webContents }, url) => {
    const guest = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL() === url);
    return guest.executeJavaScript(
      "({title:document.title,node:typeof require,bridge:typeof browserDocks})",
    );
  }, dockURL);
  expect(guest).toEqual({
    title: "Fixture browser dock",
    node: "undefined",
    bridge: "undefined",
  });
  await custom
    .getByRole("button", { name: "Rename page", exact: true })
    .click();
  await page.locator("#page-name").fill("My control room");
  await page.locator("#page-submit").click();
  await expect(
    page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: "My control room", exact: true }),
  ).toBeVisible();
  const customHash = new URL(page.url()).hash;
  await page.reload();
  await expect(
    page.locator(".workspace-page:not([hidden]) .grid-widget"),
  ).toHaveCount(5);
  await expect(
    page.locator('.workspace-page:not([hidden]) [data-type="avatar"]'),
  ).toHaveCSS("grid-column-end", "span 5");
  await page.screenshot({ path: "artifacts/custom-page.png", fullPage: true });
  const dock = page.locator(
    '.workspace-page:not([hidden]) [data-type="browser"]',
  );
  await dock.scrollIntoViewIfNeeded();
  await expect(dock.locator(".dock-status")).toHaveText("Fixture browser dock");
  await expect
    .poll(async () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children.some((view) =>
          view.getVisible(),
        ),
      ),
    )
    .toBe(true);
  const capture = await app.evaluate(async ({ webContents }, url) => {
    const guest = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL() === url);
    return (await guest.capturePage()).toPNG().toString("base64");
  }, dockURL);
  await writeFile("artifacts/browser-dock.png", Buffer.from(capture, "base64"));
  await page.getByRole("button", { name: "New page" }).click();
  await expect
    .poll(async () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children.every(
          (view) => !view.getVisible(),
        ),
      ),
    )
    .toBe(true);
  await page
    .locator("#page-dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  // Switching away hides native browser surfaces while keeping them alive.
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("link", { name: "Home", exact: true })
    .click();
  await expect(page.locator("#welcome-title")).toHaveText(
    "Welcome home, Creator.",
  );
  await expect
    .poll(async () =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].contentView.children.every(
          (view) => !view.getVisible(),
        ),
      ),
    )
    .toBe(true);
  expect(errors).toEqual([]);
  await app.close();
  app = await electron.launch(options);
  const reopened = await app.firstWindow({ timeout: 20000 });
  await reopened.setViewportSize({ width: 1440, height: 960 });
  await expect(reopened.locator("#welcome-title")).toHaveText(
    "Welcome home, Creator.",
  );
  await reopened
    .getByRole("navigation", { name: "Pages" })
    .getByRole("link", { name: "My control room", exact: true })
    .click();
  expect(new URL(reopened.url()).hash).toBe(customHash);
  await expect(
    reopened.locator(".workspace-page:not([hidden]) .grid-widget"),
  ).toHaveCount(5);
  await reopened
    .locator(".workspace-page:not([hidden])")
    .getByRole("button", { name: "Delete page", exact: true })
    .click();
  await reopened.locator("#confirm-delete").click();
  await expect(reopened.locator("#page-home")).toBeVisible();
  await expect(
    reopened
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: "My control room", exact: true }),
  ).toHaveCount(0);
  console.log(
    "Desktop checks passed: Home, tour, personalization, modular navigation, continuous tracking, shared chat/alerts, custom grids, resize/persistence/restart, isolated native browser docks and deletion.",
  );
} finally {
  if (app) await app.close();
  fixture.close();
}

async function verifyResponsive(page) {
  const initial = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  for (const [width, height, mode] of [
    [1920, 1080, "landscape"],
    [1080, 1920, "portrait"],
    [720, 1280, "portrait"],
    [480, 800, "compact"],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator("#page-hub")).toHaveAttribute(
      "data-layout-mode",
      mode,
    );
    await expect
      .poll(() =>
        page.locator("#page-hub .grid-widget").evaluateAll((cards) =>
          cards.every((card) => {
            const r = card.getBoundingClientRect();
            return r.left >= 0 && r.right <= innerWidth && r.height >= 160;
          }),
        ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page
          .locator("#page-hub .widget-body")
          .evaluateAll((bodies) =>
            bodies.every((body) => body.scrollWidth <= body.clientWidth + 1),
          ),
      )
      .toBe(true);
    if (mode === "portrait")
      await expect(page.locator("#page-hub [data-type=chat]")).toHaveCSS(
        "grid-column-end",
        "span 12",
      );
    if (mode === "landscape")
      await expect(page.locator("#page-hub [data-type=chat]")).toHaveCSS(
        "grid-column-end",
        "span 7",
      );
    await page.screenshot({
      path: "artifacts/hub-" + width + "x" + height + ".png",
      fullPage: true,
    });
    await page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: "Home", exact: true })
      .click();
    await expect
      .poll(() =>
        page
          .locator("#page-home .card")
          .evaluateAll((cards) =>
            cards.every(
              (card) => card.getBoundingClientRect().right <= innerWidth,
            ),
          ),
      )
      .toBe(true);
    if (width === 1080)
      await page.screenshot({
        path: "artifacts/home-portrait.png",
        fullPage: true,
      });
    await page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: "Avatar", exact: true })
      .click();
    await expect
      .poll(() =>
        page
          .locator("#page-avatar .card")
          .evaluateAll((cards) =>
            cards.every(
              (card) => card.getBoundingClientRect().right <= innerWidth,
            ),
          ),
      )
      .toBe(true);
    await page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("link", { name: "Stream Hub", exact: true })
      .click();
  }
  await page.setViewportSize(initial);
  await expect(page.locator("#page-hub")).toHaveAttribute(
    "data-layout-mode",
    "landscape",
  );
}
