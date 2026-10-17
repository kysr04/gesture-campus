const { chromium } = require("playwright");
const fs = require("fs");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
(async () => {
  const ctx = await chromium.launchPersistentContext("work/.chrome-profile", { executablePath: CHROME, headless: true,
    viewport:{width:1100,height:1400},
    args:["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"] });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errs=[]; page.on("pageerror",e=>errs.push(e.message)); page.on("console",m=>{ if(m.type()==="error") errs.push(m.text()); });
  await page.goto("http://127.0.0.1:8765/work/portrait/cutout.html", {waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!window.__cutout, null, {timeout:120000});
  const d = await page.evaluate(()=>window.__cutout);
  fs.writeFileSync("assets/portrait.png", Buffer.from(d.split(",")[1], "base64"));
  const m = await page.evaluate(()=>window.__maskPreview);
  fs.writeFileSync("work/harness/out/mask.png", Buffer.from(m.split(",")[1], "base64"));
  console.log(JSON.stringify({bytes: fs.statSync("assets/portrait.png").size, errs}));
  await ctx.close();
})();
