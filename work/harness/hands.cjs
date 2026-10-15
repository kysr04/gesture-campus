/**
 * 合成手掌构造器。
 *
 * 坐标是 MediaPipe 那套：0..1 的归一化图像坐标，原点在左上。
 * 构造出来的手能精确控制三件测试关心的事：
 *   - 哪几根手指伸直
 *   - 拇指是内收还是外展（决定手指计数会不会误触发）
 *   - 拇指尖和食指尖的距离（决定捏合判定）
 *
 * 中指根对准手腕，这样"手竖直"就是真正的零倾斜角。
 * 几何自检（手掌尺度 = 手腕到中指根的距离 = 0.15）：
 *   张开手掌：拇指尖到食指根 ≈ 0.237 → 比值 1.58（外展）
 *   比数字：  拇指尖到食指根 ≈ 0.106 → 比值 0.70（内收）
 *   捏合：    拇指尖到食指尖 ≈ 0.038 → 比值 0.25（远低于 0.55 的进入阈值）
 */

function makeHand({ ext = [1, 1, 1, 1], thumbTip, cx = 0.5, cy = 0.55 } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));

  lm[0] = { x: cx, y: cy + 0.15 };                                   // 手腕
  lm[1] = { x: cx - 0.09, y: cy + 0.08 };                            // 拇指根节区
  lm[2] = { x: cx - 0.115, y: cy + 0.045 };
  lm[3] = { x: cx - 0.13, y: cy + 0.02 };
  lm[4] = thumbTip || { x: cx - 0.15, y: cy + 0.01 };                // 默认内收

  // 中指根对准手腕，保证"竖直的手"倾斜角为零
  const mcpX = [cx - 0.045, cx, cx + 0.045, cx + 0.09];              // 食指/中指/无名指/小指根
  [5, 9, 13, 17].forEach((id, i) => { lm[id] = { x: mcpX[i], y: cy }; });
  [6, 10, 14, 18].forEach((id, i) => { lm[id] = { x: mcpX[i], y: cy - 0.09 }; });
  [8, 12, 16, 20].forEach((id, i) => {
    lm[id] = { x: mcpX[i], y: ext[i] ? cy - 0.22 : cy - 0.045 };
  });

  return lm;
}

// 指尖的具体坐标，方便测试里直接引用
const TIP_OF = { index: 8, middle: 12, ring: 16, pinky: 20 };

const POSE = {
  /** 五指张开，拇指外展。这是拖拽旋转时的自然姿势。 */
  open: () => makeHand({ thumbTip: { x: 0.22, y: 0.58 } }),

  /** 比数字：伸出 n 根手指，拇指内收。 */
  counting: (n) => makeHand({
    ext: [0, 1, 2, 3].map((i) => (i < n ? 1 : 0)),
    thumbTip: { x: 0.35, y: 0.56 }
  }),

  /** 捏合：拇指尖贴住食指尖。 */
  pinch: () => makeHand({
    thumbTip: { x: 0.423, y: 0.35 }
  }),

  /** 把整只手平移一段距离，用来模拟拖拽或甩动。 */
  shift: (lm, dx, dy = 0) => lm.map((p) => ({ x: p.x + dx, y: p.y + dy }))
};

module.exports = { makeHand, POSE, TIP_OF };
