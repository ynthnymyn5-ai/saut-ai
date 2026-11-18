// Tickmarkin — 3D hero scene (WebGL via three.js, vendored locally).
// Falls back to the SVG scene when WebGL is unavailable or the visitor prefers reduced motion.
import * as THREE from './vendor/three.module.min.js';

const visual = document.querySelector('.hero-visual');
const stage = visual?.querySelector('.hero-stage');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

if (stage && !reduce && webglOK()) start().catch((e) => console.warn('[3d] disabled:', e.message));

async function start() {
  try { await document.fonts?.ready; } catch {}

  const BRAND = 0x5a3df0, BLUE = 0x4466ff, PURPLE = 0x7c2fe0, GOLD = 0xffb020, ORANGE = 0xff7a2f;

  // ---------- renderer / camera ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const canvas = renderer.domElement;
  canvas.className = 'hero3d';
  canvas.setAttribute('aria-hidden', 'true');
  stage.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0.4, 10.5);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xc9d0ff, 0x1a1040, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 6, 6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(PURPLE, 2.4);
  rim.position.set(-6, 2, -4);
  scene.add(rim);
  const goldLight = new THREE.PointLight(GOLD, 18, 9, 2);
  goldLight.position.set(1.2, 1.4, 2);
  scene.add(goldLight);

  const world = new THREE.Group();
  scene.add(world);

  // ---------- helpers ----------
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };

  // ---------- open book ----------
  const pageTex = canvasTex(512, 640, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#e6e9ff');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(90,61,240,.28)'; g.lineWidth = 10; g.lineCap = 'round';
    for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(70, 120 + i * 62); g.lineTo(w - 70 - (i % 3) * 40, 120 + i * 62); g.stroke(); }
  });
  function pageGeometry(flip) {
    const W = 2.1, H = 2.7, geo = new THREE.PlaneGeometry(W, H, 24, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + W / 2;            // 0..W from spine
      const z = Math.sin((x / W) * Math.PI * 0.9) * 0.32;
      pos.setXYZ(i, (flip ? -1 : 1) * x, pos.getY(i), z);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const pageMat = new THREE.MeshStandardMaterial({ map: pageTex, roughness: 0.55, metalness: 0, side: THREE.DoubleSide });
  const book = new THREE.Group();
  const right = new THREE.Mesh(pageGeometry(false), pageMat);
  const left = new THREE.Mesh(pageGeometry(true), pageMat);
  const cover = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.95, 0.12), new THREE.MeshStandardMaterial({ color: BRAND, roughness: 0.35, metalness: 0.25 }));
  cover.position.z = -0.1;
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 16), new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.6 }));
  spine.position.z = 0.02;
  // flipping page pivots around the spine
  const flipPivot = new THREE.Group();
  const flipPage = new THREE.Mesh(pageGeometry(false), new THREE.MeshStandardMaterial({ color: 0xeef0ff, roughness: 0.6, side: THREE.DoubleSide }));
  flipPage.position.z = 0.015;
  flipPivot.add(flipPage);
  book.add(cover, left, right, spine, flipPivot);
  book.rotation.x = -1.05;
  book.position.set(0, -1.55, 0);
  world.add(book);

  // ---------- 3D check mark (tube that draws itself) ----------
  const path = new THREE.CurvePath();
  const p0 = new THREE.Vector3(-1.05, 0.55, 0.6), p1 = new THREE.Vector3(-0.3, -0.2, 0.6), p2 = new THREE.Vector3(1.25, 1.55, 0.6);
  path.add(new THREE.LineCurve3(p0, p1));
  path.add(new THREE.LineCurve3(p1, p2));
  const tubeGeo = new THREE.TubeGeometry(path, 160, 0.17, 20, false);
  const checkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x6d5cff, emissiveIntensity: 0.25, roughness: 0.2, metalness: 0.15 });
  const check = new THREE.Mesh(tubeGeo, checkMat);
  const capA = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), checkMat);
  const capB = capA.clone();
  capA.position.copy(p0); capB.position.copy(p2);
  capB.visible = false;
  const checkGroup = new THREE.Group();
  checkGroup.add(check, capA, capB);
  checkGroup.position.y = 0.35;
  world.add(checkGroup);
  const tubeIndexCount = tubeGeo.index.count;
  tubeGeo.setDrawRange(0, 0);

  // glow behind the check
  const glowTex = canvasTex(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,190,70,.9)'); r.addColorStop(0.4, 'rgba(255,150,40,.35)'); r.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glow.scale.set(4.2, 4.2, 1);
  glow.position.set(0.1, 0.9, 0.2);
  world.add(glow);

  // gold orb (the logo's dot)
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 24), new THREE.MeshStandardMaterial({ color: GOLD, emissive: ORANGE, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.5 }));
  orb.position.set(1.75, 2.2, 0.6);
  orb.scale.setScalar(0.001);
  world.add(orb);

  // ---------- graduation cap ----------
  const cap = new THREE.Group();
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2b2470, roughness: 0.45, metalness: 0.2 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.07, 1.25), new THREE.MeshStandardMaterial({ color: BLUE, roughness: 0.35, metalness: 0.3 }));
  board.rotation.y = Math.PI / 4;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.42, 32), capMat);
  crown.position.y = -0.24;
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.6, roughness: 0.3 }));
  button.position.y = 0.06;
  const tassel = new THREE.Group();
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.5, roughness: 0.35 }));
  cord.position.set(0, -0.3, 0);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 12), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.5, roughness: 0.35 }));
  tip.position.set(0, -0.66, 0);
  tassel.add(cord, tip);
  tassel.position.set(0.6, 0.04, 0);
  cap.add(board, crown, button, tassel);
  cap.position.set(-2.35, 1.95, -0.6);
  cap.rotation.set(0.35, 0.4, -0.18);
  world.add(cap);

  // ---------- floating letters (always face the camera) ----------
  const glyphs = ['أ', 'A', 'π', '∑', 'ب', '★', '٣', '+'];
  const letters = glyphs.map((ch, i) => {
    const tex = canvasTex(256, 256, (g, w) => {
      g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 10, 0, Math.PI * 2);
      g.fillStyle = ch === '★' ? 'rgba(255,176,32,.25)' : 'rgba(255,255,255,.12)'; g.fill();
      g.lineWidth = 6; g.strokeStyle = ch === '★' ? 'rgba(255,190,70,.9)' : 'rgba(255,255,255,.55)'; g.stroke();
      g.fillStyle = ch === '★' ? '#ffc94d' : '#ffffff';
      g.font = '700 130px Alexandria, Tajawal, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, w / 2, w / 2 + 8);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.setScalar(0.62);
    s.userData = { angle: (i / glyphs.length) * Math.PI * 2, radius: 2.75 + (i % 2) * 0.3, y: -0.6 + (i % 4) * 0.75, speed: 0.18 + (i % 3) * 0.03 };
    world.add(s);
    return s;
  });

  // ---------- low-poly gems ----------
  const gems = [
    [new THREE.IcosahedronGeometry(0.32, 0), BLUE, [2.75, -0.4, -1.2]],
    [new THREE.OctahedronGeometry(0.28, 0), GOLD, [-2.9, -0.9, -0.4]],
    [new THREE.TorusGeometry(0.26, 0.09, 12, 32), PURPLE, [2.3, 2.5, -1.5]],
    [new THREE.TetrahedronGeometry(0.3, 0), 0x0bb5c4, [-1.4, 2.9, -1.8]],
  ].map(([geo, color, pos], i) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.35, flatShading: true }));
    m.position.set(...pos);
    m.userData = { base: m.position.y, phase: i * 1.7 };
    world.add(m);
    return m;
  });

  // ---------- particles ----------
  const N = 260, pts = new Float32Array(N * 3), cols = new Float32Array(N * 3);
  const cGold = new THREE.Color(GOLD), cWhite = new THREE.Color(0xffffff), cBlue = new THREE.Color(0x9fb0ff);
  for (let i = 0; i < N; i++) {
    const r = 3 + Math.random() * 3.2, a = Math.random() * Math.PI * 2, y = (Math.random() - 0.5) * 6;
    pts.set([Math.cos(a) * r, y, Math.sin(a) * r - 1.5], i * 3);
    const c = [cGold, cWhite, cBlue][i % 3];
    cols.set([c.r, c.g, c.b], i * 3);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  world.add(particles);

  // ---------- sizing ----------
  function resize() {
    const w = stage.clientWidth || 520;
    const h = Math.round(w * (500 / 520));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w < 420 ? 12 : 10.5;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  // ---------- interaction: pointer parallax ----------
  const target = { x: 0, y: 0 };
  const hero = document.querySelector('.hero');
  hero?.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  hero?.addEventListener('pointerleave', () => { target.x = 0; target.y = 0; });

  // ---------- render loop (paused when off-screen or tab hidden) ----------
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) tick(); }, { threshold: 0 }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  const clock = new THREE.Clock();
  const t0 = performance.now();
  let raf = 0, shown = false;
  const ease = (k) => 1 - Math.pow(1 - Math.min(Math.max(k, 0), 1), 3);

  function tick() {
    cancelAnimationFrame(raf);
    if (!visible || document.hidden) return;
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    const since = (performance.now() - t0) / 1000;

    // intro: book rises, check draws, orb pops
    const k1 = ease(since / 1.2);
    book.position.y = -1.55 - (1 - k1) * 1.2;
    book.scale.setScalar(0.85 + 0.15 * k1);
    const k2 = ease((since - 0.9) / 1.1);
    tubeGeo.setDrawRange(0, Math.floor(tubeIndexCount * k2 / 3) * 3);
    capB.visible = k2 >= 1;
    glow.material.opacity = k2 * (0.55 + Math.sin(t * 2.2) * 0.2);
    const k3 = ease((since - 1.9) / 0.6);
    orb.scale.setScalar(Math.max(0.001, k3 * (1 + Math.sin(t * 2.6) * 0.12)));

    // page flip every 5s
    const cycle = (t % 5) / 5;
    const f = cycle < 0.35 ? 0 : cycle < 0.7 ? (cycle - 0.35) / 0.35 : 1;
    flipPivot.rotation.y = -Math.PI * (f < 1 ? f * f * (3 - 2 * f) : 1) * (cycle > 0.95 ? 0 : 1);

    // idle motion
    checkGroup.position.y = 0.35 + Math.sin(t * 1.3) * 0.08;
    checkGroup.rotation.y = Math.sin(t * 0.6) * 0.25;
    cap.position.y = 1.95 + Math.sin(t * 1.1) * 0.16;
    cap.rotation.y = 0.4 + t * 0.5;
    tassel.rotation.z = Math.sin(t * 2.2) * 0.35;
    for (const s of letters) {
      const d = s.userData;
      const a = d.angle + t * d.speed;
      s.position.set(Math.cos(a) * d.radius, d.y + Math.sin(t + d.angle) * 0.15, Math.sin(a) * d.radius * 0.55 - 0.6);
      s.material.opacity = 0.55 + 0.45 * ((Math.sin(a) + 1) / 2); // dimmer when behind
    }
    for (const g of gems) {
      g.rotation.x += 0.006; g.rotation.y += 0.009;
      g.position.y = g.userData.base + Math.sin(t * 0.9 + g.userData.phase) * 0.22;
    }
    particles.rotation.y = t * 0.04;

    // camera parallax toward pointer
    world.rotation.y += ((target.x * 0.35) - world.rotation.y) * 0.05;
    world.rotation.x += ((target.y * 0.18) - world.rotation.x) * 0.05;
    camera.lookAt(0, 0.2, 0);

    renderer.render(scene, camera);
    if (!shown) { shown = true; visual.classList.add('has-3d'); }
  }
  tick();
}
