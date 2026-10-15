/**
 * 场景渲染断言。只看数字和错误，不看像素长得对不对（那个靠人眼看截图）。
 *
 * 用法: node work/harness/render.cjs [url] [out.png]
 */
const { chromium } = require("playwright");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/index.html";
const OUT = process.argv[3] || "work/harness/out/scene.png";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// 期望区间，来自设计文档 6.2
const EXPECT = {
  landPoints: [10000, 16000],
  cityPoints: [30, 30],
  starPoints: [1500, 2200],
  drawCalls: [1, 12],
  // 三角形数是防回归的上限，不是性能目标——真正的开销在透明层的填充率上，
  // 那个由任务 9 的帧时长脚本负责看。
  triangles: [0, 20000]
};

(async () => {
  const context = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: CHROME,
    headless: true,
    viewport: { width: 1100, height: 760 },
    deviceScaleFactor: 1,
    args: [
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--force-color-profile=srgb",
      "--hide-scrollbars"
    ]
  });
  const page = context.pages()[0] || (await context.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push("http" + r.status() + " " + r.url().slice(0, 110));
  });

  await page.goto(URL_ARG, { waitUntil: "domcontentloaded", timeout: 90000 });

  // 等场景挂上
  const deadline = Date.now() + 120000;
  let stats = null;
  while (Date.now() < deadline) {
    stats = await page.evaluate(() => {
      const s = window.__scene;
      if (!s || !s.stats) return null;
      try { return s.stats(); } catch (e) { return { error: e.message }; }
    });
    if (stats) break;
    await page.waitForTimeout(800);
  }

  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT });

  const report = { stats, checks: [], errors: errors.slice(0, 10), screenshot: OUT };
  if (stats && !stats.error) {
    for (const [key, [lo, hi]] of Object.entries(EXPECT)) {
      const v = stats[key];
      report.checks.push({
        key, value: v, expect: lo + " ~ " + hi,
        ok: typeof v === "number" && v >= lo && v <= hi
      });
    }
  }
  const failed = report.checks.filter((c) => !c.ok);
  console.log(JSON.stringify(report, null, 2));
  if (!report.checks.length) console.log("\n没有拿到任何指标：场景没挂上（window.__scene 缺失）");
  else if (failed.length) console.log("\n" + failed.length + " 项超出期望");
  else console.log("\n全部落在期望区间");

  await context.close();
  process.exit(stats && !stats.error && failed.length === 0 ? 0 : 1);
})();
