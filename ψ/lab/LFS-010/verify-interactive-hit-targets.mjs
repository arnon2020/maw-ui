import { chromium } from "/tmp/lfs007-pw/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:5174";
const profiles = [
  { name: "mobile-360x800", width: 360, height: 800, keyboardHeight: 500, mobile: true },
  { name: "tablet-768x1024", width: 768, height: 1024, keyboardHeight: 724 },
  { name: "tablet-820x1180", width: 820, height: 1180, keyboardHeight: 880 },
  { name: "landscape-844x390", width: 844, height: 390, keyboardHeight: 300 },
];
const routes = [
  "office", "fleet", "mission", "dashboard", "overview", "vs",
  "terminal", "chat", "teams", "config", "federation",
].map((route) => ({ name: `route-${route}`, path: `/?static=1#${route}` }));
const entrypoints = [
  "index.html", "mission.html", "fleet.html", "dashboard.html", "terminal.html",
  "office.html", "overview.html", "chat.html", "config.html", "inbox.html",
  "federation.html", "federation_2d.html", "workspace.html", "arena.html",
  "talk.html", "timemachine.html", "shrine.html",
].map((entry) => ({ name: entry, path: `/${entry}?static=1` }));
const targets = [...routes, ...entrypoints];
const screenshotDir = new URL("hit-target-screenshots/", import.meta.url);
await mkdir(screenshotDir, { recursive: true });

async function hitTest(page) {
  return page.evaluate(() => {
    const selector = "button,a[href],input,textarea,select,summary,[role='button']";
    const controls = [...document.querySelectorAll(selector)];
    const tested = [];
    const blocked = [];
    for (const control of controls) {
      if (control.disabled) continue;
      const style = getComputedStyle(control);
      const box = control.getBoundingClientRect();
      const centerX = box.left + box.width / 2;
      const centerY = box.top + box.height / 2;
      if (
        box.width < 2 || box.height < 2
        || centerX < 0 || centerX >= innerWidth || centerY < 0 || centerY >= innerHeight
        || style.display === "none" || style.visibility === "hidden"
        || Number(style.opacity) < 0.05 || style.pointerEvents === "none"
      ) continue;
      const hit = document.elementFromPoint(centerX, centerY);
      const hitControl = hit?.closest(selector);
      const passed = hitControl === control || control.contains(hit);
      let blockingLayer = hit;
      while (blockingLayer && blockingLayer !== document.body) {
        const position = getComputedStyle(blockingLayer).position;
        if (position === "fixed") break;
        blockingLayer = blockingLayer.parentElement;
      }
      const blockedByFixed = Boolean(
        !passed && blockingLayer && blockingLayer !== document.body
        && !blockingLayer.contains(control) && !control.contains(blockingLayer)
      );
      const label = (
        control.getAttribute("aria-label")
        || control.getAttribute("title")
        || control.textContent
        || control.getAttribute("placeholder")
        || ""
      ).trim().replace(/\s+/g, " ").slice(0, 100);
      const important = Boolean(
        control.matches(
          ".maw-static-toggle,#sendBtn,"
          + "input[placeholder*='Message @'],input[placeholder^='no agents'],"
          + "input[placeholder='message...'],input[placeholder='Type command...']"
        )
        || label === "Send"
        || [
          "Oracle Search (⌘K)", "Broadcast to all agents", "Change notification sound",
          "Multi-card view (click for single)", "Single card view (click for multi)",
          "Showing all (click: local only)", "Showing local (click: remote only)",
          "Showing remote (click: all)",
        ].includes(label)
      );
      const descriptor = {
        tag: control.tagName.toLowerCase(),
        id: control.id || null,
        className: typeof control.className === "string" ? control.className.slice(0, 120) : null,
        label,
        center: [Number(centerX.toFixed(2)), Number(centerY.toFixed(2))],
        hitTag: hitControl?.tagName.toLowerCase() || hit?.tagName.toLowerCase() || null,
        hitClass: typeof hitControl?.className === "string" ? hitControl.className.slice(0, 120) : null,
        passed,
        important,
        blockedByFixed,
      };
      tested.push(descriptor);
      if (!passed) blocked.push(descriptor);
    }
    const toggle = document.querySelector(".maw-static-toggle");
    const toggleBox = toggle?.getBoundingClientRect();
    const toggleHit = toggleBox
      ? document.elementFromPoint(toggleBox.left + toggleBox.width / 2, toggleBox.top + toggleBox.height / 2)
      : null;
    return {
      tested: tested.length,
      blocked,
      importantBlocked: blocked.filter((item) => item.important),
      fixedOverlayBlocked: blocked.filter((item) => item.blockedByFixed),
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      toggle: {
        found: Boolean(toggle),
        visible: Boolean(toggleBox && toggleBox.width > 0 && toggleBox.height > 0
          && toggleBox.left >= 0 && toggleBox.right <= innerWidth && toggleBox.top >= 0 && toggleBox.bottom <= innerHeight),
        centerHitsSelf: Boolean(toggle && (toggleHit === toggle || toggle.contains(toggleHit))),
        parent: toggle?.parentElement?.matches("header,#topbar,.top-bar,.header") || false,
      },
    };
  });
}

async function focusBottomInput(page, targetName) {
  const selectors = targetName.includes("chat")
    ? ['input[placeholder*="Message @"]', 'input[placeholder^="no agents"]']
    : targetName === "route-vs"
      ? ['input[placeholder="Type command..."]']
    : targetName === "workspace.html"
      ? ['input[placeholder="message..."]']
      : targetName === "talk.html"
        ? ["#msgInput"]
        : [];
  for (const selector of selectors) {
    const input = page.locator(selector).last();
    if (await input.count() && await input.isVisible()) {
      await input.focus();
      return selector;
    }
  }
  return null;
}

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
const results = [];
for (const profile of profiles) {
  const context = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    hasTouch: true,
    isMobile: Boolean(profile.mobile),
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    // Multi-card is a deliberate full-screen modal layer; keep it closed so
    // this harness audits page controls rather than intentionally covered DOM.
    localStorage.setItem("office-multiview", "0");
    localStorage.setItem("office-multicards", "[]");
  });
  const page = await context.newPage();
  for (const target of targets) {
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto(`${base}${target.path}`, { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));
    const before = await hitTest(page);
    const focused = await focusBottomInput(page, target.name);
    await page.setViewportSize({ width: profile.width, height: profile.keyboardHeight });
    await page.waitForTimeout(150);
    const afterKeyboard = await hitTest(page);
    results.push({ profile: profile.name, page: target.name, focused, before, afterKeyboard });

    if (target.name === "route-chat") {
      await page.screenshot({
        path: decodeURIComponent(new URL(`${profile.name}-chat-keyboard.png`, screenshotDir).pathname),
      });
    }
  }
  await context.close();
}
await browser.close();

const failures = results.flatMap((result) => {
  const failures = [];
  for (const [phase, value] of [["before", result.before], ["afterKeyboard", result.afterKeyboard]]) {
    if (value.importantBlocked.length) failures.push(`${result.profile}/${result.page}/${phase}: ${value.importantBlocked.length} important centers blocked`);
    if (value.fixedOverlayBlocked.length) failures.push(`${result.profile}/${result.page}/${phase}: ${value.fixedOverlayBlocked.length} centers blocked by fixed overlays`);
    if (!value.toggle.found || !value.toggle.visible || !value.toggle.centerHitsSelf || !value.toggle.parent) {
      failures.push(`${result.profile}/${result.page}/${phase}: toggle inaccessible`);
    }
    if (value.horizontalOverflow !== 0) failures.push(`${result.profile}/${result.page}/${phase}: ${value.horizontalOverflow}px horizontal overflow`);
  }
  return failures;
});
const evidence = {
  passed: failures.length === 0,
  failures,
  summary: {
    profiles: profiles.length,
    pages: targets.length,
    phases: 2,
    states: results.length * 2,
    centersTested: results.reduce((sum, result) => sum + result.before.tested + result.afterKeyboard.tested, 0),
    blockedCenters: results.reduce((sum, result) => sum + result.before.blocked.length + result.afterKeyboard.blocked.length, 0),
    importantBlockedCenters: results.reduce((sum, result) => sum + result.before.importantBlocked.length + result.afterKeyboard.importantBlocked.length, 0),
    fixedOverlayBlockedCenters: results.reduce((sum, result) => sum + result.before.fixedOverlayBlocked.length + result.afterKeyboard.fixedOverlayBlocked.length, 0),
    accessibleToggles: results.reduce((sum, result) =>
      sum + Number(result.before.toggle.centerHitsSelf) + Number(result.afterKeyboard.toggle.centerHitsSelf), 0),
  },
  results,
};
await writeFile(new URL("interactive-hit-target-verification.json", import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ passed: evidence.passed, failures, summary: evidence.summary }, null, 2));
if (failures.length) process.exitCode = 1;
