import { chromium } from "/tmp/lfs007-pw/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
const screenshotDir = new URL("screenshots/", import.meta.url);
await mkdir(screenshotDir, { recursive: true });

const routes = [
  "office", "fleet", "mission", "dashboard", "overview", "terminal",
  "chat", "teams", "config", "federation",
];
const entrypoints = [
  "index.html", "mission.html", "fleet.html", "dashboard.html", "terminal.html",
  "office.html", "overview.html", "chat.html", "config.html", "inbox.html",
  "federation.html", "federation_2d.html", "workspace.html", "arena.html",
  "talk.html", "timemachine.html", "shrine.html",
];
const profiles = [
  { name: "mobile-360x800", width: 360, height: 800, touch: true },
  { name: "tablet-768x1024", width: 768, height: 1024, touch: true },
  { name: "tablet-820x1180", width: 820, height: 1180, touch: true },
  { name: "landscape-844x390", width: 844, height: 390, touch: true },
];

const results = [];
const entrypointResults = [];
for (const profile of profiles) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    hasTouch: profile.touch,
    isMobile: profile.width < 600,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`${base}/?static=1#office`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  for (const route of routes) {
    await page.evaluate((next) => { location.hash = next; }, route);
    await page.waitForTimeout(350);
    const fit = await page.evaluate(() => {
      const viewportMeta = document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "";
      const root = document.documentElement;
      const body = document.body;
      return {
        viewportMeta,
        viewportWidth: window.innerWidth,
        documentWidth: root.scrollWidth,
        bodyWidth: body.scrollWidth,
        horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
        staticMode: root.classList.contains("static-mode"),
        toggleVisible: Boolean(document.querySelector(".maw-static-toggle")?.getBoundingClientRect().width),
      };
    });
    await page.screenshot({
      path: decodeURIComponent(new URL(`${profile.name}-${route}.jpg`, screenshotDir).pathname),
      type: "jpeg",
      quality: 65,
      fullPage: false,
    });
    results.push({ profile: profile.name, route, ...fit });
  }
  for (const entrypoint of entrypoints) {
    await page.goto(`${base}/${entrypoint}?static=1`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(250);
    const fit = await page.evaluate(() => ({
      viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "",
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      staticMode: document.documentElement.classList.contains("static-mode"),
    }));
    entrypointResults.push({ profile: profile.name, entrypoint, ...fit });
    if (entrypoint === "federation.html") {
      await page.screenshot({
        path: decodeURIComponent(new URL(`${profile.name}-federation-3d.jpg`, screenshotDir).pathname),
        type: "jpeg",
        quality: 65,
        fullPage: false,
      });
    }
  }
  await context.close();
}

const keyboardPage = await browser.newPage({ viewport: { width: 360, height: 500 }, hasTouch: true, isMobile: true });
await keyboardPage.goto(`${base}/?static=1#chat`, { waitUntil: "domcontentloaded" });
await keyboardPage.waitForTimeout(1000);
const input = keyboardPage.locator("textarea, input").last();
const keyboard = { tested: false, visible: false, bottom: null, viewportHeight: 500 };
if (await input.count()) {
  await input.focus();
  await input.scrollIntoViewIfNeeded();
  const box = await input.boundingBox();
  keyboard.tested = true;
  keyboard.bottom = box ? Number((box.y + box.height).toFixed(2)) : null;
  keyboard.visible = Boolean(box && box.y >= 0 && box.y + box.height <= 500);
}
await keyboardPage.close();
await browser.close();

const failures = [];
for (const result of results) {
  if (!result.viewportMeta.includes("viewport-fit=cover")) failures.push(`${result.profile}/${result.route}: viewport meta`);
  if (result.horizontalOverflow !== 0) failures.push(`${result.profile}/${result.route}: overflow ${result.horizontalOverflow}px`);
  if (!result.toggleVisible) failures.push(`${result.profile}/${result.route}: toggle hidden`);
}
for (const result of entrypointResults) {
  if (!result.viewportMeta.includes("viewport-fit=cover")) failures.push(`${result.profile}/${result.entrypoint}: viewport meta`);
  if (result.horizontalOverflow !== 0) failures.push(`${result.profile}/${result.entrypoint}: overflow ${result.horizontalOverflow}px`);
  if (!result.staticMode) failures.push(`${result.profile}/${result.entrypoint}: static class missing`);
}
if (!keyboard.tested || !keyboard.visible) failures.push("chat composer not visible in reduced keyboard viewport");

const evidence = { passed: failures.length === 0, failures, results, entrypointResults, keyboard, screenshots: results.length + profiles.length };
await writeFile(new URL("viewport-verification.json", import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ passed: evidence.passed, failures, screenshots: evidence.screenshots, keyboard }, null, 2));
if (failures.length) process.exitCode = 1;
