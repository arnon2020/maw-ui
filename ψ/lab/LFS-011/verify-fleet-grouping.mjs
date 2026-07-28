import { chromium } from "/tmp/lfs007-pw/node_modules/playwright/index.mjs";
import { mkdir, writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:5176";
const profiles = [
  { name: "mobile-360x800", width: 360, height: 800, mobile: true },
  { name: "tablet-768x1024", width: 768, height: 1024 },
  { name: "tablet-820x1180", width: 820, height: 1180 },
  { name: "landscape-844x390", width: 844, height: 390 },
];
const screenshotDir = new URL("screenshots/", import.meta.url);
await mkdir(screenshotDir, { recursive: true });

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
    const original = window.requestAnimationFrame.bind(window);
    window.__fleetRafCount = 0;
    window.requestAnimationFrame = (callback) => original((time) => {
      window.__fleetRafCount += 1;
      callback(time);
    });
  });
  const page = await context.newPage();
  await page.goto(`${base}/?static=1#fleet`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4_000);

  const controls = page.getByLabel("Fleet grouping controls");
  await controls.scrollIntoViewIfNeeded();
  const sessionButton = page.getByRole("button", { name: "session", exact: true });
  const teamButton = page.getByRole("button", { name: "team", exact: true });
  await sessionButton.click();
  await page.waitForTimeout(250);
  await controls.scrollIntoViewIfNeeded();
  const sessionGroups = await page.locator('section[aria-label*="session group with"]').evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute("aria-label")),
  );
  await page.screenshot({
    path: decodeURIComponent(new URL(`${profile.name}-session.png`, screenshotDir).pathname),
  });

  await teamButton.click();
  await page.waitForTimeout(250);
  await controls.scrollIntoViewIfNeeded();
  const teamGroups = await page.locator('section[aria-label*="group with"]').evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute("aria-label")),
  );
  const roles = await page.locator('span:text-matches("^role:")').allTextContents();
  const rooms = await page.locator('span:text-matches("^room:")').allTextContents();
  await page.screenshot({
    path: decodeURIComponent(new URL(`${profile.name}-team.png`, screenshotDir).pathname),
  });

  await page.evaluate(() => { window.__fleetRafCount = 0; });
  await page.waitForTimeout(1_500);
  const metrics = await page.evaluate(() => ({
    horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    staticMode: document.documentElement.classList.contains("static-mode"),
    runningAnimations: document.getAnimations().filter((animation) => animation.playState === "running").length,
    idleRafCallbacks: window.__fleetRafCount,
  }));
  results.push({
    profile: profile.name,
    sessionGroups,
    teamGroups,
    roleBadgeCount: roles.length,
    roomBadgeCount: rooms.length,
    ...metrics,
  });
  await context.close();
}

// First visit with no local or server UI preference must start at session.
const defaultContext = await browser.newContext({ viewport: { width: 768, height: 1024 } });
await defaultContext.route("**/api/ui-state", async (route) => {
  if (route.request().method() === "GET") {
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  } else {
    await route.continue();
  }
});
await defaultContext.addInitScript(() => localStorage.removeItem("maw.fleet"));
const defaultPage = await defaultContext.newPage();
await defaultPage.goto(`${base}/?static=1#fleet`, { waitUntil: "domcontentloaded" });
await defaultPage.waitForTimeout(1_500);
const defaultMode = await defaultPage.getByRole("button", { name: "session", exact: true }).getAttribute("aria-pressed");
await defaultContext.close();

// Persist team mode and one collapsed team across a real reload.
const persistContext = await browser.newContext({ viewport: { width: 768, height: 1024 } });
const persistPage = await persistContext.newPage();
await persistPage.goto(`${base}/?static=1#fleet`, { waitUntil: "domcontentloaded" });
await persistPage.waitForTimeout(4_000);
const persistTeamButton = persistPage.getByRole("button", { name: "team", exact: true });
if (await persistTeamButton.getAttribute("aria-pressed") !== "true") await persistTeamButton.click();
await persistPage.waitForTimeout(250);
const firstTeam = persistPage.locator('section[aria-label*="team group with"]').first();
const persistedGroupLabel = await firstTeam.getAttribute("aria-label");
const firstTeamHeader = firstTeam.locator(":scope > div[role='button']");
let rowsBeforeCollapse = await firstTeam.locator('[role="button"][aria-label]').count();
if (rowsBeforeCollapse === 0) {
  await firstTeamHeader.click();
  await persistPage.waitForTimeout(250);
  rowsBeforeCollapse = await firstTeam.locator('[role="button"][aria-label]').count();
}
await firstTeamHeader.click();
await persistPage.waitForTimeout(250);
const rowsAfterCollapse = await firstTeam.locator('[role="button"][aria-label]').count();
await persistPage.waitForTimeout(3_000);
await persistPage.reload({ waitUntil: "domcontentloaded" });
await persistPage.waitForTimeout(4_000);
const modePersisted = await persistPage.getByRole("button", { name: "team", exact: true }).getAttribute("aria-pressed");
const rowsAfterReload = await persistPage
  .locator(`section[aria-label="${persistedGroupLabel}"] [role="button"][aria-label]`)
  .count();
await persistContext.close();
await browser.close();

const liveTeams = await fetch(`${base}/api/teams`).then((response) => response.json());
const liveSessions = await fetch(`${base}/api/sessions`).then((response) => response.json());
const failures = results.flatMap((result) => {
  const failures = [];
  if (result.sessionGroups.length === 0) failures.push(`${result.profile}: no session groups`);
  if (result.teamGroups.length === 0) failures.push(`${result.profile}: no team groups`);
  if (result.roleBadgeCount === 0) failures.push(`${result.profile}: no role badges`);
  if (result.roomBadgeCount === 0) failures.push(`${result.profile}: no cross-session room badges`);
  if (result.horizontalOverflow !== 0) failures.push(`${result.profile}: ${result.horizontalOverflow}px horizontal overflow`);
  if (!result.staticMode) failures.push(`${result.profile}: static mode missing`);
  if (result.runningAnimations !== 0) failures.push(`${result.profile}: ${result.runningAnimations} animations`);
  if (result.idleRafCallbacks !== 0) failures.push(`${result.profile}: ${result.idleRafCallbacks} idle rAF callbacks`);
  return failures;
});
if (defaultMode !== "true") failures.push("default group mode is not session");
if (modePersisted !== "true") failures.push("team mode did not persist");
if (rowsBeforeCollapse === 0 || rowsAfterCollapse !== 0 || rowsAfterReload !== 0) failures.push("collapsed team did not persist");

const evidence = {
  passed: failures.length === 0,
  failures,
  results,
  preferences: {
    defaultMode: defaultMode === "true" ? "session" : "unexpected",
    teamModePersisted: modePersisted === "true",
    persistedGroupLabel,
    rowsBeforeCollapse,
    rowsAfterCollapse,
    rowsAfterReload,
  },
  liveData: {
    sessionCount: Array.isArray(liveSessions) ? liveSessions.length : 0,
    teamCount: liveTeams.teams?.length || 0,
    teams: (liveTeams.teams || []).map((team) => ({ name: team.name, members: team.members?.length || 0 })),
  },
  screenshots: profiles.length * 2,
};
await writeFile(new URL("fleet-grouping-verification.json", import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (failures.length) process.exitCode = 1;
