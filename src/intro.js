/* =====================================================================
   kAIRO — animación de entrada: un tenis que se arma pieza por pieza.
   Three.js dibuja el tenis en 3D y GSAP coordina la animación.

   Este archivo es el código fuente. La tienda usa la versión empaquetada
   y minificada en public/js/intro.js. Para regenerarla después de editar:
       npm run build:intro
   ===================================================================== */
import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, Mesh, Shape, ExtrudeGeometry,
  CylinderGeometry, TubeGeometry, CatmullRomCurve3, Vector3, PlaneGeometry,
  MeshStandardMaterial, MeshBasicMaterial, HemisphereLight, DirectionalLight,
  CanvasTexture, SRGBColorSpace, ACESFilmicToneMapping, Color, TorusGeometry
} from 'three';
import { gsap } from 'gsap';

const root = document.getElementById('intro');
const canvas = document.getElementById('introCanvas');
const finish = window.__kairoIntroDone || (() => root && root.remove());

function start() {
  window.__kairoIntroStarted = true;
  /* ---------- escena ---------- */
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0.6, 2.4, 10.5);
  camera.lookAt(0, -0.35, 0); // mirar un poco más abajo deja el tenis arriba y el nombre debajo

  scene.add(new HemisphereLight(0xe9fff4, 0x0a2a20, 1.4));
  const key = new DirectionalLight(0xffffff, 2.4); key.position.set(4, 6, 5); scene.add(key);
  const rim = new DirectionalLight(0x46d99a, 2.2); rim.position.set(-5, 2.5, -4); scene.add(rim);
  const fill = new DirectionalLight(0xbfe9d4, 0.7); fill.position.set(-3, 1, 6); scene.add(fill);

  /* ---------- materiales ---------- */
  const mat = (color, rough = 0.6, metal = 0) => new MeshStandardMaterial({ color: new Color(color), roughness: rough, metalness: metal, transparent: true });
  const M = {
    outsole: mat('#0e4d38', 0.85),
    midsole: mat('#ffffff', 0.45),
    upper: mat('#eef3f0', 0.7),
    toe: mat('#d9e3dd', 0.6),
    heel: mat('#46d99a', 0.4),
    tongue: mat('#0e4d38', 0.7),
    lace: mat('#0a2a20', 0.5),
    stripe: mat('#1f9e6b', 0.35),
    eyelet: mat('#c9d6cf', 0.3, 0.6)
  };

  /* ---------- piezas del tenis (diseño propio de kAIRO) ---------- */
  const shoe = new Group();
  scene.add(shoe);
  const W = 1.3; // ancho del tenis

  // Silueta lateral → volumen con bordes redondeados
  function sidePiece(points, depth, bevel, material) {
    const s = new Shape();
    s.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      if (p.length === 4) s.quadraticCurveTo(p[0], p[1], p[2], p[3]); else s.lineTo(p[0], p[1]);
    }
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 18 });
    g.translate(0, 0, -depth / 2);
    return new Mesh(g, material);
  }
  // Huella (vista desde arriba) → suela
  function soleShape(len, wid) {
    const s = new Shape();
    const h = len / 2;
    s.moveTo(-h, 0);
    s.bezierCurveTo(-h, wid * 0.62, -h * 0.35, wid * 0.55, 0, wid * 0.47);
    s.bezierCurveTo(h * 0.55, wid * 0.42, h * 0.75, wid * 0.62, h, wid * 0.32);
    s.bezierCurveTo(h * 1.04, 0, h * 1.04, 0, h, -wid * 0.3);
    s.bezierCurveTo(h * 0.75, -wid * 0.6, h * 0.55, -wid * 0.45, 0, -wid * 0.47);
    s.bezierCurveTo(-h * 0.35, -wid * 0.55, -h, -wid * 0.62, -h, 0);
    return s;
  }
  function soleLayer(len, wid, thick, y, material, bevel) {
    const g = new ExtrudeGeometry(soleShape(len, wid), { depth: thick, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 24 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    return new Mesh(g, material);
  }

  const outsole = soleLayer(4.35, 1.62, 0.12, -0.06, M.outsole, 0.05);
  const midsole = soleLayer(4.25, 1.56, 0.34, 0.08, M.midsole, 0.08);
  const upper = sidePiece([
    [-2.0, 0.42], [-2.12, 0.95, -2.02, 1.4], [-1.85, 1.62, -1.5, 1.55], [-1.05, 1.42, -0.62, 1.28],
    [0.1, 1.1, 0.75, 0.95], [1.45, 0.78, 1.92, 0.62], [2.12, 0.5, 2.02, 0.42], [-2.0, 0.42]
  ], W - 0.28, 0.14, M.upper);
  const toeCap = sidePiece([
    [1.15, 0.42], [1.3, 0.82, 1.62, 0.72], [1.98, 0.6, 2.1, 0.5], [2.14, 0.42, 2.0, 0.4], [1.15, 0.42]
  ], W - 0.2, 0.12, M.toe);
  const heelCounter = sidePiece([
    [-2.08, 0.42], [-2.2, 0.9, -2.05, 1.22], [-1.75, 1.18, -1.45, 0.82], [-1.25, 0.5, -1.1, 0.42], [-2.08, 0.42]
  ], W - 0.16, 0.1, M.heel);
  const tongue = sidePiece([
    [-1.0, 1.1], [-1.15, 1.7, -0.85, 1.86], [-0.55, 1.9, -0.35, 1.68], [-0.05, 1.2, 0.35, 1.0], [-1.0, 1.1]
  ], 0.62, 0.1, M.tongue);
  tongue.position.y = 0.04;

  // Cordones: atraviesan el empeine siguiendo la curva de la capellada
  const laces = new Group();
  // Altura del empeine en cada cordón (+ el borde redondeado de la capellada)
  const lacePts = [[-0.8, 1.5], [-0.45, 1.4], [-0.1, 1.3], [0.25, 1.2], [0.6, 1.11]];
  lacePts.forEach(([x, y]) => {
    const l = new Mesh(new CylinderGeometry(0.055, 0.055, W - 0.2, 12), M.lace);
    l.rotation.x = Math.PI / 2;
    l.rotation.z = 0.32;
    l.position.set(x, y + 0.12, 0);
    laces.add(l);
  });
  // Ojales metálicos a cada lado
  const eyelets = new Group();
  lacePts.forEach(([x, y]) => [-1, 1].forEach(side => {
    const e = new Mesh(new TorusGeometry(0.06, 0.022, 8, 18), M.eyelet);
    e.position.set(x, y - 0.02, side * (W / 2 + 0.005));
    e.rotation.y = 0;
    eyelets.add(e);
  }));

  // Franja lateral kAIRO: una ola que va del talón a la puntera (se "dibuja" en la animación)
  function stripe(side) {
    const z = side * (W / 2 + 0.035);
    const curve = new CatmullRomCurve3([
      new Vector3(-1.75, 0.62, z), new Vector3(-1.1, 0.95, z), new Vector3(-0.35, 0.7, z),
      new Vector3(0.35, 0.58, z * 0.98), new Vector3(1.0, 0.72, z * 0.94), new Vector3(1.45, 0.58, z * 0.9)
    ]);
    const g = new TubeGeometry(curve, 90, 0.07, 10, false);
    const m = new Mesh(g, M.stripe);
    g.setDrawRange(0, 0);
    return m;
  }
  const stripeL = stripe(1), stripeR = stripe(-1);

  // Sombra suave bajo el tenis
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const sctx = sc.getContext('2d');
  const grd = sctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  sctx.fillStyle = grd; sctx.fillRect(0, 0, 128, 128);
  const shadow = new Mesh(new PlaneGeometry(6, 2.2), new MeshBasicMaterial({ map: new CanvasTexture(sc), transparent: true, depthWrite: false, opacity: 0 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.2;
  scene.add(shadow);

  [outsole, midsole, upper, toeCap, heelCounter, tongue, laces, eyelets, stripeL, stripeR].forEach(p => shoe.add(p));
  shoe.rotation.set(0.08, -0.55, 0);

  /* ---------- tamaño ---------- */
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // En pantallas angostas (celular vertical) alejamos la cámara para que el tenis quepa completo
    const ar = w / h;
    camera.position.z = ar < 0.6 ? 22 : ar < 0.8 ? 18 : ar < 1.2 ? 13 : 10.5;
    camera.position.y = ar < 0.8 ? 2.8 : 2.4;
    camera.lookAt(0, ar < 0.8 ? -0.9 : -0.35, 0);
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  let alive = true;
  const tick = () => { if (!alive) return; renderer.render(scene, camera); requestAnimationFrame(tick); };
  tick();

  /* ---------- animación: el tenis se arma ---------- */
  [outsole, midsole, upper, toeCap, heelCounter, tongue].forEach(m => { m.material.opacity = 0; });
  laces.children.forEach(l => { l.material.opacity = 0; });
  eyelets.children.forEach(e => { e.scale.setScalar(0); });

  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  const stripeCount = stripeL.geometry.index.count;
  const draw = { v: 0 };

  tl
    // suela: sube desde abajo
    .fromTo(outsole.position, { y: -3 }, { y: 0, duration: 0.7 }, 0.1)
    .to(M.outsole, { opacity: 1, duration: 0.4 }, 0.1)
    .to(shadow.material, { opacity: 0.6, duration: 0.8 }, 0.2)
    // entresuela: cae y rebota sobre la suela
    .fromTo(midsole.position, { y: 3.2 }, { y: 0, duration: 0.75, ease: 'back.out(2.2)' }, 0.45)
    .to(M.midsole, { opacity: 1, duration: 0.3 }, 0.45)
    // capellada: entra girando desde la izquierda
    .fromTo(upper.position, { x: -6, y: 1.2 }, { x: 0, y: 0, duration: 0.85 }, 0.85)
    .fromTo(upper.rotation, { y: -1.4, z: 0.6 }, { y: 0, z: 0, duration: 0.85 }, 0.85)
    .to(M.upper, { opacity: 1, duration: 0.35 }, 0.85)
    // contrafuerte (talón) y puntera, por detrás y por delante
    .fromTo(heelCounter.position, { x: -3.5 }, { x: 0, duration: 0.6, ease: 'back.out(1.6)' }, 1.45)
    .to(M.heel, { opacity: 1, duration: 0.3 }, 1.45)
    .fromTo(toeCap.position, { x: 3.5 }, { x: 0, duration: 0.6, ease: 'back.out(1.6)' }, 1.55)
    .to(M.toe, { opacity: 1, duration: 0.3 }, 1.55)
    // lengüeta: sale hacia arriba
    .fromTo(tongue.position, { y: -1.2 }, { y: 0.04, duration: 0.55, ease: 'back.out(2)' }, 1.85)
    .to(M.tongue, { opacity: 1, duration: 0.25 }, 1.85)
    // ojales
    .to(eyelets.children.map(e => e.scale), { x: 1, y: 1, z: 1, duration: 0.25, stagger: 0.03, ease: 'back.out(3)' }, 2.1)
    // cordones: caen uno por uno
    .from(laces.children.map(l => l.position), { y: '+=1.6', duration: 0.45, stagger: 0.08, ease: 'bounce.out' }, 2.2)
    .to(M.lace, { opacity: 1, duration: 0.2 }, 2.2)
    // franja kAIRO: se dibuja de talón a puntera
    .to(draw, { v: 1, duration: 0.7, ease: 'power2.inOut', onUpdate: () => {
      const n = Math.floor(draw.v * stripeCount / 3) * 3;
      stripeL.geometry.setDrawRange(0, n); stripeR.geometry.setDrawRange(0, n);
    } }, 2.65)
    // el tenis gira para lucirse
    .to(shoe.rotation, { y: 0.55, x: 0.14, duration: 2.6, ease: 'power2.inOut' }, 1.2)
    .to(shoe.position, { y: 0.25, duration: 0.6, ease: 'power2.out' }, 3.1)
    .to(shoe.position, { y: 0, duration: 0.5, ease: 'power2.in' }, 3.7)
    // nombre kAIRO
    .fromTo('#intro .intro__word span', { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.55, stagger: 0.06, ease: 'power4.out' }, 2.9)
    .fromTo('#intro .intro__tag', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5 }, 3.35)
    // salida: el tenis sale disparado y la cortina sube
    .to(shoe.position, { x: 9, duration: 0.6, ease: 'power3.in' }, 4.25)
    .to(shoe.rotation, { z: -0.25, duration: 0.6, ease: 'power3.in' }, 4.25)
    .to(shadow.material, { opacity: 0, duration: 0.3 }, 4.3)
    .to('#intro .intro__brand', { opacity: 0, y: -20, duration: 0.4, ease: 'power2.in' }, 4.35)
    .to(root, { yPercent: -100, duration: 0.7, ease: 'power4.inOut' }, 4.6)
    .add(end);

  let ended = false;
  function end() {
    if (ended) return; ended = true;
    alive = false;
    window.removeEventListener('resize', resize);
    renderer.dispose();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    finish();
  }
  // "Saltar intro": acelera hasta la salida
  const skip = document.getElementById('introSkip');
  if (skip) skip.addEventListener('click', () => { tl.timeScale(1); tl.seek(4.2); });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { tl.seek(4.2); document.removeEventListener('keydown', onKey); }
  });
  // Si la pestaña queda oculta, no tiene sentido seguir: se termina directo
  document.addEventListener('visibilitychange', () => { if (document.hidden) { tl.progress(1); end(); } });
}

try {
  if (!root || !canvas) throw new Error('sin intro');
  // Sin WebGL (equipos muy viejos) no hay intro
  const test = document.createElement('canvas');
  if (!(test.getContext('webgl2') || test.getContext('webgl'))) throw new Error('sin webgl');
  start();
} catch (e) {
  finish();
}
