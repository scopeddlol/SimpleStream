import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
export async function verifyAvatar(app, page) {
  const portrait = await readFile(".fixtures/portrait.jpg");
  await page.route("**/tracking-fixture.jpg", (route) =>
    route.fulfill({ body: portrait, contentType: "image/jpeg" }),
  );
  const inference = await page.evaluate(async () => {
    const frame = await createImageBitmap(
      await (await fetch("/tracking-fixture.jpg")).blob(),
    );
    const worker = new Worker("/modules/tracking-worker.js");
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Real face inference timed out")),
          25000,
        );
        worker.onerror = () => reject(Error("Tracking worker failed"));
        worker.onmessage = (event) => {
          const result = event.data;
          if (result.type === "ready")
            worker.postMessage(
              { type: "frame", frame, timestamp: performance.now() },
              [frame],
            );
          else if (result.type === "result") {
            clearTimeout(timer);
            resolve({
              landmarks: result.landmarks.length,
              expressions: Object.keys(result.scores).length,
              jaw: result.scores.jawOpen,
            });
          } else if (result.type === "error") {
            clearTimeout(timer);
            reject(Error(result.message));
          }
        };
        worker.postMessage({ type: "init" });
      });
    } finally {
      worker.terminate();
    }
  });
  expect(inference.landmarks).toBeGreaterThan(460);
  expect(inference.expressions).toBeGreaterThan(40);
  expect(Number.isFinite(inference.jaw)).toBe(true);
  await page.unroute("**/tracking-fixture.jpg");

  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 300;
    c.height = 300;
    const context = c.getContext("2d");
    context.fillStyle = "#74c9b2";
    context.beginPath();
    context.arc(150, 150, 120, 0, Math.PI * 2);
    context.fill();
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .locator("#upload")
    .setInputFiles({
      name: "fixture-character.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(page.locator("#current-asset")).toContainText(
    "fixture-character",
  );
  await page.locator("[data-setting=eyeScale]").fill("140");
  await page.locator("[data-setting=eyeScale]").dispatchEvent("input");
  await page.locator("#look-name").fill("Saved fixture character");
  await page.locator("#save-look").click();
  await expect(page.locator("#current-asset")).toContainText(
    "Saved fixture character",
  );
  await page.reload();
  await expect(page.locator("#page-avatar")).toBeVisible();
  await expect(page.locator("[data-setting=eyeScale]")).toHaveValue("140");
  await expect(page.locator("#current-asset")).toContainText(
    "Saved fixture character",
  );
  await page.locator("#delete-look").click();
  await expect(page.locator("#current-asset")).toContainText("Mooncat");

  await page.getByRole("button", { name: "AR lenses", exact: false }).click();
  await page.locator("#load-lenses").click();
  await expect(page.locator("#lens-library-status")).toContainText(
    "Set up Camera Kit",
  );
  expect(
    await page.locator("#webcam").evaluate((video) => video.srcObject === null),
  ).toBe(true);
  await expect(page.locator("#lens-preview")).toBeHidden();
  await page.locator("#configure-snap").click();
  const token = "synthetic-camera-kit-test-token-only";
  await page.locator("#snap-api-token").fill(token);
  await page.locator("#snap-group-ids").fill("fixture-group");
  await page
    .locator("#camera-kit-form")
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.locator("#camera-kit-status")).toContainText(
    "Configuration saved",
  );
  const profile = await app.evaluate(({ app }) => app.getPath("userData"));
  const encrypted = await readFile(
    path.join(profile, "camera-kit.json"),
    "utf8",
  );
  expect(encrypted.includes(token)).toBe(false);
  expect(
    await page.evaluate(
      async () => !!(await window.avatarTools.readConfig()).apiToken,
    ),
  ).toBe(true);
  await page.locator("#configure-snap").click();
  await page.locator("#clear-snap").click();
  await expect(page.locator("#camera-kit-status")).toHaveText(
    "Developer setup required",
  );
  await page
    .locator("#camera-kit-dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/ar-lens-setup.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "PNG avatar", exact: false }).click();

  const origin = new URL(page.url()).origin;
  const created = app.waitForEvent("window");
  const receiverId = await app.evaluate(({ BrowserWindow }, origin) => {
    const win = new BrowserWindow({
      show: false,
      width: 900,
      height: 700,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    win.loadURL(origin + "/overlay.html");
    return win.id;
  }, origin);
  const receiver = await created;
  await receiver.waitForLoadState("domcontentloaded");
  try {
    await page.evaluate(async () => {
      const { MediaOutput } = await import("/modules/media-output.js");
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      const timer = setInterval(() => {
        ctx.fillStyle = "#00c850";
        ctx.fillRect(0, 0, 640, 360);
      }, 40);
      const output = new MediaOutput(() => {});
      window.__fixtureOutput = { output, timer };
      await output.setCanvas(canvas);
    });
    await expect(receiver.locator("#lens-output")).toBeVisible({
      timeout: 25000,
    });
    const pixels = await receiver.locator("#lens-output").evaluate((video) => {
      const c = document.createElement("canvas");
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext("2d");
      ctx.drawImage(video, 0, 0, 8, 8);
      return [...ctx.getImageData(4, 4, 1, 1).data];
    });
    expect(pixels[1]).toBeGreaterThan(120);
    expect(pixels[0]).toBeLessThan(70);
    await page.evaluate(() => {
      clearInterval(window.__fixtureOutput.timer);
      window.__fixtureOutput.output.close();
      delete window.__fixtureOutput;
    });
    await expect(receiver.locator("#lens-output")).toBeHidden();
    await expect(receiver.locator("#avatar")).toBeVisible();
  } finally {
    await app.evaluate(
      ({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.close(),
      receiverId,
    );
  }
  console.log(
    "Avatar checks passed: real public-face model inference in a worker, PNG persistence, encrypted Camera Kit settings, missing-config behavior and local video output. No authorized Snap lens was used in automated tests.",
  );
}
