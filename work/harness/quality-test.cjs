/**
 * 质量档位与自动降级测试。
 * 用法: node work/harness/quality-test.cjs [baseUrl]
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8765/portrait.html";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function open(page, query) {
  await page.goto(BASE + query, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  return page.evaluate(() => window.__test.state());
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--force-color-profile=srgb",
      "--hide-scrollbars"
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

  const high = await open(page, "?q=high&lockq=1");
  check(
    "q=high 生成 24000 粒子",
    high.qualityLevel === "high" && high.configuredParticles === 24000 && high.activeParticles === 24000,
    `level=${high.qualityLevel} configured=${high.configuredParticles} active=${high.activeParticles}`
  );

  const degraded = await page.evaluate(() => {
    for (let i = 0; i < 70; i++) window.__test.tickQuality(0.03);
    return window.__test.state();
  });
  check(
    "高画质掉帧自动降到中画质",
    degraded.qualityLevel === "mid" && degraded.activeParticles === 15000,
    `level=${degraded.qualityLevel} active=${degraded.activeParticles}`
  );

  const reset = await page.evaluate(() => {
    window.__test.resetQuality();
    return window.__test.state();
  });
  check(
    "resetQuality 恢复高画质",
    reset.qualityLevel === "high" && reset.activeParticles === 24000,
    `level=${reset.qualityLevel} active=${reset.activeParticles}`
  );

  const low = await open(page, "?q=low&lockq=1");
  const lowAfter = await page.evaluate(() => {
    for (let i = 0; i < 70; i++) window.__test.tickQuality(0.03);
    return window.__test.state();
  });
  check(
    "低画质 9000 粒子且不再降",
    low.qualityLevel === "low" && low.activeParticles === 9000 &&
      lowAfter.qualityLevel === "low" && lowAfter.activeParticles === 9000,
    `before=${low.activeParticles} after=${lowAfter.activeParticles}`
  );

  const custom = await open(page, "?n=12000&lockq=1");
  const customAfter = await page.evaluate(() => {
    for (let i = 0; i < 70; i++) window.__test.tickQuality(0.03);
    return window.__test.state();
  });
  check(
    "自定义粒子数也能降级",
    custom.qualityLevel === "custom" && custom.activeParticles === 12000 &&
      customAfter.qualityLevel === "low" && customAfter.activeParticles === 9000,
    `before=${custom.activeParticles} after=${customAfter.activeParticles}`
  );

  check("没有 pageerror", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  console.log(JSON.stringify({ results, passed: results.filter((r) => r.ok).length, total: results.length }, null, 2));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
