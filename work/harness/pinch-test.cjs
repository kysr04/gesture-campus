/**
 * 粒子页抓取判定测试：用合成关键点驱动 stepHands，不需要摄像头。
 * 输出各阶段 grabTarget / grabMix，判断捏合能否稳定触发、张开能否释放。
 */
const { chromium } = require("playwright");
const { POSE } = require("./hands.cjs");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/particle.html?debug";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const open = POSE.open();
const pinch = POSE.pinch();
const ramp = Array.from({ length: 40 }, (_, i) => POSE.pinchRamp((i + 1) / 40));

(async () => {
  const ctx = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: CHROME, headless: true, viewport: { width: 1280, height: 800 },
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"]
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(URL_ARG, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__test, null, { timeout: 60000 });

  const res = await page.evaluate(({ open, pinch, ramp }) => {
    const t = window.__test;
    t.reset();
    let now = 1000, dt = 1 / 60;
    // 先张手稳住基准
    for (let i = 0; i < 40; i++) { t.step([open], now, dt); now += 16; }
    const base = t.state();
    // 渐进捏合
    for (const h of ramp) { t.step([h], now, dt); now += 16; }
    const mid = t.state();
    for (let i = 0; i < 40; i++) { t.step([pinch], now, dt); now += 16; }
    const held = t.state();
    // 张开
    for (let i = 0; i < 60; i++) { t.step([open], now, dt); now += 16; }
    const released = t.state();
    return { base, mid, held, released };
  }, { open, pinch, ramp });

  const okPinch = res.mid.grabTarget > 0.5 && res.held.grabMix > 0.9;
  const okRelease = res.released.grabMix < 0.05 && res.released.grabT === 0;
  console.log(JSON.stringify({
    ok: okPinch && okRelease,
    phase: {
      open: { target: res.base.grabTarget, mix: +res.base.grabMix.toFixed(2) },
      pinchMid: { target: +res.mid.grabTarget.toFixed(2), mix: +res.mid.grabMix.toFixed(2) },
      held: { target: +res.held.grabTarget.toFixed(2), mix: +res.held.grabMix.toFixed(2) },
      released: { target: res.released.grabTarget, mix: +res.released.grabMix.toFixed(3), t: +res.released.grabT.toFixed(3) }
    },
    errors: errs
  }, null, 2));
  await ctx.close();
  process.exit(okPinch && okRelease ? 0 : 1);
})();
