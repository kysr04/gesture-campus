/**
 * 粒子页截图：等模型就绪 -> 点开始 -> 按给定时间点连拍。
 * 用法: node work/harness/particle-shot.cjs <url> <outPrefix> [t1,t2,...]
 */
const { chromium } = require("playwright");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/particle.html?grab=1";
const PREFIX = process.argv[3] || "work/harness/out/pg";
const TIMES = (process.argv[4] || "250,1600").split(",").map(Number);

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE = "work/.chrome-profile";

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: true,
    viewport: { width: 1280, height: 800 },
    permissions: ["camera"],
    deviceScaleFactor: 1,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
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
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto(URL_ARG, { waitUntil: "domcontentloaded", timeout: 90000 });

  const deadline = Date.now() + 120000;
  let ready = false;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const b = document.getElementById("go");
      return { has: !!b, disabled: b ? b.disabled : true, msg: (document.getElementById("msg") || {}).textContent || "" };
    });
    if (st.has && !st.disabled) { ready = true; break; }
    await page.waitForTimeout(600);
  }

  let clicked = false;
  if (ready) { await page.click("#go"); clicked = true; }
  await page.waitForTimeout(600);

  const shots = [];
  let prev = 0;
  for (const t of TIMES) {
    await page.waitForTimeout(Math.max(0, t - prev));
    prev = t;
    const out = `${PREFIX}-${t}.png`;
    await page.screenshot({ path: out });
    shots.push(out);
  }

  console.log(JSON.stringify({ ready, clicked, shots, errors: errors.slice(0, 10) }, null, 2));
  await context.close();
})();
