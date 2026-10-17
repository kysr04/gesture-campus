/**
 * 双人像手势测试：比 1 → 人像1；比 2 → 先散开再聚成人像2。
 */
const { chromium } = require("playwright");
const { POSE } = require("./hands.cjs");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

(async () => {
  const ctx = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: CHROME, headless: true, viewport: { width: 1280, height: 800 },
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"]
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://127.0.0.1:8765/portrait.html?debug", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__test && window.__ready), null, { timeout: 90000 });

  const res = await page.evaluate(({ open, one, two }) => {
    const t = window.__test;
    t.reset();
    let now = 1000, dt = 1 / 60;
    const run = (h, n) => { for (let i = 0; i < n; i++) { t.step(h ? [h] : [], now, dt); now += 16; } };
    run(open, 30);
    const before = t.state();
    run(one, 45);
    const shown1 = t.state();
    run(two, 90);           // 散开 + 重新聚拢
    const shown2 = t.state();
    return { before, shown1, shown2 };
  }, { open: POSE.open(), one: POSE.counting(1), two: POSE.counting(2) });

  const ok =
    res.before.portraitOn === false && res.before.currentPortrait === 0 &&
    res.shown1.portraitOn === true && res.shown1.currentPortrait === 0 &&
    res.shown2.portraitOn === true && res.shown2.currentPortrait === 1 &&
    res.shown2.switchQueue === null;

  console.log(JSON.stringify({
    ok,
    phase: {
      before: { on: res.before.portraitOn, idx: res.before.currentPortrait },
      one: { on: res.shown1.portraitOn, idx: res.shown1.currentPortrait },
      two: { on: res.shown2.portraitOn, idx: res.shown2.currentPortrait, queue: res.shown2.switchQueue }
    },
    errors: errs
  }, null, 2));
  await ctx.close();
  process.exit(ok ? 0 : 1);
})();
