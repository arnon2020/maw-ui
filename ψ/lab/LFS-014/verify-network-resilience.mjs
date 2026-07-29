import { chromium } from "/tmp/lfs007-pw/node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const base = process.env.LFS014_BASE || "http://127.0.0.1:5178";
const screenshotDir = new URL("screenshots/", import.meta.url);
await mkdir(screenshotDir, { recursive: true });

function tmux(args, options = {}) {
  return execFileSync("tmux", args, { encoding: "utf8", ...options }).trim();
}

const sendSession = "lfs014-send-proof";
const sendTarget = `${sendSession}:0`;
function killSendSession() {
  try { tmux(["kill-session", "-t", sendSession]); } catch {}
}

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const result = {
  generatedAt: new Date().toISOString(),
  base,
  uiState: {},
  boundedRetry: {},
  send: {},
  staticMode: {},
};

try {
  let boundedRequests = 0;
  const boundedTimes = [];
  await page.route("**/api/lfs014-always-fail", async (route) => {
    boundedRequests++;
    boundedTimes.push(Date.now());
    await route.abort("connectionreset");
  });

  let failUiWrites = true;
  const uiRequests = [];
  await page.route("**/api/ui-state**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
      return;
    }
    const body = request.postData() || "";
    uiRequests.push({
      at: Date.now(),
      bodyLength: body.length,
      fleetGroupMode: body.includes('"fleetGroupMode":"team"') ? "team" : "other",
      failed: failUiWrites,
    });
    if (failUiWrites) await route.abort("connectionreset");
    else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"ok":true}',
      });
    }
  });

  await page.goto(`${base}/?static=1#fleet`, { waitUntil: "domcontentloaded" });
  const teamButton = page.getByRole("button", { name: "team", exact: true });
  await teamButton.waitFor({ state: "visible" });
  await page.waitForTimeout(1200);
  uiRequests.length = 0;

  await teamButton.click();
  await page.waitForFunction(() => {
    const raw = localStorage.getItem("maw.fleet");
    return raw?.includes('"fleetGroupMode":"team"');
  });
  const firstFailureDeadline = Date.now() + 4_000;
  while (uiRequests.length < 1 && Date.now() < firstFailureDeadline) {
    await page.waitForTimeout(100);
  }
  const pendingAfterFailure = await page.evaluate(() => localStorage.getItem("maw.ui-state.pending"));
  const localAfterFailure = await page.evaluate(() => localStorage.getItem("maw.fleet"));
  await page.context().setOffline(true);
  await page.locator('[data-network-status="offline"]').waitFor({ state: "visible" });
  const indicatorDuringFailure = await page.locator("[data-network-status]").textContent();
  await page.screenshot({
    path: fileURLToPath(new URL("mobile-pending-retry.png", screenshotDir)),
  });

  failUiWrites = false;
  const requestCountBeforeRecovery = uiRequests.length;
  await page.context().setOffline(false);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const recoveryDeadline = Date.now() + 4_000;
  while (!uiRequests.slice(requestCountBeforeRecovery).some((entry) => !entry.failed)
    && Date.now() < recoveryDeadline) {
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(300);
  const pendingAfterRecovery = await page.evaluate(() => localStorage.getItem("maw.ui-state.pending"));
  const indicatorAfterRecovery = await page.locator("[data-network-status]").count();
  const recoveryWrites = uiRequests.slice(requestCountBeforeRecovery).filter((entry) => !entry.failed);
  result.uiState = {
    failedAttemptsBeforeRecovery: requestCountBeforeRecovery,
    localValueSurvived: Boolean(localAfterFailure?.includes('"fleetGroupMode":"team"')),
    pendingSurvived: Boolean(pendingAfterFailure?.includes('"fleetGroupMode":"team"')),
    indicatorDuringFailure,
    recoveryWrites: recoveryWrites.length,
    recoveryBodyIsLatest: recoveryWrites[0]?.fleetGroupMode === "team",
    pendingCleared: pendingAfterRecovery === null,
    indicatorCleared: indicatorAfterRecovery === 0,
    requests: uiRequests,
  };

  const boundedResult = await page.evaluate(async () => {
    const { fetchWithRetry } = await import("/src/lib/fetchWithRetry.ts");
    try {
      await fetchWithRetry("/api/lfs014-always-fail");
      return "unexpected-success";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
  const boundedCountAtStop = boundedRequests;
  await page.waitForTimeout(2_000);
  result.boundedRetry = {
    result: boundedResult,
    attempts: boundedCountAtStop,
    attemptsAfterQuietWindow: boundedRequests,
    stopped: boundedCountAtStop === 4 && boundedRequests === 4,
    elapsedBetweenAttemptsMs: boundedTimes.slice(1).map((time, index) => time - boundedTimes[index]),
  };

  // Ambiguous /api/send failure while navigator remains online must not retry.
  // A deliberate user retry then reaches a disposable raw pane exactly once.
  killSendSession();
  tmux(["new-session", "-d", "-s", sendSession, "-n", "terminal", "bash --noprofile --norc"]);
  tmux(["send-keys", "-t", sendTarget, "stty raw -echo; od -An -tx1 -v -w1", "Enter"]);
  let abortSend = true;
  let sendRequests = 0;
  await page.route("**/api/send", async (route) => {
    sendRequests++;
    if (abortSend) await route.abort("connectionreset");
    else await route.continue();
  });
  const invokeSend = () => page.evaluate(async ({ target }) => {
    const { fetchWithRetry } = await import("/src/lib/fetchWithRetry.ts");
    try {
      const response = await fetchWithRetry("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, text: "K" }),
        retrySafety: "offline-only",
        retryDelays: [100],
      });
      return { ok: response.ok };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, { target: sendTarget });

  const ambiguousResult = await invokeSend();
  await page.waitForTimeout(400);
  const requestsAfterAmbiguousFailure = sendRequests;
  const captureBeforeManualRetry = tmux(["capture-pane", "-p", "-t", sendTarget, "-S", "-30"]);
  abortSend = false;
  const manualResult = await invokeSend();
  await page.waitForTimeout(500);
  const captureAfterManualRetry = tmux(["capture-pane", "-p", "-t", sendTarget, "-S", "-30"]);
  const deliveredKBytes = [...captureAfterManualRetry.matchAll(/(?:^|\s)4b(?=\s|$)/g)].length;
  result.send = {
    ambiguousResult,
    requestsAfterAmbiguousFailure,
    noAutomaticRetry: requestsAfterAmbiguousFailure === 1,
    paneUntouchedAfterAmbiguousFailure: !/(?:^|\s)4b(?=\s|$)/.test(captureBeforeManualRetry),
    manualResult,
    totalRequestsAfterManualRetry: sendRequests,
    deliveredKBytes,
    exactlyOnceAfterManualRetry: deliveredKBytes === 1,
    capture: captureAfterManualRetry,
  };

  const uiCountBeforeStaticIdle = uiRequests.length;
  await page.evaluate(() => { window.__lfs014Raf = 0; });
  await page.waitForTimeout(2_000);
  result.staticMode = {
    uiStateRequestsDuringIdle: uiRequests.length - uiCountBeforeStaticIdle,
    boundedRetryRequestsDuringIdle: boundedRequests - boundedCountAtStop,
    runningAnimations: await page.evaluate(() =>
      document.getAnimations().filter((animation) => animation.playState === "running").length),
  };

  result.passed = Boolean(
    result.uiState.localValueSurvived
    && result.uiState.pendingSurvived
    && result.uiState.indicatorDuringFailure === "offline"
    && result.uiState.recoveryWrites === 1
    && result.uiState.recoveryBodyIsLatest
    && result.uiState.pendingCleared
    && result.uiState.indicatorCleared
    && result.boundedRetry.stopped
    && result.send.noAutomaticRetry
    && result.send.paneUntouchedAfterAmbiguousFailure
    && result.send.exactlyOnceAfterManualRetry
    && result.staticMode.boundedRetryRequestsDuringIdle === 0
    && result.staticMode.runningAnimations === 0
  );
} finally {
  await browser.close();
  killSendSession();
}

await writeFile(
  new URL("network-resilience-verification.json", import.meta.url),
  `${JSON.stringify(result, null, 2)}\n`,
);
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
