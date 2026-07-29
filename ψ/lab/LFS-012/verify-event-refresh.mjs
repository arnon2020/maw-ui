import { chromium } from "/tmp/lfs007-pw/node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = process.env.LFS012_BASE || "http://127.0.0.1:5177";
const profiles = [
  { name: "mobile-360x800", width: 360, height: 800 },
  { name: "mobile-390x844", width: 390, height: 844 },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "landscape-844x390", width: 844, height: 390 },
];

function tmux(args, options = {}) {
  return execFileSync("tmux", args, { encoding: "utf8", ...options }).trim();
}

function killSession(name) {
  try { tmux(["kill-session", "-t", name]); } catch {}
}

function createSession(name, command = "bash --noprofile --norc") {
  killSession(name);
  tmux(["new-session", "-d", "-s", name, "-n", "terminal", command]);
}

function capture(name) {
  return tmux(["capture-pane", "-p", "-t", `${name}:0`, "-S", "-100"]);
}

async function waitForTarget(page, target) {
  const wrapper = page.locator(`[data-target="${target}"]`).first();
  await wrapper.waitFor({ state: "attached", timeout: 15_000 });
  return wrapper;
}

function observeCaptureRequests(page, target) {
  const requests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/capture" && url.searchParams.get("target") === target) {
      requests.push({ at: Date.now(), url: request.url() });
    }
  });
  return requests;
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
});
const result = {
  generatedAt: new Date().toISOString(),
  base,
  liveTerminal: {},
  previewRefresh: {},
  fleet: { profiles: [] },
};

try {
  // Actual XTerminal must update from PTY bytes in Static Mode. Capture refreshes
  // are allowed only as a finite event-driven burst and must stop when idle.
  const liveSession = "lfs012-live";
  const liveTarget = `${liveSession}:0`;
  createSession(liveSession);
  const livePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const liveRequests = observeCaptureRequests(livePage, liveTarget);
  await livePage.goto(`${base}/?static=1#terminal/${liveSession}`, { waitUntil: "domcontentloaded" });
  const liveInput = livePage.getByLabel("Terminal keyboard input");
  await liveInput.waitFor({ state: "visible" });
  await livePage.waitForFunction(() => {
    const input = document.querySelector('[aria-label="Terminal keyboard input"]');
    return input instanceof HTMLInputElement && !input.disabled;
  });
  await livePage.waitForTimeout(1_200);
  liveRequests.length = 0;
  const liveStarted = Date.now();
  await liveInput.fill("echo LFS012_LIVE_OK");
  await liveInput.press("Enter");
  await livePage.waitForFunction(
    () => document.querySelector(".xterm-rows")?.textContent?.includes("LFS012_LIVE_OK"),
    undefined,
    { timeout: 2_000 },
  );
  const liveLatencyMs = Date.now() - liveStarted;
  await livePage.waitForTimeout(1_300);
  const eventRequestCount = liveRequests.length;
  liveRequests.length = 0;
  await livePage.waitForTimeout(2_000);
  result.liveTerminal = {
    outputVisible: true,
    latencyMs: liveLatencyMs,
    finiteEventCaptureRequests: eventRequestCount,
    idleCaptureRequests: liveRequests.length,
    paneContainsMarker: capture(liveSession).includes("LFS012_LIVE_OK"),
  };
  await livePage.close();
  killSession(liveSession);

  // Fleet pinned preview: safely mutate only the disposable pane out-of-band,
  // then use the preview's explicit refresh control. Fleet rows intentionally
  // have no terminal-key controls; terminal input belongs on terminal surfaces.
  const previewSession = "lfs012-preview";
  const previewTarget = `${previewSession}:0`;
  createSession(previewSession);
  const previewPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const previewRequests = observeCaptureRequests(previewPage, previewTarget);
  await previewPage.goto(`${base}/?static=1#fleet`, { waitUntil: "domcontentloaded" });
  const previewWrapper = await waitForTarget(previewPage, previewTarget);
  await previewWrapper.locator('[role="button"]').first().evaluate((element) => element.click());
  await previewPage.getByPlaceholder("type command...").waitFor({ state: "visible" });
  await previewPage.waitForTimeout(1_200);
  previewRequests.length = 0;
  tmux(["send-keys", "-t", previewTarget, "echo LFS012_PREVIEW_OK", "Enter"]);
  const previewStarted = Date.now();
  const refresh = previewPage.locator('.fixed.pointer-events-auto [title="Refresh preview"]').first();
  await refresh.click();
  await previewPage.waitForFunction(
    () => document.body.textContent?.includes("LFS012_PREVIEW_OK"),
    undefined,
    { timeout: 2_000 },
  );
  const previewLatencyMs = Date.now() - previewStarted;
  await previewPage.waitForTimeout(1_300);
  const previewEventRequests = previewRequests.length;
  await previewPage.waitForTimeout(1_000);
  previewRequests.length = 0;
  await previewPage.waitForTimeout(2_000);
  result.previewRefresh = {
    outputVisible: true,
    latencyMs: previewLatencyMs,
    finiteEventCaptureRequests: previewEventRequests,
    manualRefreshRequests: previewEventRequests,
    idleCaptureRequests: previewRequests.length,
    paneContainsMarker: capture(previewSession).includes("LFS012_PREVIEW_OK"),
  };
  await previewPage.close();
  killSession(previewSession);

  // Fleet must retain the responsive grouping/order work while containing no
  // terminal key bars or virtual-key buttons.
  const fleetSession = "lfs012-fleet-no-keys";
  const fleetTarget = `${fleetSession}:0`;
  createSession(fleetSession);
  for (const profile of profiles) {
    const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height } });
    await page.goto(`${base}/?static=1#fleet`, { waitUntil: "domcontentloaded" });
    await waitForTarget(page, fleetTarget);
    const initial = await page.evaluate(() => {
      const controls = document.querySelector('[aria-label="Fleet grouping controls"]');
      const firstGroup = document.querySelector('section[aria-label*=" group with"] > [role="button"]');
      const controlsBox = controls?.getBoundingClientRect();
      const groupBox = firstGroup?.getBoundingClientRect();
      return {
        controlsTop: controlsBox?.top ?? null,
        controlsBottom: controlsBox?.bottom ?? null,
        firstGroupTop: groupBox?.top ?? null,
        firstGroupBottom: groupBox?.bottom ?? null,
        firstGroupInViewport: Boolean(groupBox && groupBox.top >= 0 && groupBox.top < innerHeight),
        fleetKeyCount: document.querySelectorAll("[data-fleet-key]").length,
        fleetKeyBarCount: document.querySelectorAll("[data-fleet-key-bar]").length,
      };
    });
    if (profile.name === "mobile-390x844") {
      await page.screenshot({
        path: fileURLToPath(new URL("screenshots/fleet-390-group-first.png", import.meta.url)),
      });
    }
    result.fleet.profiles.push({ profile: profile.name, initial });
    await page.close();
  }
  killSession(fleetSession);
} finally {
  await browser.close();
  for (const name of ["lfs012-live", "lfs012-preview", "lfs012-fleet-no-keys"]) killSession(name);
}

result.summary = {
  liveTerminalPassed: result.liveTerminal.outputVisible
    && result.liveTerminal.latencyMs < 2_000
    && result.liveTerminal.paneContainsMarker
    && result.liveTerminal.finiteEventCaptureRequests > 0
    && result.liveTerminal.idleCaptureRequests === 0,
  previewRefreshPassed: result.previewRefresh.outputVisible
    && result.previewRefresh.latencyMs < 2_000
    && result.previewRefresh.paneContainsMarker
    && result.previewRefresh.finiteEventCaptureRequests > 0
    && result.previewRefresh.manualRefreshRequests > 0
    && result.previewRefresh.idleCaptureRequests === 0,
  fleetProfilesWithoutKeys: result.fleet.profiles
    .filter((profile) => profile.initial.fleetKeyCount === 0 && profile.initial.fleetKeyBarCount === 0).length,
  mobileFirstGroupPassed: result.fleet.profiles
    .filter((profile) => profile.profile.startsWith("mobile"))
    .every((profile) => profile.initial.firstGroupInViewport),
};
result.passed = result.summary.liveTerminalPassed
  && result.summary.previewRefreshPassed
  && result.summary.fleetProfilesWithoutKeys === profiles.length
  && result.summary.mobileFirstGroupPassed
  ;

await writeFile(
  new URL("event-refresh-verification.json", import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify({ passed: result.passed, summary: result.summary, liveTerminal: result.liveTerminal, previewRefresh: result.previewRefresh }, null, 2));
if (!result.passed) process.exitCode = 1;
