const http = require("http");
const fs = require("fs");
const path = require("path");

// 用启动时的工作目录作为站点根，避免把中文路径当命令行参数传给子进程
// （PowerShell -> CreateProcess 会把它转坏，导致服务器指向错误目录）。
const ROOT = process.cwd();
const PORT = 8765;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".task": "application/octet-stream"
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const target = path.join(ROOT, rel);
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found: " + rel);
      return;
    }
    // HTML 不缓存（改完刷新就能看到），其余资源长缓存——
    // 模型 7.8MB，每次刷新都重下的话迭代根本没法进行。
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=86400"
    });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("serving " + ROOT + " on http://127.0.0.1:" + PORT);
});
