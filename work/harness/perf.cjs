/**
 * 帧时长与绘制开销采集。
 *
 * 用法: node work/harness/perf.cjs [url] [frames]
 *
 * 注意：无头环境跑的是软件渲染（SwiftShader），绝对帧率没有参考价值，
 * 只能用来抓回归——数字突然变差说明改坏了东西。真机手感必须上 iPad 测。
 */
const { chromium } = require("playwright");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/index.html";
const FRAMES = Number(process.argv[3] || 240);

(async () => {
  const context = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    args: [
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--hide-scrollbars"
    ]
  });
  const page = context.pages()[0] || (await context.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(URL_ARG, { waitUntil: "domcontentloaded", timeout: 90000 });

  // 等场景挂上
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const ok = await page.evaluate(() => !!(window.__scene && window.__scene.stats));
    if (ok) break;
    await page.waitForTimeout(500);
  }

  const result = await page.evaluate((frames) => new Promise((resolve) => {
    const times = [];
    let last = performance.now();
    function tick(now) {
      times.push(now - last);
      last = now;
      if (times.length >= frames) {
        times.shift();                    // 丢掉第一帧
        const sorted = times.slice().sort((a, b) => a - b);
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        const s = window.__scene.stats();
        const r = window.__scene.renderer;
        resolve({
          avgFrameMs: +avg.toFixed(2),
          p95FrameMs: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
          worstFrameMs: +sorted[sorted.length - 1].toFixed(2),
          approxFps: +(1000 / avg).toFixed(1),
          drawCalls: s.drawCalls,
          triangles: s.triangles,
          landPoints: s.landPoints,
          dpr: window.devicePixelRatio,
          canvas: r.domElement.width + "x" + r.domElement.height
        });
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }), FRAMES);

  console.log(JSON.stringify({ result, errors: errors.slice(0, 6) }, null, 2));
  console.log("\n（无头是软件渲染，帧率绝对值没有参考价值，只用于抓回归）");
  await context.close();
})();
