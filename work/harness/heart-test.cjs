/**
 * 爱心蓄力 / 爆炸 / 双捏锁定 / 掌心跟随测试。
 * 用法: node work/harness/heart-test.cjs [url]
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

async function run(page, framesHands, startNow = 1000) {
  return page.evaluate(({ framesHands, startNow }) => {
    let now = startNow;
    for (const frame of framesHands) {
      now += 1000 / 30;
      window.__test.step(frame, now, 1 / 30);
    }
    return { state: window.__test.state(), now };
  }, { framesHands, startNow });
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

  const open = cloneHands(POSE.open());
  const pinch = cloneHands(POSE.pinch());
  const pinchFrames = (n) => Array.from({ length: n }, () => [pinch]);
  const openFrames = (n) => Array.from({ length: n }, () => [open]);

  // 爱心贴在掌心，并跟着手移动
  await resetNoShape(page);
  let r = await run(page, Array.from({ length: 12 }, () => [open]));
  const palmX = r.state.heartPoint.x;
  const moved = cloneHands(POSE.shift(POSE.open(), 0.18));
  r = await run(page, Array.from({ length: 12 }, () => [moved]), r.now);
  check(
    "爱心贴在掌心并跟随手",
    r.state.palmPresent === true && Math.abs(palmX - 0.5) < 0.12 && r.state.heartPoint.x > palmX + 0.08,
    `before=${palmX.toFixed(2)} after=${r.state.heartPoint.x.toFixed(2)}`
  );

  // 捏住蓄力
  await resetNoShape(page);
  r = await run(page, pinchFrames(110));
  check(
    "捏住会蓄力到 1",
    r.state.grabHeld === true && r.state.heartCharge > 0.9 && r.state.grabTarget > 0.9,
    `charge=${r.state.heartCharge.toFixed(2)} target=${r.state.grabTarget.toFixed(2)}`
  );

  // 形态态捏合也要生效：先散回星云，再出爱心
  await resetNoShape(page);
  await page.evaluate(() => window.__test.setShape(2));
  r = await run(page, pinchFrames(30));
  check(
    "形态态捏合会散开并蓄力",
    r.state.portraitOn === false && r.state.heartCharge > 0.3,
    `shapeOn=${r.state.portraitOn} charge=${r.state.heartCharge.toFixed(2)}`
  );

  // 松开 → 300ms 后爆炸
  await resetNoShape(page);
  r = await run(page, pinchFrames(110));
  const release = await run(page, openFrames(2), r.now);
  const burst = await run(page, openFrames(14), release.now);
  check(
    "松开后延迟爆炸",
    release.state.pendingBurstAt > 0 && release.state.heartLocked === false &&
      burst.state.burstK > 0.05 && burst.state.burstFxT < 0.8,
    `pending=${release.state.pendingBurstAt > 0} burst=${burst.state.burstK.toFixed(2)} fx=${burst.state.burstFxT.toFixed(2)}`
  );

  // 蓄力后松手，300ms 内再捏：锁定
  await resetNoShape(page);
  r = await run(page, pinchFrames(110));
  const rel = await run(page, openFrames(2), r.now);
  const lock = await run(page, pinchFrames(3), rel.now);
  check(
    "双捏锁定爱心",
    lock.state.heartLocked === true && lock.state.lockedCharge > 0.5,
    `locked=${lock.state.heartLocked} charge=${lock.state.lockedCharge.toFixed(2)}`
  );

  // 锁定后松手，爱心应该留下
  const held = await run(page, openFrames(4), lock.now);
  check(
    "锁定后松手不消失",
    held.state.heartLocked === true && held.state.grabTarget > 0.5,
    `locked=${held.state.heartLocked} target=${held.state.grabTarget.toFixed(2)}`
  );

  // 锁定后再双捏：解锁并爆炸
  const unlockRel = await run(page, openFrames(2), held.now);
  const unlock = await run(page, pinchFrames(3), unlockRel.now);
  check(
    "双捏解锁并爆炸",
    unlock.state.heartLocked === false && unlock.state.burstK > 0.05,
    `locked=${unlock.state.heartLocked} burst=${unlock.state.burstK.toFixed(2)}`
  );

  check("没有 pageerror", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  console.log(JSON.stringify({ results, passed: results.filter((x) => x.ok).length, total: results.length }, null, 2));
  await browser.close();
  process.exit(results.every((x) => x.ok) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
