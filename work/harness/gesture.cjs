/**
 * 手势判定断言。用合成关键点在页面里驱动 window.__gesture，不依赖摄像头。
 *
 * 用法: node work/harness/gesture.cjs [url]
 * 全部通过退出码 0，有失败退出码 1。
 */
const { chromium } = require("playwright");
const { POSE } = require("./hands.cjs");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/index.html?debug";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE = "work/.chrome-profile";

// 在 Node 侧把姿态算好，传进页面时就是普通数组，方便序列化
const P = {
  open: POSE.open(),
  count1: POSE.counting(1),
  count2: POSE.counting(2),
  count3: POSE.counting(3),
  count4: POSE.counting(4),
  pinch: POSE.pinch()
};

const CASES = [
  {
    name: "T1 张开手掌：手掌尺度落在合理范围",
    body: `
      g.reset();
      const r = g.probe(P.open);
      return [r.scale > 0.10 && r.scale < 0.20, "scale=" + r.scale.toFixed(3)];
    `
  },
  {
    name: "T1 张开手掌：四指全伸、拇指外展、不是捏合",
    body: `
      const f = g.probe(P.open);
      return [f.extended === 4 && f.thumbIn === false && f.pinch > 1.0,
              JSON.stringify({extended: f.extended, thumbIn: f.thumbIn, pinch: +f.pinch.toFixed(2)})];
    `
  },
  {
    name: "T1 比 2：伸直两根、拇指内收",
    body: `
      const f = g.probe(P.count2);
      return [f.extended === 2 && f.thumbIn === true,
              JSON.stringify({extended: f.extended, thumbIn: f.thumbIn})];
    `
  },
  {
    name: "T1 捏合：指距比低于 0.55",
    body: `
      const f = g.probe(P.pinch);
      return [f.pinch < 0.55, "pinch=" + f.pinch.toFixed(3)];
    `
  },
  {
    name: "T1 手掌竖直时倾斜角接近零",
    body: `
      const f = g.probe(P.open);
      return [Math.abs(f.tilt) < 0.15, "tilt=" + f.tilt.toFixed(3)];
    `
  }
];

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: CHROME,
    headless: true,
    viewport: { width: 900, height: 600 },
    args: [
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--hide-scrollbars"
    ]
  });
  const page = context.pages()[0] || (await context.newPage());
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  await page.goto(URL_ARG, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const out = await page.evaluate(({ cases, P }) => {
    const g = window.__gesture;
    if (!g) return { fatal: "调试钩子没挂上（网址要带 ?debug）" };
    const shift = (lm, dx, dy) => lm.map((p) => ({ x: p.x + dx, y: p.y + (dy || 0) }));
    const results = [];
    for (const c of cases) {
      try {
        const fn = new Function("g", "P", "shift", c.body);
        const r = fn(g, P, shift) || [false, "没有返回值"];
        results.push({ name: c.name, ok: !!r[0], detail: r[1] || "" });
      } catch (e) {
        results.push({ name: c.name, ok: false, detail: "抛异常: " + e.message });
      }
    }
    return { results };
  }, { cases: CASES.map((c) => ({ name: c.name, body: c.body })), P });

  if (out.fatal) {
    console.log(JSON.stringify({ fatal: out.fatal, pageErrors }, null, 2));
    await context.close();
    process.exit(1);
  }

  let failed = 0;
  for (const r of out.results) {
    if (!r.ok) failed++;
    console.log((r.ok ? "  PASS  " : "  FAIL  ") + r.name + (r.detail ? "   [" + r.detail + "]" : ""));
  }
  console.log("\n" + (out.results.length - failed) + "/" + out.results.length + " 通过");
  if (pageErrors.length) console.log("页面异常: " + JSON.stringify(pageErrors.slice(0, 5)));

  await context.close();
  process.exit(failed ? 1 : 0);
})();
