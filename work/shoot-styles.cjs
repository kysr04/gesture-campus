const { chromium } = require("playwright");

const URL = process.argv[2] || "http://127.0.0.1:8765/work/preview/styles.html";
const OUT = process.argv[3] || "work/styles.png";
const WAIT_MS = Number(process.argv[4] || 25000);

(async () => {
  const context = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 1900, height: 1300 },
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
  page.on("response", (r) => { if (r.status() >= 400) errors.push("http" + r.status() + " " + r.url().slice(0, 110)); });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 90000 });

  const deadline = Date.now() + WAIT_MS;
  let ready = false;
  while (Date.now() < deadline) {
    const t = await page.title();
    if (t === "ready") { ready = true; break; }
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(3500); // 让每个场景多画几帧

  const info = await page.evaluate(() => ({
    cells: document.querySelectorAll(".cell").length,
    canvases: document.querySelectorAll(".cell canvas").length,
    failed: Array.from(document.querySelectorAll(".tag"))
      .map(e => e.textContent)
      .filter(t => t.includes("渲染失败")),
    size: document.body.scrollWidth + "x" + document.body.scrollHeight
  }));

  await page.screenshot({ path: OUT, fullPage: true });
  console.log(JSON.stringify({ ready, info, errors: errors.slice(0, 10), screenshot: OUT }, null, 2));
  await context.close();
})();
