/**
 * 人像手势测试：比 1 停住 → 人像；手离开画面 → 散开。
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
  await page.goto("http://127.0.0.1:8765/particle.html?debug", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.__test && window.__ready), null, { timeout: 60000 });

  const res = await page.evaluate(({ open, one }) => {
    const t = window.__test;
    t.reset();
    let now = 1000, dt = 1 / 30;
    const run = (h, n) => { for (let i = 0; i < n; i++) { t.step(h ? [h] : [], now, dt); now += 33; } };
    run(open, 30);
    const before = t.state();
    run(one, 45);           // 1.5s
    const shown = t.state();
    run(one, 30);           // 继续比 1，应该保持
    const held = t.state();
    run(open, 30);          // 张开手不该退出
    const stillOn = t.state();
    run(null, 20);          // 手离开 0.66s，还不够
    const grace = t.state();
    run(null, 25);          // 累计 1.5s
    const off = t.state();
    return { before, shown, held, stillOn, grace, off };
  }, { open: POSE.open(), one: POSE.counting(1) });

  const ok =
    res.before.portraitOn === false &&
    res.shown.portraitOn === true &&
    res.held.portraitOn === true &&
    res.stillOn.portraitOn === true &&
    res.grace.portraitOn === true &&
    res.off.portraitOn === false;

  console.log(JSON.stringify({
    ok,
    t: {
      before: res.before.portraitOn,
      shown: res.shown.portraitOn,
      held: res.held.portraitOn,
      openHand: res.stillOn.portraitOn,
      grace: res.grace.portraitOn,
      lost: res.off.portraitOn
    },
    mix: +res.shown.portraitMix.toFixed(2),
    errors: errs
  }, null, 2));
  await ctx.close();
  process.exit(ok ? 0 : 1);
})();
