/* ============================== 粒子场景 ================================== */

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

const FIELD = {
  COUNT: 26000,
  R_MIN: 26,               // 云的内半径。相机轨道最大只有 48，所以永远在云里面，
  R_MAX: 130,              // 这样平移才会产生"穿过粒子"的视差，而不是"看着一团东西转"
  ORBIT_BASE: 9,
  ORBIT_GAIN: 18,
  GRAB_COUNT: 420,
  GRAB_DIST: 6,
  COLOR_A: 0x9fe8ff,
  COLOR_B: 0x7aa8ff,
  COLOR_C: 0xd8c6ff,
  DPR_LIMIT: 2
};

/** 粒子场。位置一次性生成，流动和闪烁在着色器里做，CPU 每帧零开销。 */
function buildField(THREE) {
  const n = FIELD.COUNT;
  const pos = new Float32Array(n * 3);
  const seed = new Float32Array(n);
  const tint = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.max(0, 1 - u * u));
    const R = FIELD.R_MIN + Math.pow(Math.random(), 0.65) * (FIELD.R_MAX - FIELD.R_MIN);
    pos[i * 3] = rr * Math.cos(th) * R;
    pos[i * 3 + 1] = u * R * 0.55;          // 压扁成片状，飞行时更像穿过星云
    pos[i * 3 + 2] = rr * Math.sin(th) * R;
    seed[i] = Math.random();
    tint[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  return g;
}

function fieldMaterial(THREE) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      cA: { value: new THREE.Color(FIELD.COLOR_A) },
      cB: { value: new THREE.Color(FIELD.COLOR_B) },
      cC: { value: new THREE.Color(FIELD.COLOR_C) }
    },
    vertexShader: `
      attribute float aSeed;
      attribute float aTint;
      uniform float uTime;
      varying float vShade;
      varying float vTint;
      void main() {
        vec3 p = position;
        float t = uTime * 0.35 + aSeed * 6.283;
        p.x += sin(t * 0.70) * 1.6;
        p.y += cos(t * 0.53) * 1.1;
        p.z += sin(t * 0.61 + 1.7) * 1.6;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vShade = clamp(1.0 - (d - 20.0) / 150.0, 0.12, 1.0);
        vTint = aTint;
        gl_PointSize = clamp(120.0 / d, 1.0, 7.0) * (0.7 + aSeed * 0.6);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity;
      uniform vec3 cA; uniform vec3 cB; uniform vec3 cC;
      varying float vShade;
      varying float vTint;
      void main() {
        float r = length(gl_PointCoord - vec2(0.5));
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.05, r);
        vec3 col = mix(mix(cA, cB, vTint), cC, smoothstep(0.75, 1.0, vTint));
        gl_FragColor = vec4(col, a * vShade * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
}

async function createScene(container, onStage) {
  const THREE = await loadThree(onStage);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, FIELD.DPR_LIMIT));
  renderer.setClearColor(0x04060e, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);

  const geo = buildField(THREE);
  const mat = fieldMaterial(THREE);
  scene.add(new THREE.Points(geo, mat));

  // 捏合抓起来的那一团：单独一组点，位置跟着相机前方走
  const grabGeo = new THREE.BufferGeometry();
  const grabPos = new Float32Array(FIELD.GRAB_COUNT * 3);
  const grabSeed = new Float32Array(FIELD.GRAB_COUNT);
  for (let i = 0; i < FIELD.GRAB_COUNT; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.max(0, 1 - u * u));
    grabPos[i * 3] = rr * Math.cos(th) * 3;
    grabPos[i * 3 + 1] = u * 3;
    grabPos[i * 3 + 2] = rr * Math.sin(th) * 3;
    grabSeed[i] = Math.random();
  }
  grabGeo.setAttribute('position', new THREE.BufferAttribute(grabPos, 3));
  grabGeo.setAttribute('aSeed', new THREE.BufferAttribute(grabSeed, 1));
  grabGeo.setAttribute('aTint', new THREE.BufferAttribute(grabSeed.slice(), 1));
  const grabMat = fieldMaterial(THREE);
  grabMat.uniforms.uOpacity.value = 0;
  const grabPoints = new THREE.Points(grabGeo, grabMat);
  grabPoints.frustumCulled = false;
  scene.add(grabPoints);

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    // 第三参数必须是 true，否则 2 倍屏上 canvas 会按设备像素显示、比容器大一倍
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));

  const camDir = new THREE.Vector3();
  const lookTarget = new THREE.Vector3(0, 0, 0);
  let grabMix = 0;
  let grabAmount = 0;

  function apply(s) {
    const r = FIELD.ORBIT_BASE + s.altitude * FIELD.ORBIT_GAIN;
    const yawRad = s.yaw * Math.PI / 180;
    const pitchRad = clamp(s.pitch, -70, 70) * Math.PI / 180;
    camera.position.set(
      r * Math.cos(pitchRad) * Math.sin(yawRad),
      r * Math.sin(pitchRad),
      r * Math.cos(pitchRad) * Math.cos(yawRad)
    );
    camDir.copy(lookTarget).sub(camera.position).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(camDir, (s.tiltZ || 0) * Math.PI / 180);
    camera.up.copy(up);
    camera.lookAt(lookTarget);

    // 抓取点放在相机前方固定距离，捏得越紧这一团收得越小、转得越快
    grabPoints.position.copy(camera.position).add(camDir.clone().multiplyScalar(FIELD.GRAB_DIST));
    grabPoints.scale.setScalar(1.0 + (1 - grabAmount) * 2.2);
    grabPoints.rotation.y += 0.006 + grabAmount * 0.02;
  }

  /** amount: 0 松手 ~ 1 捏紧。也控制淡入淡出。 */
  function setGrab(amount) {
    grabAmount = clamp(amount, 0, 1);
    grabMix = grabAmount;
  }

  function render(elapsed) {
    mat.uniforms.uTime.value = elapsed;
    grabMat.uniforms.uTime.value = elapsed;
    grabMat.uniforms.uOpacity.value = grabMix * 0.95;
    renderer.render(scene, camera);
  }

  function stats() {
    return {
      particles: FIELD.COUNT,
      grabbed: FIELD.GRAB_COUNT,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles
    };
  }

  return { THREE, apply, render, resize, stats, setGrab, camera, renderer, scene, dispose() { renderer.dispose(); } };
}
