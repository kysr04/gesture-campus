/**
 * 粒子形态系统的合成手势测试。
 * 用法: node work/harness/shape-test.cjs [url]
 *
 * 不启动摄像头，只等 window.__ready 后直接喂 __test.step()。
 */
const { chromium } = require("playwright");
const { makeHand, POSE } = require("./hands.cjs");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/portrait.html";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function cloneHands(h) {
  return h.map((p) => ({ x: p.x, y: p.y }));
}

async function runFrames(page, handsFrames, frames, dt = 1 / 30) {
  return page.evaluate(({ handsFrames, frames, dt }) => {
    const samples = [];
    let now = 1000;
    for (let i = 0; i < frames; i++) {
      now += dt * 1000;
      const hand = handsFrames[Math.min(i, handsFrames.length - 1)];
      window.__test.step([hand], now, dt);
      const s = window.__test.state();
      samples.push({
        current: s.currentPortrait,
        on: s.portraitOn,
        queue: s.switchQueue,
        mix: s.portraitMix,
        pending: s.pendingShape
      });
    }
    return { final: window.__test.state(), samples };
  }, { handsFrames, frames, dt });
}

async function resetTo(page, shape, active) {
  await page.evaluate(({ shape, active }) => {
    window.__test.setShape(shape);
    window.__test.setPortrait(active);
    window.__test.reset();
  }, { shape, active });
}

function movingHands(makeHand, frames, dx = 0.008) {
  return Array.from({ length: frames }, (_, i) => {
    const h = makeHand();
    h.forEach((p) => { p.x += dx * i; });
    return cloneHands(h);
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: [
      "--enable-unsafe-swiftshader",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--force-color-profile=srgb",
      "--hide-scrollbars"
    ]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  const results = [];
  const check = (name, ok, detail) => {
    results.push({ name, ok: !!ok, detail });
  };

  await page.goto(URL_ARG, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });

  // 1/2/3 指和小指 → 形态 0/1/2/3
  const cases = [
    { name: "比 1 指", pose: POSE.counting(1), start: 2, expected: 0 },
    { name: "比 2 指", pose: POSE.counting(2), start: 0, expected: 1 },
    { name: "比 3 指", pose: POSE.counting(3), start: 0, expected: 2 },
    { name: "小指", pose: POSE.pinky(), start: 0, expected: 3 }
  ];
  for (const c of cases) {
    await resetTo(page, c.start, false);
    const pose = cloneHands(c.pose);
    const r = await runFrames(page, [pose], 90);
    check(
      `${c.name}切到形态 ${c.expected}`,
      r.final.currentPortrait === c.expected && r.final.portraitOn === true,
      `current=${r.final.currentPortrait} on=${r.final.portraitOn}`
    );
  }

  // 张开手掌、拇指靠近食指时，不能误切 DNA
  await resetTo(page, 0, false);
  {
    const tuckedOpen = cloneHands(makeHand({
      ext: [1, 1, 1, 1],
      thumbTip: { x: 0.40, y: 0.56 }
    }));
    const r = await runFrames(page, [tuckedOpen], 90);
    check(
      "张开手掌拇指靠内不切 DNA",
      r.final.currentPortrait === 0 && r.final.portraitOn === false,
      `current=${r.final.currentPortrait} on=${r.final.portraitOn}`
    );
  }

  // 张开手掌不能切换
  await resetTo(page, 2, false);
  {
    const r = await runFrames(page, [cloneHands(POSE.open())], 90);
    check(
      "张开手掌不切换",
      r.final.currentPortrait === 2 && r.final.portraitOn === false,
      `current=${r.final.currentPortrait} on=${r.final.portraitOn}`
    );
  }

  // 比 3 指但手在移动，不能切换
  await resetTo(page, 0, false);
  {
    const moving = movingHands(() => POSE.counting(3), 90, 0.008);
    const r = await runFrames(page, moving, 90);
    check(
      "移动中的 3 指不切换",
      r.final.currentPortrait === 0 && r.final.portraitOn === false,
      `current=${r.final.currentPortrait} on=${r.final.portraitOn}`
    );
  }

  // 已有形态时比 3 指：应先散开，再切到银河
  await resetTo(page, 0, true);
  {
    const r = await runFrames(page, [cloneHands(POSE.counting(3))], 100);
    const queueSeen = r.samples.some((s) => s.queue === 2);
    const minMix = Math.min(...r.samples.map((s) => s.mix));
    check(
      "已有形态时散开再切到银河",
      queueSeen && minMix < 0.1 && r.final.currentPortrait === 2 && r.final.portraitOn === true,
      `queueSeen=${queueSeen} minMix=${minMix.toFixed(3)} current=${r.final.currentPortrait} on=${r.final.portraitOn}`
    );
  }

  // 从银河切回人像，确认共用 attribute 缓冲没有被上一次形态污染
  await resetTo(page, 2, true);
  {
    const r = await runFrames(page, [cloneHands(POSE.counting(1))], 100);
    check(
      "银河切回人像1",
      r.final.currentPortrait === 0 && r.final.portraitOn === true,
      `current=${r.final.currentPortrait} on=${r.final.portraitOn}`
    );
  }

  check("没有 pageerror", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  console.log(JSON.stringify({ results, passed: results.filter((r) => r.ok).length, total: results.length }, null, 2));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
