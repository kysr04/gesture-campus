const { chromium } = require("playwright");

const URL = process.argv[2] || "http://127.0.0.1:8765/index.html";
const OUT = process.argv[3] || "work/shot-globe.png";
const WAIT_MIN = Number(process.argv[4] || 10);

(async () => {
  // 持久化用户目录：模型会被 Cache API 缓存到磁盘，第二次打开是秒进，
  // 也方便反复验证时不用每次重下 7.5MB。
  const context = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader"
    ],
    viewport: { width: 1280, height: 800 },
    permissions: ["camera"],
    deviceScaleFactor: 1
  });
  const page = context.pages()[0] || (await context.newPage());

  const logs = [];
  const errors = [];
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning") logs.push(t + ": " + m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push("http" + r.status() + ": " + r.url().slice(0, 140));
  });
  page.on("requestfailed", (r) => {
    errors.push("requestfailed: " + r.url().slice(0, 120) + " :: " + (r.failure() || {}).errorText);
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // 1. globe.gl 是否渲染出 WebGL canvas
  await page.waitForTimeout(2500);
  const globeInfo = await page.evaluate(() => {
    const host = document.getElementById("globe");
    const cv = host ? host.querySelector("canvas") : null;
    return {
      hasGlobeGlobal: typeof window.Globe === "function",
      canvasCount: host ? host.querySelectorAll("canvas").length : 0,
      width: cv ? cv.width : 0,
      height: cv ? cv.height : 0
    };
  });

  // 2. 等模型就绪（首次要下载 7.8MB，可能很慢）
  let ready = false;
  const deadline = Date.now() + WAIT_MIN * 60 * 1000;
  let lastMsg = "";
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => ({
      disabled: document.getElementById("boot-btn").disabled,
      msg: document.getElementById("boot-msg").textContent,
      err: document.getElementById("boot-err").textContent,
      bar: document.getElementById("bar-inner").style.width
    }));
    if (st.msg !== lastMsg) { lastMsg = st.msg; console.log("  [boot] " + st.msg.slice(0, 160)); }
    if (st.err) { console.log("  [boot-err] " + st.err.slice(0, 200)); }
    if (!st.disabled) { ready = true; break; }
    if (st.err) break;
    await page.waitForTimeout(4000);
  }

  let afterClick = null;
  if (ready) {
    await page.click("#boot-btn");
    await page.waitForTimeout(6000);
    afterClick = await page.evaluate(() => ({
      bootHidden: document.getElementById("boot").classList.contains("hidden"),
      statusState: document.getElementById("status-box").dataset.state,
      statusLabel: document.getElementById("status-label").textContent,
      statusSub: document.getElementById("status-sub").textContent,
      fps: document.getElementById("fps").textContent,
      cityCount: (window.__cityProbe || {}).count || null
    }));
    await page.screenshot({ path: OUT });
  } else {
    await page.screenshot({ path: OUT });
  }

  console.log(JSON.stringify({
    globeInfo,
    modelReady: ready,
    afterClick,
    errors: errors.slice(0, 12),
    logs: logs.slice(0, 12),
    screenshot: OUT
  }, null, 2));

  await context.close();
})();
