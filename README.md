# 手势控制的 3D 校园 / 地球

用手在摄像头前直接操作 3D 场景的网页。纯前端，无后端，所有计算在浏览器里完成，
摄像头画面不出设备。

## 两个页面

| 文件 | 内容 |
|---|---|
| `index.html` | 北京化工大学（昌平校区）3D 场景。建筑轮廓来自 OpenStreetMap 真实数据 |
| `globe.html` | 手势控制的地球仪版本，保留备用 |

两个页面共用同一套手势系统：单手拖拽旋转、双手捏合缩放、比 1/2/3/4 跳转机位、
手离开画面冻结。

## 部署

部署到 Cloudflare Pages（必须是 HTTPS，否则 Safari 不给摄像头权限）。

需要一起上传的文件：

```
index.html
globe.html
hand_landmarker.task     ← 手部识别模型，7.8MB
campus/campus.json       ← 校区几何数据
campus/heights.json      ← 建筑高度覆盖表
```

`work/` 目录是开发用的脚本和验证工具，不用上传。

## 改建筑高度

编辑 `campus/heights.json`，键名写建筑名称（没有名字的用 `#序号`），值填米数：

```json
{
  "overrides": {
    "紫竹餐厅": 15,
    "樱花苑5号楼": 30
  }
}
```

改完刷新页面即生效，不需要重新构建。

61 栋建筑里只有 34 栋在 OSM 上有明确高度，其余按每层 3.2 米估算——这些在页面上
悬停时会标「估算」，是优先需要人工核对的。

## 数据来源与许可

校区建筑轮廓、道路、绿地数据来自 **OpenStreetMap**，遵循
[ODbL 协议](https://opendatacommons.org/licenses/odbl/)。

© OpenStreetMap contributors — https://www.openstreetmap.org/copyright

若分发本项目，请保留此署名。

## 技术栈

- 渲染：three.js（从 CDN 引入，无构建步骤）
- 手部识别：MediaPipe Tasks Vision HandLandmarker（WASM + WebGL2）
- 部署：纯静态文件
