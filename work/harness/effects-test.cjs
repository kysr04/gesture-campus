/**
 * 手掌力场 / 拖尾开关测试。
 * 用法: node work/harness/effects-test.cjs [baseUrl]
 */
const { chromium } = require("playwright");
const { POSE } = require("./hands.cjs");

const BASE = process.argv[2] || "http://127.0.0.1:8765/portrait.html";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function shifted(dx) {
  return POSE.shift(POSE.open(), dx).map((p) => ({ x: p.x, y: p.y }));
}

async function run(page, framesHands, frames) {
  return page.evaluate(({ framesHands, frames }) => {
    let now = 1000;
    for (let i = 0; i < frames; i++) {
      now += 1000 / 30;
      const frame = framesHands[Math.min(i, framesHands.length - 1)];
      window.__test.step(frame, now, 1 / 30);
    }
    return window.__test.state();
  }, { framesHands, frames });
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

  await page.goto(BASE + "?q=mid&lockq=1&trails=0", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  await page.evaluate(() => { window.__test.setShape(0); window.__test.setPortrait(false); window.__test.reset(); });

  const still = await run(page, [[shifted(0)]], 24);
  check("手在画面里产生掌心力场", still.palmStrength > 0.25, `strength=${still.palmStrength.toFixed(3)} target=${still.palmTarget.toFixed(3)}`);

  const moveHands = Array.from({ length: 8 }, (_, i) => shifted(0.02 * (i + 1)));
  const moving = await run(page, moveHands.map((h) => [h]), 8);
  check(
    "手快速移动时力场增强",
    moving.palmTarget > still.palmTarget + 0.1,
    `still=${still.palmTarget.toFixed(3)} moving=${moving.palmTarget.toFixed(3)}`
  );

  const none = await run(page, [[]], 45);
  check("手离开后力场衰减", none.palmStrength < 0.05, `strength=${none.palmStrength.toFixed(3)}`);
  check("trails=0 可关闭拖尾", none.trails === false, `trails=${none.trails}`);

  await page.goto(BASE + "?trails=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const on = await page.evaluate(() => window.__test.state());
  check("默认开启拖尾", on.trails === true, `trails=${on.trails}`);

  check("没有 pageerror", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
  console.log(JSON.stringify({ results, passed: results.filter((r) => r.ok).length, total: results.length }, null, 2));
  await browser.close();
  process.exit(results.every((r) => r.ok) ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
