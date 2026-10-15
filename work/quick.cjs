const { chromium } = require("playwright");

(async () => {
  const URL = process.argv[2] || "http://127.0.0.1:8765/index.html";
  const OUT = process.argv[3] || "work/shot-quick.png";
  const WAIT = Number(process.argv[4] || 4000);

  const context = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 1280, height: 800 },
    permissions: ["camera"],
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader"
    ]
  });
  const page = context.pages()[0] || (await context.newPage());

  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("response", (r) => { if (r.status() >= 400) errors.push("http" + r.status() + " " + r.url().slice(0, 120)); });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // 模型已缓存的话按钮会很快可用；点一下才会开摄像头
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const st = await page.evaluate(() => ({
      disabled: document.getElementById("boot-btn").disabled,
      err: document.getElementById("boot-err").textContent
    }));
    if (st.err) { console.log("boot error: " + st.err); break; }
    if (!st.disabled) break;
    await page.waitForTimeout(500);
  }
  const btnReady = await page.evaluate(() => !document.getElementById("boot-btn").disabled);
  if (btnReady) {
    await page.click("#boot-btn");
    await page.waitForTimeout(WAIT);
  }

  const info = await page.evaluate(() => {
    const host = document.getElementById("globe");
    const cv = host && host.querySelector("canvas");
    let bright = null;
    if (cv) {
      try {
        const tmp = document.createElement("canvas");
        tmp.width = 200; tmp.height = 200;
        const c2 = tmp.getContext("2d");
        c2.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, 200, 200);
        const d = c2.getImageData(0, 0, 200, 200).data;
        let sum = 0, lit = 0;
        for (let i = 0; i < d.length; i += 4) {
          const v = d[i] + d[i + 1] + d[i + 2];
          sum += v;
          if (v > 60) lit++;
        }
        bright = { avg: Math.round(sum / (d.length / 4)), litPx: lit };
      } catch (e) { bright = "readback failed: " + e.message; }
    }
    return { canvas: cv ? cv.width + "x" + cv.height : null, bright };
  });

  await page.screenshot({ path: OUT });
  console.log(JSON.stringify({ info, errors, screenshot: OUT }, null, 2));
  await context.close();
})();
