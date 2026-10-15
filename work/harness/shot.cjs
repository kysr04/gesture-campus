/**
 * 截图 + 错误采集。
 *
 * 用法: node work/harness/shot.cjs <url> <out.png> [waitMs] [--no-click]
 *
 * 会一直等到启动按钮可用（模型就绪）再点开始、开摄像头，然后截图。
 * 输出 JSON：{ ready, clicked, errors, logs, screenshot }
 */
const { chromium } = require("playwright");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/index.html";
const OUT = process.argv[3] || "work/harness/out/shot.png";
const WAIT_MS = Number(process.argv[4] || 4000);
const NO_CLICK = process.argv.includes("--no-click");

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
  const logs = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") logs.push("console: " + m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push("http" + r.status() + " " + r.url().slice(0, 120));
  });

  await page.goto(URL_ARG, { waitUntil: "domcontentloaded", timeout: 90000 });

  // 等启动按钮可用；模型已缓存时会很快
  const deadline = Date.now() + 180000;
  let ready = false;
  let lastMsg = "";
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => {
      const btn = document.getElementById("boot-btn");
      const msg = document.getElementById("boot-msg");
      const err = document.getElementById("boot-err");
      return {
        hasBtn: !!btn,
        disabled: btn ? btn.disabled : true,
        msg: msg ? msg.textContent : "",
        err: err ? err.textContent : ""
      };
    });
    if (st.msg !== lastMsg) { lastMsg = st.msg; console.error("[boot] " + st.msg.slice(0, 140)); }
    if (st.err) { errors.push("boot: " + st.err.slice(0, 160)); break; }
    if (st.hasBtn && !st.disabled) { ready = true; break; }
    await page.waitForTimeout(1000);
  }

  let clicked = false;
  if (ready && !NO_CLICK) {
    await page.click("#boot-btn");
    clicked = true;
  }
  await page.waitForTimeout(WAIT_MS);
  await page.screenshot({ path: OUT });

  console.log(JSON.stringify({
    ready, clicked,
    errors: errors.slice(0, 12),
    logs: logs.slice(0, 8),
    screenshot: OUT
  }, null, 2));

  await context.close();
})();
