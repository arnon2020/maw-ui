import { chromium } from "/tmp/lfs007-pw/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";

const base = "http://127.0.0.1:5174";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome",
  args: ["--enable-gpu-rasterization"],
});

const pages = {
  fleet: "/?static={mode}#fleet",
  office: "/?static={mode}#office",
  mission: "/?static={mode}#mission",
  federation: "/federation.html?static={mode}",
};

async function readTrace(cdp) {
  const completed = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.end");
  const { stream } = await completed;
  let trace = "";
  for (;;) {
    const chunk = await cdp.send("IO.read", { handle: stream });
    trace += chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  const events = JSON.parse(trace).traceEvents || [];
  const raster = events.filter((event) => /RasterTask|GPUTask|Paint/.test(event.name) && event.ph === "X");
  return {
    rasterEvents: raster.length,
    gpuRasterMs: Number((raster.reduce((sum, event) => sum + (event.dur || 0), 0) / 1000).toFixed(3)),
  };
}

async function measure(name, path, mode) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(() => {
    window.__mawRafTimes = [];
    window.__mawLongTasks = [];
    const nativeRaf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => nativeRaf((timestamp) => {
      window.__mawRafTimes.push(performance.now());
      callback(timestamp);
    });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__mawLongTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.goto(`${base}${path.replace("{mode}", mode)}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    window.__mawRafTimes = [];
    window.__mawLongTasks = [];
  });
  const before = await cdp.send("Performance.getMetrics");
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline,disabled-by-default-devtools.timeline",
    transferMode: "ReturnAsStream",
  });
  await page.waitForTimeout(2000);
  const trace = await readTrace(cdp);
  const after = await cdp.send("Performance.getMetrics");
  const beforeMap = Object.fromEntries(before.metrics.map((metric) => [metric.name, metric.value]));
  const afterMap = Object.fromEntries(after.metrics.map((metric) => [metric.name, metric.value]));
  const sample = await page.evaluate(() => ({
    staticMode: document.documentElement.classList.contains("static-mode"),
    rafCallbacks: window.__mawRafTimes.length,
    longTasks: window.__mawLongTasks,
    runningCssAnimations: document.getAnimations().filter((animation) => animation.playState === "running").length,
    canvasCount: document.querySelectorAll("canvas").length,
  }));
  const taskMs = (afterMap.TaskDuration - beforeMap.TaskDuration) * 1000;
  const scriptMs = (afterMap.ScriptDuration - beforeMap.ScriptDuration) * 1000;
  const layoutMs = (afterMap.LayoutDuration - beforeMap.LayoutDuration) * 1000;
  await page.close();
  return {
    page: name,
    mode: mode === "1" ? "static" : "motion",
    ...sample,
    taskMs: Number(taskMs.toFixed(3)),
    scriptMs: Number(scriptMs.toFixed(3)),
    layoutMs: Number(layoutMs.toFixed(3)),
    longTaskCount: sample.longTasks.length,
    longTaskMs: Number(sample.longTasks.reduce((sum, duration) => sum + duration, 0).toFixed(3)),
    cpuDutyPercent: Number((taskMs / 20).toFixed(2)),
    energyProxy: `main-thread duty ${Number((taskMs / 20).toFixed(2))}%`,
    ...trace,
  };
}

const comparisons = [];
for (const [name, path] of Object.entries(pages)) {
  comparisons.push(await measure(name, path, "1"));
  comparisons.push(await measure(name, path, "0"));
}

async function measureInteraction(mode) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.routeWebSocket(/\/ws$/, (socket) => socket.close());
  await page.route(/\/api\/config$/, (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ node: "test", agents: { atlas: "local", neo: "local" } }),
  }));
  await page.route(/\/api\/fleet-config$/, (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ configs: [
      { name: "01-atlas", windows: [{ name: "atlas-oracle" }], sync_peers: ["neo"] },
      { name: "02-neo", windows: [{ name: "neo-oracle" }], sync_peers: ["atlas"] },
    ] }),
  }));
  await page.route(/\/api\/feed/, (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ events: [] }),
  }));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  await page.goto(`${base}/federation.html?static=${mode}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const result = await page.evaluate(async () => {
    const samples = [];
    for (let index = 0; index < 20; index++) {
      const start = performance.now();
      window.scrollBy(0, index % 2 ? -80 : 80);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    return {
      samplesMs: samples.map((value) => Number(value.toFixed(2))),
      medianMs: Number(samples[Math.floor(samples.length * 0.5)].toFixed(2)),
      p95Ms: Number(samples[Math.floor(samples.length * 0.95)].toFixed(2)),
      maxMs: Number(samples.at(-1).toFixed(2)),
    };
  });
  await page.close();
  return result;
}
const interaction = {
  static: await measureInteraction("1"),
  motion: await measureInteraction("0"),
};
await browser.close();

const failures = [];
for (const result of comparisons.filter((item) => item.mode === "static")) {
  if (!result.staticMode) failures.push(`${result.page}: static class missing`);
  if (result.rafCallbacks !== 0) failures.push(`${result.page}: ${result.rafCallbacks} idle rAF callbacks`);
  if (result.runningCssAnimations !== 0) failures.push(`${result.page}: ${result.runningCssAnimations} CSS animations`);
}
if (interaction.static.medianMs > interaction.motion.medianMs * 1.25) {
  failures.push(`6x static median ${interaction.static.medianMs}ms exceeds motion ${interaction.motion.medianMs}ms`);
}

const evidence = { passed: failures.length === 0, failures, sampleWindowMs: 2000, comparisons, cpu6xInteraction: interaction };
await writeFile(new URL("static-mode-performance.json", import.meta.url), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (failures.length) process.exitCode = 1;
