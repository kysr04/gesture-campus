/* ============================== 校园场景 ================================== */

async function loadThree(onStage) {
  let lastErr = null;
  for (const url of THREE_CDNS) {
    try {
      if (onStage) onStage('正在加载 3D 库…（' + new URL(url).host + '）');
      return await import(url);
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('three.js 加载失败');
}

// 视觉参数。全部集中在这里，方便调。
const CAMPUS = {
  DATA_URL: './campus/campus.json',
  HEIGHTS_URL: './campus/heights.json',
  // OSM 上没写高度的建筑，bake 时按这个默认值填的。加载时用同样的数字
  // 反推出"哪些高度是估的"，好在界面上提示用户优先核对。
  ESTIMATED_HEIGHT: 12.0,
  PITCH_MIN: 5,              // 度。接近平视，能看到楼的高度
  PITCH_MAX: 88,             // 度。接近正俯视，看校区布局
  COLOR_BUILDING: 0xb9cbe8,
  COLOR_BUILDING_TALL: 0x9fd0ff,
  COLOR_EDGE: 0x3f6ea8,
  COLOR_ROAD: 0x5f7fb0,
  COLOR_GROUND: 0x151d2c,
  COLOR_GREEN: 0x1d3a2c,
  COLOR_PITCH: 0x24513c,
  HIGHLIGHT: 0xffd166
};

/**
 * 读取烘好的校园数据，并把高度覆盖表套上去。
 *
 * 覆盖表放在前端应用而不是烘进数据里：这样改一个数字、刷新页面就生效，
 * 不需要重跑构建脚本，也不需要重新拉 OSM。
 */
async function loadCampusData() {
  const res = await fetch(CAMPUS.DATA_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error('校园数据加载失败：HTTP ' + res.status);
  const data = await res.json();

  let overrides = {};
  try {
    const r = await fetch(CAMPUS.HEIGHTS_URL, { cache: 'no-cache' });
    if (r.ok) overrides = (await r.json()).overrides || {};
  } catch (_) { /* 覆盖表是可选的 */ }

  let estimated = 0;
  data.buildings.forEach((b, i) => {
    const byName = b.n ? overrides[b.n] : undefined;
    const byIndex = overrides['#' + i];
    if (typeof byName === 'number') { b.h = byName; b.ov = true; }
    else if (typeof byIndex === 'number') { b.h = byIndex; b.ov = true; }
    else if (Math.abs(b.h - CAMPUS.ESTIMATED_HEIGHT) < 0.05) { b.est = true; estimated++; }
  });
  data.stats = {
    buildings: data.buildings.length,
    named: data.buildings.filter((b) => b.n).length,
    estimated,
    roads: data.roads.length,
    greens: data.greens.length
  };
  return data;
}

async function createScene(container, onStage) {
  const THREE = await loadThree(onStage);
  const data = await loadCampusData();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, VIS.DPR_LIMIT));
  renderer.setClearColor(0x0a0e16, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 40000);

  scene.add(new THREE.AmbientLight(0x8fb4ff, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.45);
  sun.position.set(-0.5, 1, 0.6).multiplyScalar(1000);
  scene.add(sun);

  // ---- 量范围，决定相机远近 ----
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  const grow = (ring) => {
    for (const p of ring) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minZ) minZ = p[1];
      if (p[1] > maxZ) maxZ = p[1];
    }
  };
  data.buildings.forEach((b) => grow(b.o));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxZ - minZ);

  const group = new THREE.Group();
  scene.add(group);

  // ---- 建筑。XY 平面上的多边形挤出后绕 X 轴立起来：形状的 y 变成 -z（北向），
  //      挤出方向变成 +y（高度）。----
  const pickables = [];
  const matNormal = new THREE.MeshLambertMaterial({ color: CAMPUS.COLOR_BUILDING });
  const matTall = new THREE.MeshLambertMaterial({ color: CAMPUS.COLOR_BUILDING_TALL });
  const edgeMat = new THREE.LineBasicMaterial({ color: CAMPUS.COLOR_EDGE, transparent: true, opacity: 0.55 });

  let tallest = { h: 0, n: '' };
  data.buildings.forEach((b, idx) => {
    const shape = new THREE.Shape();
    b.o.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mat = (b.h >= 20 ? matTall : matNormal).clone();
    mat.color = mat.color.clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { kind: 'building', idx, name: b.n || ('建筑 #' + idx), h: b.h, est: !!b.est };
    group.add(mesh);
    pickables.push(mesh);
    const eg = new THREE.EdgesGeometry(geo, 25);
    group.add(new THREE.LineSegments(eg, edgeMat));
    if (b.h > tallest.h) tallest = { h: b.h, n: b.n };
  });

  // ---- 道路 ----
  const roadVerts = [];
  for (const r of data.roads) {
    for (let i = 0; i < r.o.length - 1; i++) {
      roadVerts.push(r.o[i][0], 1.5, r.o[i][1], r.o[i + 1][0], 1.5, r.o[i + 1][1]);
    }
  }
  if (roadVerts.length) {
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3));
    group.add(new THREE.LineSegments(rg, new THREE.LineBasicMaterial({
      color: CAMPUS.COLOR_ROAD, transparent: true, opacity: 0.8
    })));
  }

  // ---- 绿地与球场 ----
  for (const g of data.greens) {
    const shape = new THREE.Shape();
    g.o.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0.4, 0);
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: g.k === 'pitch' ? CAMPUS.COLOR_PITCH : CAMPUS.COLOR_GREEN,
      side: THREE.DoubleSide, transparent: true, opacity: 0.95
    })));
  }

  // ---- 地面用校园多边形本身，轮廓一出来就有"这是个校园"的感觉 ----
  if (data.campus) {
    const shape = new THREE.Shape();
    data.campus.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 0.1, 0);
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: CAMPUS.COLOR_GROUND, side: THREE.DoubleSide
    })));

    const ring = data.campus.map(([x, z]) => new THREE.Vector3(x, 1, -z));
    ring.push(ring[0].clone());
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring),
      new THREE.LineBasicMaterial({ color: CAMPUS.COLOR_EDGE, transparent: true, opacity: 0.9 })));
  }

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    // 第三参数必须是 true。传 false 表示"别动 canvas 的 CSS 尺寸"，
    // 那样在 2 倍屏上 canvas 会按设备像素显示，比容器大一倍，只能看到四分之一。
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));

  const camDir = new THREE.Vector3();
  const camUp = new THREE.Vector3();

  /** 把视角状态套到相机上。渲染层唯一的入口。 */
  function apply(s) {
    const r = span * s.altitude;
    const yawRad = s.yaw * Math.PI / 180;
    const pitchRad = clamp(s.pitch, CAMPUS.PITCH_MIN, CAMPUS.PITCH_MAX) * Math.PI / 180;
    camera.position.set(
      cx + r * Math.cos(pitchRad) * Math.sin(yawRad),
      r * Math.sin(pitchRad),
      cz + r * Math.cos(pitchRad) * Math.cos(yawRad)
    );
    // 掌心倾斜在这个场景里是"把沙盘歪一下"，绕视线轴滚转相机
    camDir.copy(camera.position).sub(new THREE.Vector3(cx, 0, cz)).normalize().negate();
    camUp.set(0, 1, 0).applyAxisAngle(camDir, (s.tiltZ || 0) * Math.PI / 180);
    camera.up.copy(camUp);
    camera.lookAt(cx, 0, cz);
  }

  function render() { renderer.render(scene, camera); }

  function stats() {
    const info = renderer.info.render;
    return {
      buildings: data.stats.buildings,
      named: data.stats.named,
      estimatedHeights: data.stats.estimated,
      roads: data.stats.roads,
      greens: data.stats.greens,
      drawCalls: info.calls,
      triangles: info.triangles
    };
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  /** 鼠标悬停找建筑 */
  function pickBuilding(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickables, false);
    return hits.length ? hits[0].object.userData : null;
  }

  window.__campusInfo = {
    name: data.name, span: Math.round(span), tallest,
    stats: data.stats, origin: data.origin
  };

  return {
    THREE, apply, render, resize, stats, pickBuilding,
    camera, renderer, group, data, center: { x: cx, z: cz }, span,
    dispose() { renderer.dispose(); }
  };
}
