const { chromium } = require("playwright");

const URL = process.argv[2] || "http://127.0.0.1:8765/index.html?debug";

// 用合成关键点造出三种手势，检查判定结果和输出范围。
// 关键点索引：0 手腕，4 拇指尖，8 食指尖，12/16/20 中指/无名指/小指指尖
function makeHand({ tipY, pipY, indexTip, thumbTip }) {
  const lm = [];
  for (let i = 0; i < 21; i++) lm.push({ x: 0.5, y: 0.9 });
  lm[0] = { x: 0.5, y: 0.92 };            // 手腕
  // 四个掌指关节（5,9,13,17）
  const mcps = [0.44, 0.485, 0.53, 0.575];
  [5, 9, 13, 17].forEach((id, i) => { lm[id] = { x: mcps[i], y: 0.62 }; });
  // 第二关节（6,10,14,18）
  [6, 10, 14, 18].forEach((id, i) => { lm[id] = { x: mcps[i], y: pipY }; });
  // 指尖（8,12,16,20）
  [8, 12, 16, 20].forEach((id, i) => { lm[id] = { x: mcps[i], y: tipY }; });
  lm[4] = thumbTip;                        // 拇指尖
  lm[3] = { x: 0.40, y: 0.68 };
  lm[2] = { x: 0.42, y: 0.70 };
  lm[1] = { x: 0.45, y: 0.74 };
  if (indexTip) lm[8] = indexTip;
  return lm;
}

const OPEN = makeHand({ tipY: 0.30, pipY: 0.48, thumbTip: { x: 0.20, y: 0.60 } });
const FIST = makeHand({ tipY: 0.66, pipY: 0.55, thumbTip: { x: 0.50, y: 0.64 } });
const PINCH = makeHand({ tipY: 0.30, pipY: 0.48, thumbTip: { x: 0.455, y: 0.32 }, indexTip: { x: 0.47, y: 0.40 } });

// 手掌偏左，用来验证旋转方向
const OPEN_LEFT = JSON.parse(JSON.stringify(OPEN));
OPEN_LEFT.forEach(p => { p.x = p.x - 0.22; });
OPEN_LEFT[4].x -= 0.22;

(async () => {
  const context = await chromium.launchPersistentContext("work/.chrome-profile", {
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    viewport: { width: 1100, height: 760 },
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"]
  });
  const page = context.pages()[0] || (await context.newPage());
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const result = await page.evaluate(({ OPEN, FIST, PINCH, OPEN_LEFT }) => {
    const g = window.__gesture;
    if (!g) return { fatal: "调试钩子没挂上" };
    const out = {};
    const settle = (lm, n = 25) => {
      let r = null;
      for (let i = 0; i < n; i++) r = g.step(lm, 1 / 30);
      return r;
    };

    g.reset();
    out.openPalm = settle(OPEN);
    out.fist = settle(FIST);
    out.pinchWhilePaused = settle(PINCH);
    out.pinchStillPaused = g.step(PINCH, 1 / 30).paused;
    // 从"张开"状态捏合：应该解除不了暂停之外，还要把地球拉到最近
    g.reset();
    settle(OPEN, 20);
    out.pinchWhileActive = settle(PINCH, 30);
    out.openAgain = settle(OPEN, 30);
    out.openLeft = settle(OPEN_LEFT);
    out.constants = g.constants;
    return out;
  }, { OPEN, FIST, PINCH, OPEN_LEFT });

  console.log(JSON.stringify({ result, errors }, null, 2));
  await context.close();
})();
