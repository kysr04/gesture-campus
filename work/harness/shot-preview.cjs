/**
 * 截取一张静态的预览页（用于渲染方案对比）。
 * 用法: node work/harness/shot-preview.cjs <url> <out.png> [readyTimeoutMs]
 */
const { chromium } = require("playwright");

const URL_ARG = process.argv[2];
const OUT = process.argv[3];
const WAIT = Number(process.argv[4] || 60000);

(async () => {
  const context = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 1920, height: 700 },
    deviceScaleFactor: 1,
    args: [
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--force-color-profile=srgb",
      "--hide-scrollbars",
      "--disable-remote-fonts"
    ]
  });
  const page = context.pages()[0] || (await context.newPage());
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 140)); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push("http" + r.status() + " " + r.url().slice(0, 100)); });

  await page.goto(URL_ARG, { waitUntil: "domcontentloaded", timeout: 90000 });

  const deadline = Date.now() + WAIT;
  let ready = false;
  while (Date.now() < deadline) {
    const info = await page.evaluate(() => ({
      title: document.title,
      cells: document.querySelectorAll(".cell").length,
      canvases: document.querySelectorAll(".cell canvas").length
    }));
    if (info.canvases >= 3) { ready = true; break; }
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(4000);
  await page.screenshot({ path: OUT, fullPage: true, animations: "disabled", caret: "hide", timeout: 120000 });

  console.log(JSON.stringify({ ready, errors: errors.slice(0, 8), screenshot: OUT }, null, 2));
  await context.close();
})();
