/**
 * 产品页截图：开场 + 自动演示的各个阶段。
 * 用法: node work/harness/demo-shot.cjs [landing|demo]
 */
const { chromium } = require("playwright");

const MODE = process.argv[2] || "demo";
const BASE = "http://127.0.0.1:8765/portrait.html";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

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
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const shots = [];
  if (MODE === "landing") {
    await page.goto(BASE + "?q=high&lockq=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2200);
    const out = "work/harness/out/product-landing.png";
    await page.screenshot({ path: out });
    shots.push(out);
  } else {
    await page.goto(BASE + "?demo=1&q=high&lockq=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
    const times = [2500, 6500, 10500, 14500, 20000];
    let prev = 0;
    for (const t of times) {
      await page.waitForTimeout(t - prev);
      prev = t;
      const out = `work/harness/out/product-demo-${t}.png`;
      await page.screenshot({ path: out });
      shots.push(out);
    }
  }

  const state = await page.evaluate(() => (window.__test ? window.__test.state() : null));
  console.log(JSON.stringify({ mode: MODE, shots, state, errors }, null, 2));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
