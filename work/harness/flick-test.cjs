/**
 * 甩动惯性 / 手回来渐入测试。
 * 用法: node work/harness/flick-test.cjs [url]
 */
const { chromium } = require("playwright");
const { POSE } = require("./hands.cjs");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/portrait.html";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function cloneHands(h) {
  return h.map((p) => ({ x: p.x, y: p.y }));
}

function shifted(dx) {
  return cloneHands(POSE.shift(POSE.open(), dx));
}

async function resetNoShape(page) {
  await page.evaluate(() => {
    window.__test.setShape(0);
    window.__test.setPortrait(false);
    window.__test.reset();
  });
}

async function runFrames(page, handsPerFrame, frames) {
  return page.evaluate(({ handsPerFrame, frames }) => {
    const samples = [];
    let now = 1000;
    for (let i = 0; i < frames; i++) {
      now += 1000 / 30;
      const frame = handsPerFrame[Math.min(i, handsPerFrame.length - 1)];
      window.__test.step(frame, now, 1 / 30);
      const s = window.__test.state();
      samples.push({
        yaw: s.yaw,
        coasting: s.coasting,
        gainRamp: s.gainRamp,
        awaiting: s.awaitingReacquire
      });
    }
    return { final: window.__test.state(), samples };
  }, { handsPerFrame, frames });
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
  const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });

  await page.goto(URL_ARG, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });

  // 快速横向划手：手停下后应该继续滑一小段
  await resetNoShape(page);
  {
    const swipe = [];
    for (let i = 0; i < 2; i++) swipe.push([shifted(0)]);
    let last = null;
    for (let i = 0; i < 8; i++) {
      last = shifted(0.02 * (i + 1));
      swipe.push([last]);
    }
    const before = await runFrames(page, swipe, 10);
    const after = await runFrames(page, Array.from({ length: 30 }, () => [last]), 30);
    const sawCoast = before.samples.concat(after.samples).some((s) => s.coasting);
    const yawDelta = Math.abs(after.final.yaw - before.final.yaw);
    check(
      "快速划手后进入惯性滑行",
      sawCoast && yawDelta > 0.5,
      `coast=${sawCoast} yaw=${before.final.yaw.toFixed(2)}→${after.final.yaw.toFixed(2)}`
    );
  }

  // 慢速移动不触发惯性
  await resetNoShape(page);
  {
    const slow = [];
    for (let i = 0; i < 2; i++) slow.push([shifted(0)]);
    let last = null;
    for (let i = 0; i < 8; i++) {
      last = shifted(0.0005 * (i + 1));
      slow.push([last]);
    }
    const a = await runFrames(page, slow, 10);
    const b = await runFrames(page, Array.from({ length: 30 }, () => [last]), 30);
    check(
      "慢速停手不滑行",
      !a.samples.concat(b.samples).some((s) => s.coasting),
      `yaw=${b.final.yaw.toFixed(2)}`
    );
  }

  // 手丢失后冻结；手回来第一帧不跳
  await resetNoShape(page);
  {
    const init = await runFrames(page, [[shifted(0)]], 3);
    const lost = await runFrames(page, Array.from({ length: 8 }, () => []), 8);
    const yawBefore = lost.final.yaw;
    const back = await runFrames(page, [[shifted(-0.2)]], 1);
    const settle = await runFrames(page, Array.from({ length: 10 }, () => [shifted(-0.2)]), 10);
    const jump = Math.abs(back.final.yaw - yawBefore);
    check(
      "手丢失时冻结并标记等待重新捕获",
      lost.final.awaitingReacquire === true && lost.final.coasting === false,
      `awaiting=${lost.final.awaitingReacquire} coasting=${lost.final.coasting}`
    );
    check(
      "手回来第一帧不跳",
      jump < 0.01 && back.final.awaitingReacquire === false,
      `jump=${jump.toFixed(4)} awaiting=${back.final.awaitingReacquire}`
    );
    check(
      "重新捕获后增益渐入到 1",
      settle.final.gainRamp > 0.9,
      `gainRamp=${settle.final.gainRamp.toFixed(3)}`
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
