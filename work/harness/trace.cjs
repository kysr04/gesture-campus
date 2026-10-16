/**
 * 一次性的排查脚本：把双手缩放这个场景逐帧打出来。
 * 用法: node work/harness/trace.cjs
 */
const { chromium } = require("playwright");
const { POSE } = require("./hands.cjs");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/index.html?debug";

const P = {
  open: POSE.open(),
  count2: POSE.counting(2),
  pinchSteps: Array.from({ length: 21 }, (_, i) => POSE.pinchRamp(i / 20))
};

(async () => {
  const context = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 900, height: 600 },
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"]
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto(URL_ARG, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const rows = await page.evaluate(({ P }) => {
    const g = window.__gesture;
    const shift = (lm, dx, dy) => lm.map((p) => ({ x: p.x + dx, y: p.y + (dy || 0) }));
    const out = [];
    const push = (tag, i) => {
      const s = g.state();
      const d = g.dbg();
      const f = g.probe(shift(P.pinchSteps[i], 0.30, 0));
      out.push({
        tag, step: i,
        ctrlPinch: +f.pinch.toFixed(3),
        filtered: d.pinchFiltered === null ? null : +d.pinchFiltered.toFixed(3),
        basePinch: d.zoomBasePinch === null ? null : +d.zoomBasePinch.toFixed(3),
        baseAlt: +d.zoomBaseAlt.toFixed(2),
        alt: +s.altitude.toFixed(2),
        zoomActive: d.zoomActive,
        anchorIsFirst: d.anchorIsFirst,
        twoHand: d.twoHandActive
      });
    };
    const anchor = P.open;
    const ctl = (i) => shift(P.pinchSteps[i], 0.30, 0);

    g.reset();
    for (let i = 0; i < 6; i++) { g.step([anchor, ctl(20)], 1/30); push("捏着-建立基准", 20); }
    for (let i = 19; i >= 0; i--) { g.step([anchor, ctl(i)], 1/30); push("张开", i); }
    for (let i = 1; i <= 20; i++) { g.step([anchor, ctl(i)], 1/30); push("捏合", i); }
    return out;
  }, { P });

  const head = "tag            step  ctrl  filtered   base   baseAlt  alt   zoom anchor two";
  console.log(head);
  for (const r of rows) {
    if (r.step % 4 !== 0 && r.tag !== "捏着-建立基准") continue;
    console.log(
      r.tag.padEnd(14) + String(r.step).padStart(4) + "  " +
      String(r.ctrlPinch).padStart(5) + "  " + String(r.filtered).padStart(8) + "  " +
      String(r.basePinch).padStart(5) + "  " +
      String(r.baseAlt).padStart(6) + "  " + String(r.alt).padStart(5) + "  " +
      String(r.zoomActive).padStart(5) + "  " + String(r.anchorIsFirst).padStart(6) + "  " +
      String(r.twoHand)
    );
  }
  await context.close();
})();
