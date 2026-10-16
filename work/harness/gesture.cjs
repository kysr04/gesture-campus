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
  pinch: POSE.pinch(),
  // 60 帧从张开到捏紧，模拟真实的渐进捏合
  ramp: Array.from({ length: 60 }, (_, i) => POSE.pinchRamp((i + 1) / 60))
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
  },

  /* ---------------- 任务 3：拖拽旋转与甩动惯性 ---------------- */
  {
    name: "T3 静止的手不改变视角",
    body: `
      g.reset();
      g.step([P.open], 1/30);
      const a = g.state().yaw;
      for (let i = 0; i < 30; i++) g.step([P.open], 1/30);
      const d = g.state().yaw - a;
      return [Math.abs(d) < 0.01, "yaw 漂了 " + d.toFixed(4)];
    `
  },
  {
    name: "T3 手向右移，地球跟着右转（抓取语义：经度减小）",
    body: `
      g.reset();
      g.step([P.open], 1/30);
      const before = g.state().yaw;
      for (let i = 0; i < 20; i++) g.step([shift(P.open, 0.004 * (i + 1), 0)], 1/30);
      const after = g.state().yaw;
      return [after < before - 1, before.toFixed(1) + " -> " + after.toFixed(1)];
    `
  },
  {
    name: "T3 慢速停止立即静止（不滑行）",
    body: `
      g.reset();
      g.step([P.open], 1/30);
      for (let i = 0; i < 10; i++) g.step([P.open], 1/30);
      const a = g.state().yaw;
      for (let i = 0; i < 30; i++) g.step([P.open], 1/30);
      const d = g.state().yaw - a;
      return [Math.abs(d) < 0.01, "滑了 " + d.toFixed(4)];
    `
  },
  {
    name: "T3 快速划过有惯性，且最终会停",
    body: `
      g.reset();
      g.step([P.open], 1/30);
      for (let i = 0; i < 6; i++) g.step([shift(P.open, 0.05 * (i + 1), 0)], 1/30);
      const after = g.state().yaw;
      const HOLD = shift(P.open, 0.30, 0);
      g.step([HOLD], 1/30);
      const coastDelta = Math.abs(g.state().yaw - after);
      for (let i = 0; i < 90; i++) g.step([HOLD], 1/30);
      const settled = g.state().yaw;
      g.step([HOLD], 1/30);
      const finalDrift = Math.abs(g.state().yaw - settled);
      return [coastDelta > 0.5 && finalDrift < 0.5,
              "首帧滑行 " + coastDelta.toFixed(1) + " 度，停止后漂移 " + finalDrift.toFixed(3) + " 度"];
    `
  },

  /* ---------------- 任务 4：相对捏合缩放 ---------------- */
  {
    name: "T4 张开手掌不改变缩放",
    body: `
      g.reset();
      g.step([P.open], 1/30);
      const a = g.state().altitude;
      for (let i = 0; i < 30; i++) g.step([P.open], 1/30);
      const d = g.state().altitude - a;
      return [Math.abs(d) < 0.01, a.toFixed(2) + " -> " + g.state().altitude.toFixed(2)];
    `
  },
  {
    name: "T4 捏合拉近",
    body: `
      g.reset();
      g.step([P.open], 1/30);
      const before = g.state().altitude;
      for (const h of P.ramp) g.step([h], 1/30);
      const after = g.state().altitude;
      return [after < before - 0.3, before.toFixed(2) + " -> " + after.toFixed(2)];
    `
  },
  {
    name: "T4 保持捏合姿势，缩放停在当前级别",
    body: `
      g.reset();
      g.step([P.open], 1/30);
      for (const h of P.ramp) g.step([h], 1/30);
      const held = g.state().altitude;
      const last = P.ramp[P.ramp.length - 1];
      for (let i = 0; i < 40; i++) g.step([last], 1/30);
      const d = Math.abs(g.state().altitude - held);
      return [d < 0.05, "停在 " + held.toFixed(2) + "，之后漂移 " + d.toFixed(3)];
    `
  },

  /* ---------------- 任务 5：手指计数跳视角 ---------------- */
  {
    name: "T5 张开手掌静止半秒不跳视角",
    body: `
      g.reset();
      let jumped = null;
      for (let i = 0; i < 40; i++) {
        const r = g.step([P.open], 1/30);
        if (r.jumpedTo) jumped = r.jumpedTo;
      }
      return [jumped === null, "误触发 " + jumped];
    `
  },
  {
    name: "T5 比 2 保持半秒跳到欧洲",
    body: `
      g.reset();
      let jumped = null;
      for (let i = 0; i < 40; i++) {
        const r = g.step([P.count2], 1/30);
        if (r.jumpedTo) jumped = r.jumpedTo;
      }
      return [jumped === "europe", "jumped=" + jumped];
    `
  },
  {
    name: "T5 比数字但手在移动时不触发",
    body: `
      g.reset();
      let jumped = null;
      for (let i = 0; i < 40; i++) {
        const r = g.step([shift(P.count2, 0.01 * i, 0)], 1/30);
        if (r.jumpedTo) jumped = r.jumpedTo;
      }
      return [jumped === null, "误触发 " + jumped];
    `
  },

  /* ---------------- 任务 6：掌心倾斜 ---------------- */
  {
    name: "T6 手掌竖直时地轴不倾斜",
    body: `
      g.reset();
      for (let i = 0; i < 30; i++) g.step([P.open], 1/30);
      const t = g.state().tiltZ;
      return [Math.abs(t) < 1, "tiltZ=" + t.toFixed(2)];
    `
  },
  {
    name: "T6 手掌侧倾地轴跟着倾，且不改变经度",
    body: `
      g.reset();
      g.step([P.open], 1/30);
      const yaw0 = g.state().yaw;
      for (let i = 0; i < 30; i++) {
        const h = P.open.map((p) => ({ x: p.x, y: p.y }));
        h[9].x += 0.10;
        g.step([h], 1/30);
      }
      const s = g.state();
      return [Math.abs(s.tiltZ) > 10 && Math.abs(s.yaw - yaw0) < 1,
              "tiltZ=" + s.tiltZ.toFixed(1) + " 度, 经度偏移 " + (s.yaw - yaw0).toFixed(3)];
    `
  },

  /* ---------------- 任务 7：双手模式 ---------------- */
  {
    name: "T7 两只手时进入双手模式，单手手势被忽略",
    body: `
      g.reset();
      let r = null;
      for (let i = 0; i < 30; i++) r = g.step([P.count2, P.open], 1/30);
      return [r.mode === "twoHand" && r.jumpedTo === null,
              "mode=" + r.mode + " jumped=" + r.jumpedTo];
    `
  },
  {
    name: "T7 两手拉开则拉近",
    body: `
      g.reset();
      g.step([P.open, P.open], 1/30);
      const before = g.state().altitude;
      for (let i = 0; i < 40; i++) {
        const spread = (i + 1) * 0.004;
        g.step([shift(P.open, -spread, 0), shift(P.open, spread, 0)], 1/30);
      }
      const after = g.state().altitude;
      return [after < before - 0.2, before.toFixed(2) + " -> " + after.toFixed(2)];
    `
  },

  /* ---------------- 手离开画面 ---------------- */
  {
    name: "T7 两手一起平移会旋转地球（双手也管俯仰）",
    body: `
      const mk = (t) => [shift(P.open, t, 0), shift(P.open, 0.35 + t, 0)];
      g.reset();
      g.step(mk(0), 1/30);
      for (let i = 0; i < 3; i++) g.step(mk(0), 1/30);
      const before = g.state();
      for (let i = 1; i <= 20; i++) g.step(mk(0.004 * i), 1/30);
      const after = g.state();
      return [after.yaw < before.yaw - 1,
              "经度 " + before.yaw.toFixed(1) + " -> " + after.yaw.toFixed(1)];
    `
  },
  {
    name: "T7 两手一起上下移动会改变俯仰（这是原来缺的能力）",
    body: `
      const mk = (t) => [shift(P.open, 0, t), shift(P.open, 0.35, t)];
      g.reset();
      g.step(mk(0), 1/30);
      for (let i = 0; i < 3; i++) g.step(mk(0), 1/30);
      const before = g.state().pitch;
      // 步长要够：死区是 1.5 像素，而画面高 480，纵向同样的归一化步长
      // 换算出来的像素比横向少，所以纵向要用更大的步长才能越过死区。
      for (let i = 1; i <= 20; i++) g.step(mk(0.006 * i), 1/30);
      const after = g.state().pitch;
      return [Math.abs(after - before) > 1,
              "纬度 " + before.toFixed(1) + " -> " + after.toFixed(1)];
    `
  },
  {
    name: "T7 绕中点在原地转动两手连线，不再驱动地球",
    body: `
      const mk = (a) => {
        const d = 0.18, co = Math.cos(a), si = Math.sin(a);
        return [shift(P.open, -d * co, -d * si), shift(P.open, d * co, d * si)];
      };
      g.reset();
      g.step(mk(0), 1/30);
      for (let i = 0; i < 4; i++) g.step(mk(0), 1/30);
      const y0 = g.state().yaw;
      let maxDev = 0;
      for (let i = 1; i <= 20; i++) {
        g.step(mk(i * Math.PI / 40), 1/30);
        maxDev = Math.max(maxDev, Math.abs(g.state().yaw - y0));
      }
      return [maxDev < 1, "连线转了约 90 度，经度最大偏移 " + maxDev.toFixed(2) + " 度"];
    `
  },
  {
    name: "T7 一只手闪断一帧不退出双手模式",
    body: `
      g.reset();
      for (let i = 0; i < 5; i++) g.step([P.open, shift(P.open, 0.35, 0)], 1/30);
      const r1 = g.step([P.open], 1/30);
      const r2 = g.step([P.open, shift(P.open, 0.35, 0)], 1/30);
      return [r1.mode === "twoHand" && r2.mode === "twoHand",
              "闪断时 " + r1.mode + "，恢复后 " + r2.mode];
    `
  },
  {
    name: "T7 持续单手会退回单手模式",
    body: `
      g.reset();
      for (let i = 0; i < 5; i++) g.step([P.open, shift(P.open, 0.35, 0)], 1/30);
      let r = null;
      for (let i = 0; i < 10; i++) r = g.step([P.open], 1/30);
      return [r.mode !== "twoHand", "退出后 mode=" + r.mode];
    `
  },

  {
    name: "T8 手离开画面后冻结，回到画面不跳变",
    body: `
      g.reset();
      g.step([P.open], 1/30);
      for (let i = 0; i < 10; i++) g.step([shift(P.open, 0.01 * i, 0)], 1/30);
      for (let i = 0; i < 10; i++) g.step([], 1/30);
      const frozen = g.state().yaw;
      for (let i = 0; i < 10; i++) g.step([], 1/30);
      const stillFrozen = Math.abs(g.state().yaw - frozen) < 0.01;
      // 手从别的位置回来：这一帧只重建基准，不该产生旋转
      const back = shift(P.open, 0.25, 0);
      g.step([back], 1/30);
      const afterReturn = Math.abs(g.state().yaw - frozen);
      return [stillFrozen && afterReturn < 0.5,
              "冻结漂移 " + stillFrozen + "，回来首帧跳 " + afterReturn.toFixed(2) + " 度"];
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
