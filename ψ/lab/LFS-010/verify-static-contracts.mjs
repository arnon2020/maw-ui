import { chromium } from "/tmp/lfs007-pw/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:5174";
const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();

await page.goto(`${base}/#office`, { waitUntil: "domcontentloaded" });
const defaultsOn = await page.evaluate(() => document.documentElement.classList.contains("static-mode"));
await page.locator(".maw-static-toggle").click();
const toggleTurnsOff = await page.evaluate(() => !document.documentElement.classList.contains("static-mode"));
await page.reload({ waitUntil: "domcontentloaded" });
const persistedOff = await page.evaluate(() =>
  !document.documentElement.classList.contains("static-mode") && localStorage.getItem("maw-static-mode") === "0"
);
await page.goto(`${base}/?static=1#office`, { waitUntil: "domcontentloaded" });
const queryOverridesOn = await page.evaluate(() => document.documentElement.classList.contains("static-mode"));
await page.close();

async function captureCounts(mode) {
  const counts = new Map();
  const capturePage = await context.newPage();
  capturePage.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname !== "/api/capture") return;
    const target = url.searchParams.get("target") || "unknown";
    counts.set(target, (counts.get(target) || 0) + 1);
  });
  await capturePage.goto(`${base}/?static=${mode}#overview`, { waitUntil: "domcontentloaded" });
  await capturePage.waitForTimeout(5000);
  const animations = await capturePage.evaluate(() =>
    document.getAnimations().filter((animation) => animation.playState === "running").length
  );
  await capturePage.close();
  const values = [...counts.values()];
  return {
    targets: counts.size,
    requests: values.reduce((sum, value) => sum + value, 0),
    maxRequestsPerTarget: values.length ? Math.max(...values) : 0,
    runningCssAnimations: animations,
  };
}

const captures = {
  static: await captureCounts("1"),
  motion: await captureCounts("0"),
};
await context.close();
await browser.close();

const failures = [];
if (!defaultsOn) failures.push("default is not static");
if (!toggleTurnsOff) failures.push("toggle did not turn motion on");
if (!persistedOff) failures.push("localStorage did not persist motion mode");
if (!queryOverridesOn) failures.push("?static=1 did not override persisted mode");
if (captures.static.maxRequestsPerTarget > 1) failures.push("static thumbnails refreshed without interaction");
if (captures.static.runningCssAnimations !== 0) failures.push("static CSS animation running");
if (captures.motion.requests <= captures.static.requests) failures.push("motion thumbnails did not resume polling");

const evidence = {
  passed: failures.length === 0,
  failures,
  flag: { defaultsOn, toggleTurnsOff, persistedOff, queryOverridesOn },
  captures,
};
await writeFile(new URL("static-mode-contracts.json", import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (failures.length) process.exitCode = 1;
