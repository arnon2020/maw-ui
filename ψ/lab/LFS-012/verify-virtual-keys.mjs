import { chromium } from "/tmp/lfs007-pw/node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = process.env.LFS012_BASE || "http://127.0.0.1:5177";
let session = "lfs012-vkeys";
let target = `${session}:0`;
const screenshotDir = new URL("screenshots/", import.meta.url);
await mkdir(screenshotDir, { recursive: true });

const profiles = [
  { name: "mobile-360x800", width: 360, height: 800, keyboardHeight: 500 },
  { name: "mobile-390x844", width: 390, height: 844, keyboardHeight: 544 },
  { name: "tablet-768x1024", width: 768, height: 1024, keyboardHeight: 724 },
  { name: "landscape-844x390", width: 844, height: 390, keyboardHeight: 300 },
];
const surfaces = ["page", "modal"];
const keySequences = {
  esc: "\x1b",
  tab: "\t",
  left: "\x1b[D",
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  home: "\x1b[1~",
  end: "\x1b[4~",
  pageUp: "\x1b[5~",
  pageDown: "\x1b[6~",
  ctrlC: "\x03",
  ctrlD: "\x04",
  ctrlZ: "\x1a",
  ctrlL: "\x0c",
  ctrlR: "\x12",
  slash: "/",
  pipe: "|",
  enter: "\r",
};
const keyNames = Object.keys(keySequences);
const modifierProof = "\x1b[1;5A\x1b[1;5A\x1b\x1b[D\x1b\x1b[D";
const expectedHex = [...Buffer.from(`${Object.values(keySequences).join("")}${modifierProof}`)]
  .map((byte) => byte.toString(16).padStart(2, "0"));

function tmux(args, options = {}) {
  return execFileSync("tmux", args, { encoding: "utf8", ...options }).trim();
}

function killDisposable() {
  try { tmux(["kill-session", "-t", session]); } catch {}
}

function createDisposable(command = "bash --noprofile --norc") {
  killDisposable();
  tmux(["new-session", "-d", "-s", session, "-n", "terminal", command]);
}

function sendShell(command) {
  tmux(["send-keys", "-t", target, command, "Enter"]);
}

function paneMode() {
  return tmux(["display-message", "-p", "-t", target, "#{pane_in_mode}"]);
}

async function waitForPaneMode(expected, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (paneMode() === expected) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return paneMode() === expected;
}

async function openSurface(page, surface) {
  if (surface === "page") {
    await page.goto(`${base}/?static=1#terminal/${session}`, { waitUntil: "domcontentloaded" });
  } else {
    await page.goto(`${base}/?static=1#fleet`, { waitUntil: "domcontentloaded" });
    const row = page.locator(`[data-target="${target}"] [role="button"]`).first();
    await row.waitFor({ state: "visible" });
    // On mobile the directory row can start several screens below the fold.
    // A DOM click follows the same React handler without Playwright's
    // scroll-then-layout race against the responsive Fleet reordering.
    await row.evaluate((element) => element.click());
    const fullscreen = page.locator('[title^="Fullscreen"]').first();
    // The pinned preview can extend below a short landscape viewport. The
    // control is still the real UI path into the modal, so click it while
    // attached and reserve viewport/hit-testing assertions for the modal.
    await fullscreen.waitFor({ state: "attached" });
    await fullscreen.click({ force: true });
  }
  await page.waitForFunction(() => {
    const button = document.querySelector("[data-terminal-history-toggle]");
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await page.waitForTimeout(300);
}

async function hitTestBar(page) {
  const selectors = [
    ...keyNames.map((key) => `[data-terminal-key="${key}"]`),
    '[data-terminal-modifier="ctrl"]',
    '[data-terminal-modifier="alt"]',
    "[data-terminal-history-toggle]",
    "[data-terminal-keyboard]",
  ];
  const results = [];
  for (const selector of selectors) {
    const button = page.locator(selector).first();
    await button.scrollIntoViewIfNeeded();
    results.push(await button.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        selector: element.getAttribute("data-terminal-key")
          || element.getAttribute("data-terminal-modifier")
          || (element.hasAttribute("data-terminal-history-toggle") ? "history-live" : "keyboard"),
        width: box.width,
        height: box.height,
        centerX: x,
        centerY: y,
        inViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
        selfHit: hit === element || element.contains(hit),
        hitTag: hit?.tagName || null,
      };
    }));
  }
  return results;
}

async function geometry(page) {
  return page.evaluate(() => {
    const bar = document.querySelector("[data-terminal-key-bar]");
    const box = bar?.getBoundingClientRect();
    const modal = document.querySelector(".fixed.inset-0.z-50");
    const modalBox = modal?.getBoundingClientRect();
    return {
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      scrollY,
      barTop: box?.top ?? null,
      barBottom: box?.bottom ?? null,
      barVisible: Boolean(box && box.top >= 0 && box.bottom <= innerHeight),
      surfaceViewportLocked: modalBox
        ? modalBox.top === 0 && modalBox.bottom === innerHeight
        : document.documentElement.scrollHeight === innerHeight && scrollY === 0,
      runningAnimations: document.getAnimations().filter((animation) => animation.playState === "running").length,
    };
  });
}

const browser = await chromium.launch({ headless: true, executablePath: "/usr/bin/google-chrome" });
const results = {
  generatedAt: new Date().toISOString(),
  base,
  disposableTarget: target,
  keyBytes: [],
  history: null,
  states: [],
  summary: {},
};

try {
  // Real PTY byte proof for every virtual key. stty raw keeps Ctrl+C observable.
  for (const surfaceName of surfaces) {
    session = `lfs012-vkeys-${surfaceName}`;
    target = `${session}:0`;
    createDisposable();
    sendShell("stty raw -echo; od -An -tx1 -v -w1");
    const keyPage = await browser.newPage({ viewport: { width: 360, height: 800 } });
    await openSurface(keyPage, surfaceName);
    const keyHits = [];
    for (const key of keyNames) {
      const button = keyPage.locator(`[data-terminal-key="${key}"]`).first();
      await button.scrollIntoViewIfNeeded();
      const hit = (await hitTestBar(keyPage)).find((entry) => entry.selector === key);
      keyHits.push(hit);
      await button.click();
      await keyPage.waitForTimeout(80);
    }
    for (const modifier of ["ctrl", "alt"]) {
      const button = keyPage.locator(`[data-terminal-modifier="${modifier}"]`).first();
      await button.scrollIntoViewIfNeeded();
      const hit = (await hitTestBar(keyPage)).find((entry) => entry.selector === modifier);
      keyHits.push(hit);
      await button.click();
      const proofKey = modifier === "ctrl" ? "up" : "left";
      await keyPage.locator(`[data-terminal-key="${proofKey}"]`).first().click();
      await keyPage.locator(`[data-terminal-key="${proofKey}"]`).first().click();
      const stayedPressed = await button.getAttribute("aria-pressed");
      if (stayedPressed !== "true") throw new Error(`${modifier} modifier did not stay active`);
      await button.click();
    }
    await keyPage.waitForTimeout(400);
    await keyPage.close();
    const capture = tmux(["capture-pane", "-p", "-t", target, "-S", "-500"]);
    const actualHex = [...capture.matchAll(/(?:^|\s)([0-9a-f]{2})(?=\s|$)/g)]
      .map((match) => match[1])
      .slice(-expectedHex.length);
    results.keyBytes.push({
      surface: surfaceName,
      expectedHex,
      actualHex,
      passed: JSON.stringify(actualHex) === JSON.stringify(expectedHex),
      centersPassed: keyHits.every((hit) =>
        hit?.selfHit && hit?.inViewport && hit.width >= 48 && hit.height >= 48),
      capture,
    });
    killDisposable();
  }

  // Server-side history proof: seq output, SGR History/swipe enter copy mode,
  // and Live/Escape returns to the live prompt.
  session = "lfs012-vkeys-history";
  target = `${session}:0`;
  createDisposable();
  sendShell('printf "LFS012_HISTORY_START\\n"; seq 1 500; printf "LFS012_LIVE_END\\n"');
  const historyPage = await browser.newPage({ viewport: { width: 360, height: 800 } });
  await openSurface(historyPage, "page");
  const historyButton = historyPage.locator("[data-terminal-history-toggle]").first();
  await historyButton.click();
  const historyMode = await waitForPaneMode("1");
  await historyPage.waitForTimeout(300);
  const historyText = await historyPage.locator(".xterm-rows").innerText();
  await historyPage.screenshot({ path: fileURLToPath(new URL("history-copy-mode.png", screenshotDir)) });
  await historyButton.click();
  const liveMode = await waitForPaneMode("0");
  await historyPage.waitForTimeout(300);
  const liveText = await historyPage.locator(".xterm-rows").innerText();

  const surface = historyPage.locator("[data-terminal-touch-surface]").first();
  await surface.evaluate((element) => {
    const start = new Event("touchstart", { bubbles: true });
    Object.defineProperty(start, "touches", { value: [{ clientY: 120 }] });
    element.dispatchEvent(start);
    const end = new Event("touchend", { bubbles: true });
    Object.defineProperty(end, "changedTouches", { value: [{ clientY: 220 }] });
    element.dispatchEvent(end);
  });
  const swipeMode = await waitForPaneMode("1");
  await historyPage.locator('[data-terminal-key="esc"]').first().click();
  const escapeMode = await waitForPaneMode("0");
  results.history = {
    historyMode,
    historyShowsEarlyOutput: /LFS012_HISTORY_START|\b1\b/.test(historyText),
    liveMode,
    liveShowsTail: /LFS012_LIVE_END|500/.test(liveText),
    swipeMode,
    escapeMode,
  };
  await historyPage.close();
  killDisposable();

  // Real shell workflows at every required profile: typing, Ctrl+C, arrow-up
  // history recall and Tab completion. Scrollback is proven separately above.
  results.workflows = [];
  for (const profile of profiles) {
    session = `lfs012-workflow-${profile.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    target = `${session}:0`;
    createDisposable();
    const slug = profile.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    const tabPath = `/tmp/lfs012-tab-${slug}-proof`;
    const typeMarker = `LFS012_TYPE_${slug}`;
    const historyMarker = `LFS012_HISTORY_${slug}`;
    const tabMarker = `LFS012_TAB_${slug}`;
    const ctrlMarker = `LFS012_CTRL_C_${slug}`;
    sendShell(`printf '${tabMarker}\\\\n' > ${tabPath}`);
    const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height } });
    await openSurface(page, "page");
    const input = page.getByLabel("Terminal keyboard input");

    await input.fill(`echo ${typeMarker}`);
    await input.press("Enter");
    await input.fill(`echo ${historyMarker}`);
    await input.press("Enter");
    await page.locator('[data-terminal-key="up"]').first().click();
    await page.locator('[data-terminal-key="enter"]').first().click();

    await input.fill(`cat ${tabPath.replace(/-proof$/, "")}`);
    await page.locator('[data-terminal-key="tab"]').first().click();
    await page.locator('[data-terminal-key="enter"]').first().click();

    await input.fill("sleep 20");
    await input.press("Enter");
    await page.waitForTimeout(150);
    await page.locator('[data-terminal-key="ctrlC"]').first().click();
    await input.fill(`echo ${ctrlMarker}`);
    await input.press("Enter");
    await page.waitForTimeout(350);

    const pane = tmux(["capture-pane", "-p", "-t", target, "-S", "-100"]);
    const historyOccurrences = pane.split(historyMarker).length - 1;
    const workflow = {
      profile: profile.name,
      typing: pane.includes(typeMarker),
      ctrlC: pane.includes(ctrlMarker),
      historyRecall: historyOccurrences >= 4,
      tabCompletion: pane.includes(tabMarker),
    };
    results.workflows.push(workflow);
    await page.screenshot({
      path: fileURLToPath(new URL(`${profile.name}-terminal-workflow.png`, screenshotDir)),
    });
    await page.close();
    killDisposable();
  }

  // Responsive hit-target, keyboard, viewport and static-mode matrix.
  session = "lfs012-responsive-matrix";
  target = `${session}:0`;
  createDisposable();
  for (const profile of profiles) {
    for (const surfaceName of surfaces) {
      const page = await browser.newPage({
        viewport: { width: profile.width, height: profile.height },
      });
      await page.addInitScript(() => {
        const nativeRaf = window.requestAnimationFrame.bind(window);
        window.__lfs012RafCount = 0;
        window.requestAnimationFrame = (callback) => nativeRaf((time) => {
          window.__lfs012RafCount++;
          callback(time);
        });
      });
      await openSurface(page, surfaceName);
      // Allow the finite mount/fit work to settle, then measure a fresh idle
      // window. Static acceptance forbids recurring work, not initial layout.
      await page.waitForTimeout(1000);
      await page.evaluate(() => { window.__lfs012RafCount = 0; });
      await page.waitForTimeout(500);
      const before = {
        profile: profile.name,
        surface: surfaceName,
        phase: "before-keyboard",
        geometry: await geometry(page),
        rafCount: await page.evaluate(() => window.__lfs012RafCount),
        hitTargets: await hitTestBar(page),
      };
      results.states.push(before);
      await page.screenshot({
        path: fileURLToPath(new URL(`${profile.name}-${surfaceName}-before.png`, screenshotDir)),
      });

      const keyboardButton = page.locator("[data-terminal-keyboard]").first();
      await keyboardButton.scrollIntoViewIfNeeded();
      await keyboardButton.click();
      await page.setViewportSize({ width: profile.width, height: profile.keyboardHeight });
      await page.waitForTimeout(350);
      const keyboard = {
        profile: profile.name,
        surface: surfaceName,
        phase: "keyboard",
        geometry: await geometry(page),
        focusedTerminalInput: await page.evaluate(() => {
          const active = document.activeElement;
          return active?.getAttribute("aria-label") === "Terminal keyboard input"
            || active?.classList.contains("xterm-helper-textarea")
            || false;
        }),
        hitTargets: await hitTestBar(page),
      };
      results.states.push(keyboard);
      await page.screenshot({
        path: fileURLToPath(new URL(`${profile.name}-${surfaceName}-keyboard.png`, screenshotDir)),
      });
      await page.close();
      if (paneMode() === "1") tmux(["send-keys", "-t", target, "Escape"]);
    }
  }

  const allHits = results.states.flatMap((state) => state.hitTargets);
  results.summary = {
    profiles: profiles.length,
    surfaces: surfaces.length,
    phases: 2,
    states: results.states.length,
    centersTested: allHits.length,
    centerHitsPassed: allHits.filter((hit) => hit.selfHit && hit.inViewport).length,
    minimumTargetPassed: allHits.filter((hit) => hit.width >= 48 && hit.height >= 48).length,
    barsVisible: results.states.filter((state) => state.geometry.barVisible).length,
    noHorizontalOverflow: results.states.filter((state) => state.geometry.documentWidth <= state.geometry.viewportWidth).length,
    viewportLocked: results.states.filter((state) => state.geometry.surfaceViewportLocked).length,
    keyboardFocusPassed: results.states.filter((state) => state.phase !== "keyboard" || state.focusedTerminalInput).length,
    staticIdleRafPassed: results.states.filter((state) => state.phase !== "before-keyboard" || state.rafCount === 0).length,
    staticAnimationsPassed: results.states.filter((state) => state.geometry.runningAnimations === 0).length,
  };
  results.passed = Boolean(
    results.keyBytes.every((proof) => proof.passed && proof.centersPassed)
    && Object.values(results.history).every(Boolean)
    && results.workflows.every((workflow) =>
      workflow.typing && workflow.ctrlC && workflow.historyRecall && workflow.tabCompletion)
    && results.summary.centerHitsPassed === allHits.length
    && results.summary.minimumTargetPassed === allHits.length
    && results.summary.barsVisible === results.states.length
    && results.summary.noHorizontalOverflow === results.states.length
    && results.summary.viewportLocked === results.states.length
    && results.summary.keyboardFocusPassed === results.states.length
    && results.summary.staticIdleRafPassed === results.states.length
    && results.summary.staticAnimationsPassed === results.states.length
  );
} finally {
  await browser.close();
  killDisposable();
}

await writeFile(
  new URL("virtual-keys-verification.json", import.meta.url),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(JSON.stringify({ passed: results.passed, summary: results.summary, history: results.history, keyBytes: results.keyBytes }, null, 2));
if (!results.passed) process.exitCode = 1;
