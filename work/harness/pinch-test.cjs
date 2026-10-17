/**
 * 连续捏合测试。
 * 用法: node work/harness/pinch-test.cjs [url]
 */
const { chromium } = require("playwright");
const { POSE } = require("./hands.cjs");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/portrait.html";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function cloneHands(h) {
  return h.map((p) => ({ x: p.x, y: p.y }));
}

async function resetNoShape(page) {
  await page.evaluate(() => {
    window.__test.setShape(0);
    window.__test.setPortrait(false);
    window.__test.reset();
  });
}

async function runHand(page, hand, frames = 50) {
  return page.evaluate(({ hand, frames }) => {
    let now = 1000;
    for (let i = 0; i < frames; i++) {
      now += 1000 / 30;
      window.__test.step([hand], now, 1 / 30);
    }
    return window.__test.state();
  }, { hand, frames });
}

async function runOverride(page, value, frames = 60) {
  return page.evaluate(({ value, frames }) => {
    window.__test.setPinch(value);
    let now = 1000;
    for (let i = 0; i < frames; i++) {
      now += 1000 / 30;
      window.__test.step([], now, 1 / 30);
    }
    return window.__test.state();
  }, { value, frames });
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

  // 真实手势到 grabTarget 的映射
  await resetNoShape(page);
  const open = await runHand(page, cloneHands(POSE.open()));
  check("张开手掌 grabTarget≈0", open.grabTarget < 0.05, `target=${open.grabTarget.toFixed(3)}`);

  await resetNoShape(page);
  const mid = await runHand(page, cloneHands(POSE.pinchRamp(0.8)), 12);
  check(
    "半捏能开始蓄力",
    mid.grabHeld === true && mid.heartCharge > 0.05 && mid.grabTarget > 0.1,
    `held=${mid.grabHeld} charge=${mid.heartCharge.toFixed(3)} target=${mid.grabTarget.toFixed(3)}`
  );

  await resetNoShape(page);
  const shut = await runHand(page, cloneHands(POSE.pinch()), 110);
  check("捏紧完成蓄力", shut.heartCharge > 0.9 && shut.grabTarget > 0.9, `charge=${shut.heartCharge.toFixed(3)} target=${shut.grabTarget.toFixed(3)}`);

  // 连续 override：0 → 0.3 → 0.6 → 1 → 0
  await resetNoShape(page);
  const m0 = await runOverride(page, 0.0, 40);
  const m3 = await runOverride(page, 0.3, 60);
  const m6 = await runOverride(page, 0.6, 60);
  const m10 = await runOverride(page, 1.0, 60);
  const back = await runOverride(page, 0.0, 80);

  check(
    "grabMix 随捏合力度单调增加",
    m3.grabMix > m0.grabMix + 0.15 &&
      m6.grabMix > m3.grabMix + 0.15 &&
      m10.grabMix > m6.grabMix + 0.15,
    `0=${m0.grabMix.toFixed(2)} .3=${m3.grabMix.toFixed(2)} .6=${m6.grabMix.toFixed(2)} 1=${m10.grabMix.toFixed(2)}`
  );
  check("松开后回到接近 0", back.grabMix < 0.05, `mix=${back.grabMix.toFixed(3)}`);
  check("没有 pageerror", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  console.log(JSON.stringify({ results, passed: results.filter((r) => r.ok).length, total: results.length }, null, 2));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
