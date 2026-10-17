/**
 * 生成一组人像粒子效果预览图（iPad 竖屏），供用户在聊天里挑选。
 * 用法: node work/harness/preview-grid.cjs
 */
const { chromium } = require("playwright");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "http://127.0.0.1:8765/particle.html?portrait=1";

const VARIANTS = [
  { file: "blue-1", q: "&n=60000&edge=1.8&size=4.6&drift=0.10&tw=0.15" },
  { file: "blue-2", q: "&n=90000&edge=1.6&size=4.1&drift=0.10&tw=0.15" },
  { file: "blue-3", q: "&n=120000&edge=1.4&size=3.6&drift=0.10&tw=0.15" }
];

(async () => {
  const ctx = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: CHROME, headless: true, viewport: { width: 834, height: 1194 },
    permissions: ["camera"],
    args: [
      "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required", "--enable-unsafe-swiftshader",
      "--use-gl=angle", "--use-angle=swiftshader", "--hide-scrollbars"
    ]
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));

  const out = [];
  for (const v of VARIANTS) {
    await page.goto(BASE + v.q, { waitUntil: "domcontentloaded" });
    const dl = Date.now() + 60000;
    let ready = false;
    while (Date.now() < dl) {
      ready = await page.evaluate(() => {
        const b = document.getElementById("go");
        return !!(b && !b.disabled);
      });
      if (ready) break;
      await page.waitForTimeout(400);
    }
    if (ready) await page.click("#go").catch(() => {});
    await page.waitForTimeout(1600);
    const p = "work/harness/out/" + v.file + ".png";
    await page.screenshot({ path: p });
    out.push(p);
  }
  console.log(JSON.stringify({ shots: out, errors: errs }, null, 2));
  await ctx.close();
})();
