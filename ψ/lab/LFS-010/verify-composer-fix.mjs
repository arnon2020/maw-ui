import { chromium } from "/tmp/lfs007-pw/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:5174";
const profiles = [
  { name: "mobile-360x800", width: 360, height: 800, keyboardHeight: 500 },
  { name: "tablet-768x1024", width: 768, height: 1024, keyboardHeight: 724 },
  { name: "tablet-820x1180", width: 820, height: 1180, keyboardHeight: 880 },
  { name: "landscape-844x390", width: 844, height: 390, keyboardHeight: 300 },
];
const pages = [
  { name: "main-chat-route", path: "/?static=1#chat", selector: 'input[placeholder*="Message @"], input[placeholder^="no agents"]', liveThread: true },
  { name: "standalone-chat", path: "/chat.html?static=1", selector: 'input[placeholder*="Message @"], input[placeholder^="no agents"]', liveThread: true },
  { name: "main-vs-route", path: "/?static=1#vs", selector: 'input[placeholder="Type command..."]' },
  { name: "workspace", path: "/workspace.html?static=1", selector: 'input[placeholder="message..."]' },
  { name: "talk", path: "/talk.html?static=1", selector: "#msgInput" },
];
const screenshotDir = new URL("composer-fix-screenshots/", import.meta.url);
await mkdir(screenshotDir, { recursive: true });

function visible(bounds) {
  return Boolean(
    bounds.found
    && bounds.top >= 0
    && bounds.bottom <= bounds.viewportHeight
    && bounds.documentScrollY === 0
  );
}

async function measure(page, selector) {
  return page.evaluate((selector) => {
    const inputs = document.querySelectorAll(selector);
    const input = inputs[inputs.length - 1];
    const box = input?.getBoundingClientRect();
    const inputLayout = input?.parentElement?.parentElement;
    const scroller = inputLayout?.querySelector(".overflow-y-auto");
    const messageLabel = [...document.querySelectorAll("span")]
      .map((node) => node.textContent?.trim() || "")
      .find((text) => /^\d+ msgs$/.test(text));
    return {
      found: Boolean(input),
      top: box ? Number(box.top.toFixed(2)) : null,
      bottom: box ? Number(box.bottom.toFixed(2)) : null,
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      documentScrollY: window.scrollY,
      messageCount: messageLabel ? Number.parseInt(messageLabel, 10) : null,
      threadClientHeight: scroller?.clientHeight ?? null,
      threadScrollHeight: scroller?.scrollHeight ?? null,
    };
  }, selector);
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
});
const results = [];

for (const profile of profiles) {
  for (const target of pages) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      hasTouch: true,
      isMobile: profile.width < 600,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.goto(`${base}${target.path}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);

    // Acceptance explicitly calls for a cold reload with the real, already-long feed.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1_500);
    await page.locator(target.selector).last().waitFor({ state: "visible" });

    const beforeFocus = await measure(page, target.selector);
    await page.screenshot({
      path: decodeURIComponent(new URL(`${profile.name}-${target.name}-before.png`, screenshotDir).pathname),
    });

    await page.locator(target.selector).last().focus();
    await page.setViewportSize({ width: profile.width, height: profile.keyboardHeight });
    await page.waitForTimeout(300);
    const afterKeyboard = await measure(page, target.selector);
    await page.screenshot({
      path: decodeURIComponent(new URL(`${profile.name}-${target.name}-keyboard.png`, screenshotDir).pathname),
    });

    results.push({
      profile: profile.name,
      page: target.name,
      coldReload: true,
      liveThread: Boolean(target.liveThread),
      beforeFocus: { ...beforeFocus, visible: visible(beforeFocus) },
      afterKeyboard: { ...afterKeyboard, visible: visible(afterKeyboard) },
    });
    await context.close();
  }
}
await browser.close();

const failures = results.flatMap((result) => {
  const failures = [];
  if (!result.beforeFocus.visible) failures.push(`${result.profile}/${result.page}: hidden before focus`);
  if (!result.afterKeyboard.visible) failures.push(`${result.profile}/${result.page}: hidden after keyboard`);
  if (result.beforeFocus.documentHeight !== result.beforeFocus.viewportHeight) {
    failures.push(`${result.profile}/${result.page}: document scrolls before focus`);
  }
  if (result.afterKeyboard.documentHeight !== result.afterKeyboard.viewportHeight) {
    failures.push(`${result.profile}/${result.page}: document scrolls after keyboard`);
  }
  return failures;
});
const evidence = {
  passed: failures.length === 0,
  failures,
  liveThreadMinimumMessageCount: Math.min(
    ...results
      .filter((result) => result.liveThread)
      .map((result) => result.beforeFocus.messageCount ?? 0),
  ),
  results,
};
await writeFile(
  new URL("composer-fix-verification.json", import.meta.url),
  `${JSON.stringify(evidence, null, 2)}\n`,
);
console.log(JSON.stringify(evidence, null, 2));
if (failures.length) process.exitCode = 1;
