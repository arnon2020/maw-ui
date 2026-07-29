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
const fleetKeys = ["esc", "left", "up", "down", "right", "enter"];
const expectedFleetSequences = [
  "\x1b", "\x1b[D", "\x1b[A", "\x1b[B", "\x1b[C", "\r",
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

function observeCaptureRequests(page) {
  const requests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/capture?")) {
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
  fleet: { profiles: [], byteProof: {} },
};

try {
  // Actual XTerminal must update from PTY bytes in Static Mode. Capture refreshes
  // are allowed only as a finite event-driven burst and must stop when idle.
  const liveSession = "lfs012-live";
  const liveTarget = `${liveSession}:0`;
  createSession(liveSession);
  const livePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const liveRequests = observeCaptureRequests(livePage);
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
  // then Fleet Enter must event-refresh that new output within two seconds.
  // The production /ws intentionally rejects input to non-Claude bash panes,
  // so this proves the refresh trigger without touching a real user PTY.
  const previewSession = "lfs012-preview";
  const previewTarget = `${previewSession}:0`;
  createSession(previewSession);
  const previewPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const previewRequests = observeCaptureRequests(previewPage);
  await previewPage.goto(`${base}/?static=1#fleet`, { waitUntil: "domcontentloaded" });
  const previewWrapper = await waitForTarget(previewPage, previewTarget);
  await previewWrapper.locator('[role="button"]').first().evaluate((element) => element.click());
  await previewPage.getByPlaceholder("type command...").waitFor({ state: "visible" });
  await previewPage.waitForTimeout(1_200);
  previewRequests.length = 0;
  tmux(["send-keys", "-t", previewTarget, "echo LFS012_PREVIEW_OK", "Enter"]);
  const previewStarted = Date.now();
  await previewWrapper.locator('[data-fleet-key="enter"]').evaluate((element) => element.click());
  await previewPage.waitForFunction(
    () => document.body.textContent?.includes("LFS012_PREVIEW_OK"),
    undefined,
    { timeout: 2_000 },
  );
  const previewLatencyMs = Date.now() - previewStarted;
  await previewPage.waitForTimeout(1_300);
  const previewEventRequests = previewRequests.length;
  previewRequests.length = 0;
  const refresh = previewPage.locator('.fixed.pointer-events-auto [title="Refresh preview"]').first();
  await refresh.click();
  await previewPage.waitForTimeout(300);
  const manualRequests = previewRequests.length;
  await previewPage.waitForTimeout(1_000);
  previewRequests.length = 0;
  await previewPage.waitForTimeout(2_000);
  result.previewRefresh = {
    outputVisible: true,
    latencyMs: previewLatencyMs,
    finiteEventCaptureRequests: previewEventRequests,
    manualRefreshRequests: manualRequests,
    idleCaptureRequests: previewRequests.length,
    paneContainsMarker: capture(previewSession).includes("LFS012_PREVIEW_OK"),
  };
  await previewPage.close();
  killSession(previewSession);

  // Every Fleet quick key is center-hittable at every required profile. The
  // first grouped room must be in the initial mobile viewport before scrolling.
  const fleetSession = "lfs012-fleetkeys";
  const fleetTarget = `${fleetSession}:0`;
  createSession(fleetSession);
  const fleetFrames = [];
  for (const profile of profiles) {
    const page = await browser.newPage({ viewport: { width: profile.width, height: profile.height } });
    page.on("websocket", (socket) => {
      if (!socket.url().endsWith("/ws")) return;
      socket.on("framesent", (event) => {
        try {
          const message = JSON.parse(String(event.payload));
          if (message.type === "send" && message.target === fleetTarget) {
            fleetFrames.push(message.text);
          }
        } catch {}
      });
    });
    await page.goto(`${base}/?static=1#fleet`, { waitUntil: "domcontentloaded" });
    const wrapper = await waitForTarget(page, fleetTarget);
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
      };
    });
    if (profile.name === "mobile-390x844") {
      await page.screenshot({
        path: fileURLToPath(new URL("screenshots/fleet-390-group-first.png", import.meta.url)),
      });
    }
    const keys = [];
    for (const key of fleetKeys) {
      const button = wrapper.locator(`[data-fleet-key="${key}"]`);
      await button.scrollIntoViewIfNeeded();
      const hit = await button.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const center = document.elementFromPoint(x, y);
        return {
          key: element.getAttribute("data-fleet-key"),
          width: box.width,
          height: box.height,
          inViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
          selfHit: center === element || element.contains(center),
        };
      });
      keys.push(hit);
      if (profile === profiles[0]) {
        await button.click();
        await page.waitForTimeout(80);
      }
    }
    result.fleet.profiles.push({ profile: profile.name, initial, keys });
    await page.close();
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  result.fleet.byteProof = {
    note: "Exact WebSocket input frames from UI; backend rejection of disposable non-Claude pane is expected.",
    expectedSequences: expectedFleetSequences,
    actualSequences: fleetFrames,
    passed: JSON.stringify(expectedFleetSequences) === JSON.stringify(fleetFrames),
  };
  killSession(fleetSession);
} finally {
  await browser.close();
  for (const name of ["lfs012-live", "lfs012-preview", "lfs012-fleetkeys"]) killSession(name);
}

const fleetHits = result.fleet.profiles.flatMap((profile) => profile.keys);
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
  fleetCentersPassed: fleetHits.filter((hit) =>
    hit.selfHit && hit.inViewport && hit.width >= 48 && hit.height >= 48).length,
  fleetCentersTested: fleetHits.length,
  mobileFirstGroupPassed: result.fleet.profiles
    .filter((profile) => profile.profile.startsWith("mobile"))
    .every((profile) => profile.initial.firstGroupInViewport),
  fleetByteProofPassed: result.fleet.byteProof.passed,
};
result.passed = result.summary.liveTerminalPassed
  && result.summary.previewRefreshPassed
  && result.summary.fleetCentersPassed === result.summary.fleetCentersTested
  && result.summary.mobileFirstGroupPassed
  && result.summary.fleetByteProofPassed;

await writeFile(
  new URL("event-refresh-verification.json", import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify({ passed: result.passed, summary: result.summary, liveTerminal: result.liveTerminal, previewRefresh: result.previewRefresh, fleetByteProof: result.fleet.byteProof }, null, 2));
if (!result.passed) process.exitCode = 1;
