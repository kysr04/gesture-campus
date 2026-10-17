/**
 * 捏合标定测试。
 * 用法: node work/harness/calibration-test.cjs [url]
 */
const { chromium } = require("playwright");
const { POSE } = require("./hands.cjs");

const URL_ARG = process.argv[2] || "http://127.0.0.1:8765/portrait.html";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function cloneHands(h) {
  return h.map((p) => ({ x: p.x, y: p.y }));
}

async function runHand(page, hand, frames, startNow = 1000) {
  return page.evaluate(({ hand, frames, startNow }) => {
    let now = startNow;
    for (let i = 0; i < frames; i++) {
      now += 1000 / 30;
      window.__test.step([hand], now, 1 / 30);
    }
    return { state: window.__test.state(), now };
  }, { hand, frames, startNow });
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

  await page.evaluate(() => {
    window.__test.resetPinchCal();
    window.__test.startCalibration();
  });

  const open = await runHand(page, cloneHands(POSE.open()), 65, 1000);
  const shut = await runHand(page, cloneHands(POSE.pinch()), 65, open.now);
  const cal = await page.evaluate(() => window.__test.calibrationState());
  const calOk = cal.pinchCal.calibrated && cal.pinchCal.hi - cal.pinchCal.lo > 0.5;
  check(
    "张手/捏合 4 秒完成标定",
    calOk && !cal.active,
    `lo=${cal.pinchCal.lo?.toFixed(2)} hi=${cal.pinchCal.hi?.toFixed(2)} active=${cal.active}`
  );

  const stored = await page.evaluate(() => localStorage.getItem("particle-pinch-cal-v1"));
  check("标定写入 localStorage", !!stored, String(stored));

  // 标定后，真实手势映射应该仍然到 0 / 1
  await page.evaluate(() => {
    window.__test.setShape(0);
    window.__test.setPortrait(false);
    window.__test.reset();
  });
  const openMap = await runHand(page, cloneHands(POSE.open()), 40, 1000);
  const shutMap = await runHand(page, cloneHands(POSE.pinch()), 40, openMap.now);
  check("标定后张开→0", openMap.state.grabTarget < 0.05, `target=${openMap.state.grabTarget.toFixed(3)}`);
  check("标定后捏紧→1", shutMap.state.grabTarget > 0.9, `target=${shutMap.state.grabTarget.toFixed(3)}`);

  // 刷新后标定应该还在
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const persisted = await page.evaluate(() => window.__test.calibrationState());
  check(
    "刷新后标定仍在",
    persisted.pinchCal.calibrated === true,
    `lo=${persisted.pinchCal.lo?.toFixed(2)} hi=${persisted.pinchCal.hi?.toFixed(2)}`
  );

  // 重置回默认
  await page.evaluate(() => window.__test.resetPinchCal());
  const reset = await page.evaluate(() => ({
    cal: window.__test.calibrationState(),
    stored: localStorage.getItem("particle-pinch-cal-v1")
  }));
  check(
    "重置恢复默认并清除存储",
    reset.cal.pinchCal.calibrated === false && reset.stored === null,
    `calibrated=${reset.cal.pinchCal.calibrated} stored=${reset.stored}`
  );

  check("没有 pageerror", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  console.log(JSON.stringify({ results, passed: results.filter((r) => r.ok).length, total: results.length }, null, 2));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
