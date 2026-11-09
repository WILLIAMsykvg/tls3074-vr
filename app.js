import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const ROLE = document.body.dataset.role === 'screen' ? 'screen' : 'headset';
const query = new URLSearchParams(location.search);
const ROOM = (query.get('room') || '').replace(/[^-_A-Za-z0-9]/g, '').slice(0, 60) || 'tls3074-g7-r8k2vq';
const RELAY = 'https://ntfy.sh/' + ROOM;
const APP_TAG = 'tls3074g7';
const MY_ID = Math.random().toString(36).slice(2, 10);
const POSE_TOPIC = `tls3074g7/${ROOM}/pose`;
// broker.emqx.io drops messages above roughly 5 per second, so it only carries a slower backup copy.
const BROKERS = [
  { name: 'cn', url: 'wss://broker-cn.emqx.io:8084/mqtt', every: 1 },
  { name: 'global', url: 'wss://broker.emqx.io:8084/mqtt', every: 3 },
];
const POSE_HZ = 12;
const BUFFER_MS = 90;
const FONT = 'system-ui, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif';

const HEX = { B: 0x2563eb, I: 0xf97316, F: 0xdc2626 };
const CSS = { B: '#2563eb', I: '#ea580c', F: '#dc2626' };

// c: current, +1 = up the page. b: field, +1 = into the page. Force points left when c * b = +1.
const STEPS = [
  {
    mode: 'flat', c: 1, b: 1,
    title: 'STEP 1 / 4  ·  THE EXAM DIAGRAM',
    main: 'The current is switched on. Which way does the rod move?',
    sub: 'A  Left   ·   B  Right   ·   C  Into the page   ·   D  Up the page',
    sub2: 'Top view. Each × is the magnetic field B going into the page. I is the current in the rod.',
  },
  {
    mode: '3d', c: 1, b: 1,
    title: 'STEP 2 / 4  ·  SEE IT IN 3D',
    main: 'Each × was the tail of an arrow going INTO the page.',
    sub: 'Blue B points down  ·  orange I runs up the page  ·  red F points LEFT',
    sub2: 'Lean over and look straight down: the blue arrows turn back into ×.',
  },
  {
    mode: '3d', c: -1, b: 1,
    title: 'STEP 3 / 4  ·  FLIP ONE THING AT A TIME  (1 of 3)',
    main: 'Reverse the current I: the force reverses.',
    sub: 'Red F now points RIGHT, so the rod moves right.',
    sub2: 'Watch + and − swap on the cell.',
  },
  {
    mode: '3d', c: -1, b: -1,
    title: 'STEP 3 / 4  ·  FLIP ONE THING AT A TIME  (2 of 3)',
    main: 'Now reverse the field B as well: the force reverses again.',
    sub: 'Red F points LEFT.  On the page, every × has become •.',
    sub2: 'Why left again? Keep that question. We will ask you at the end.',
  },
  {
    mode: '3d', c: 1, b: -1,
    title: 'STEP 3 / 4  ·  FLIP ONE THING AT A TIME  (3 of 3)',
    main: 'Put the current back. Only the field is reversed now.',
    sub: 'Red F points RIGHT.',
    sub2: 'Field out of the page (•), current up the page.',
  },
  {
    mode: 'rule', c: 1, b: 1,
    title: 'STEP 4 / 4  ·  BACK TO THE PAGE',
    main: "Fleming's LEFT-hand rule packs this 3D picture into one hand.",
    sub: 'First\u00a0finger\u00a0=\u00a0Field\u00a0(B)  ·  seCond\u00a0finger\u00a0=\u00a0Current\u00a0(I)  ·  thuMb\u00a0=\u00a0Motion\u00a0(F)',
    sub2: 'F = BIl sin θ.  The rod is at right angles to B, so θ = 90° and F = BIl.',
  },
];
const GROUP_OF = [0, 1, 2, 2, 2, 3];

const PRESETS = {
  flat: { pos: [0, 1.2, 0.3], tgt: [0, 0, 0.09] },
  '3d': { pos: [0.5, 0.78, 1.18], tgt: [0, 0.02, 0.13] },
  rule: { pos: [0.42, 0.58, 0.86], tgt: [0, 0.07, 0.08] },
};

const PW = 0.9, PD = 0.62, PPM = 2000;
const RZ = 0.2;
const BAT_X = -0.38;
const FX = [-0.31, -0.2, -0.1, 0.1, 0.2, 0.31];
const FZ = [-0.27, -0.1, 0.1, 0.27];
const RAIL_R = 0.008, ROD_R = 0.011, ROD_Y = 2 * RAIL_R + ROD_R;
const ROD_SLIDE = 0.065;
const B_TOP = 0.19, B_BOT = 0.012, B_LEN = B_TOP - B_BOT;
const SYMBOL_FONT = 'italic 700 72px Georgia, "Times New Roman", serif';
const DESK_H = 0.74;

const $ = (id) => document.getElementById(id);

// ---------- renderer, camera, scene ----------

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.prepend(renderer.domElement);
if (ROLE === 'headset') {
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  renderer.xr.setFramebufferScaleFactor(1.2);
  renderer.xr.setFoveation(0.3);
}
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.01, 60);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.3;
controls.maxDistance = 3.5;
controls.maxPolarAngle = 1.5;

scene.add(new THREE.HemisphereLight(0xe0f2fe, 0x0f172a, 1.15));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(0.8, 2.4, 1.4);
scene.add(sun);

const floor = new THREE.GridHelper(14, 56, 0x334155, 0x1e293b);
scene.add(floor);

const rig = new THREE.Group();
scene.add(rig);

const table = new THREE.Mesh(
  new THREE.BoxGeometry(1.02, 0.04, 0.74),
  new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 }),
);
table.position.y = -0.0205;
rig.add(table);

const stand = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.07, 1, 24),
  new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }),
);
rig.add(stand);

function setStand(h) {
  stand.visible = h > 0.2;
  stand.scale.y = Math.max(h, 0.001);
  stand.position.y = -0.041 - h / 2;
}

function layout2D() {
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  setStand(DESK_H);
  floor.position.y = -0.041 - DESK_H;
}
layout2D();

// ---------- canvas helpers ----------

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function arrow2D(ctx, x1, y1, x2, y2, color, width, head) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const bx = x2 - Math.cos(a) * head;
  const by = y2 - Math.sin(a) * head;
  const nx = Math.cos(a + Math.PI / 2) * head * 0.55;
  const ny = Math.sin(a + Math.PI / 2) * head * 0.55;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(bx + nx, by + ny);
  ctx.lineTo(bx - nx, by - ny);
  ctx.closePath();
  ctx.fill();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  if (!text) return y;
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (line && ctx.measureText(test).width > maxW) {
      ctx.fillText(line, x, y);
      line = w;
      y += lineH;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, y);
    y += lineH;
  }
  return y;
}

function canvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

// ---------- the exam page ----------

const pcan = document.createElement('canvas');
pcan.width = Math.round(PW * PPM);
pcan.height = Math.round(PD * PPM);
const pctx = pcan.getContext('2d');
const paperTex = canvasTexture(pcan);
const paper = new THREE.Mesh(new THREE.PlaneGeometry(PW, PD), new THREE.MeshBasicMaterial({ map: paperTex }));
paper.rotation.x = -Math.PI / 2;
paper.position.y = 0.0006;
rig.add(paper);

function drawPaper(st) {
  const ctx = pctx;
  const X = (x) => (x + PW / 2) * PPM;
  const Y = (z) => (z + PD / 2) * PPM;

  ctx.fillStyle = '#fbfaf6';
  ctx.fillRect(0, 0, pcan.width, pcan.height);
  ctx.strokeStyle = '#d8d4ca';
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, pcan.width - 36, pcan.height - 36);

  ctx.strokeStyle = CSS.B;
  ctx.fillStyle = CSS.B;
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  for (const z of FZ) {
    for (const x of FX) {
      const cx = X(x), cy = Y(z);
      ctx.beginPath();
      if (st.b > 0) {
        ctx.moveTo(cx - 24, cy - 24);
        ctx.lineTo(cx + 24, cy + 24);
        ctx.moveTo(cx + 24, cy - 24);
        ctx.lineTo(cx - 24, cy + 24);
        ctx.stroke();
      } else {
        ctx.arc(cx, cy, 15, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.strokeStyle = '#475569';
  ctx.lineCap = 'butt';
  ctx.lineWidth = 18;
  for (const z of [-RZ, RZ]) {
    ctx.beginPath();
    ctx.moveTo(X(BAT_X) - 6, Y(z));
    ctx.lineTo(X(0.43), Y(z));
    ctx.stroke();
  }

  const bx = X(BAT_X);
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(bx, Y(-RZ));
  ctx.lineTo(bx, Y(-0.02));
  ctx.moveTo(bx, Y(0.02));
  ctx.lineTo(bx, Y(RZ));
  ctx.stroke();

  // The long (+) plate sits on the side of the rail the current leaves from.
  const pz = st.c > 0 ? 0.02 : -0.02;
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(bx - 64, Y(pz));
  ctx.lineTo(bx + 64, Y(pz));
  ctx.stroke();
  ctx.lineWidth = 18;
  ctx.beginPath();
  ctx.moveTo(bx - 32, Y(-pz));
  ctx.lineTo(bx + 32, Y(-pz));
  ctx.stroke();
  ctx.fillStyle = '#111827';
  ctx.font = `800 60px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const off = pz > 0 ? 40 : -40;
  ctx.fillText('+', bx - 92, Y(pz) + off);
  ctx.fillText('−', bx - 92, Y(-pz) - off);

  if (st.mode !== '3d') {
    ctx.strokeStyle = '#b45309';
    ctx.lineCap = 'round';
    ctx.lineWidth = 24;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(-0.215));
    ctx.lineTo(X(0), Y(0.215));
    ctx.stroke();

    arrow2D(ctx, X(0.036), Y(0.11 * st.c), X(0.036), Y(-0.11 * st.c), CSS.I, 12, 44);
    ctx.fillStyle = CSS.I;
    ctx.font = SYMBOL_FONT;
    ctx.fillText('I', X(0.07), Y(0));

    if (st.mode === 'rule') {
      const s = st.c * st.b;
      arrow2D(ctx, X(-0.016 * s), Y(0), X(-0.17 * s), Y(0), CSS.F, 15, 52);
      ctx.fillStyle = CSS.F;
      ctx.fillText('F', X(-0.2 * s), Y(-0.04));
    }
  }
  paperTex.needsUpdate = true;
}

// ---------- 3D parts ----------

const geoCache = new Map();
function cylGeo(r, h) {
  const k = `c${r}_${h}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.CylinderGeometry(r, r, h, 14));
  return geoCache.get(k);
}
function coneGeo(r, h) {
  const k = `k${r}_${h}`;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.ConeGeometry(r, h, 20));
  return geoCache.get(k);
}
function glowMat(hex, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color: hex, emissive: hex, emissiveIntensity: 0.3, roughness: 0.5,
    transparent: opacity < 1, opacity,
  });
}

// An arrow along local +y with its tail at the origin. The inner group is scaled to grow or shrink it.
function makeArrow(mat, len, shaftR, headR, headLen) {
  const sl = len - headLen;
  const shaft = new THREE.Mesh(cylGeo(shaftR, sl), mat);
  shaft.position.y = sl / 2;
  const head = new THREE.Mesh(coneGeo(headR, headLen), mat);
  head.position.y = sl + headLen / 2;
  const inner = new THREE.Group();
  inner.add(shaft, head);
  const outer = new THREE.Group();
  outer.add(inner);
  outer.userData.inner = inner;
  outer.visible = false;
  return outer;
}

class Anim {
  constructor(obj, len, orient, opts = {}) {
    this.obj = obj;
    this.len = len;
    this.orient = orient;
    this.sinkTip = opts.sinkTip || null;
    this.dir = 1;
    this.want = 1;
    this.show = false;
    this.g = 0;
    this.delayUntil = 0;
    orient(obj, 1);
    this.apply(false);
  }

  update(dt, now) {
    const flipping = this.want !== this.dir;
    const target = this.show && !flipping && now >= this.delayUntil ? 1 : 0;
    const shrinking = target < this.g - 1e-4;
    this.g += (target - this.g) * (1 - Math.exp(-(shrinking ? 12 : 6.5) * dt));
    if (flipping && this.g < 0.03) {
      this.dir = this.want;
      this.orient(this.obj, this.dir);
      this.g = 0;
    }
    this.apply(shrinking);
  }

  apply(shrinking) {
    const g = Math.max(this.g, 1e-4);
    const inner = this.obj.userData.inner;
    inner.scale.y = g;
    inner.position.y = shrinking && this.sinkTip && this.sinkTip(this.dir) ? (1 - g) * this.len : 0;
    this.obj.visible = this.g > 0.012;
  }

  snap() {
    if (this.want !== this.dir) {
      this.dir = this.want;
      this.orient(this.obj, this.dir);
    }
    this.g = this.show ? 1 : 0;
    this.apply(false);
  }
}

const metal = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.3, transparent: true, opacity: 0 });
const copper = new THREE.MeshStandardMaterial({ color: 0xb87333, metalness: 0.55, roughness: 0.32, transparent: true, opacity: 0 });
const structMeshes = [];

const railGeo = new THREE.CylinderGeometry(RAIL_R, RAIL_R, 0.81, 20);
railGeo.rotateZ(Math.PI / 2);
for (const z of [-RZ, RZ]) {
  const rail = new THREE.Mesh(railGeo, metal);
  rail.position.set(0.025, RAIL_R, z);
  rail.visible = false;
  rig.add(rail);
  structMeshes.push(rail);
}

const rodGroup = new THREE.Group();
rig.add(rodGroup);
const rodGeo = new THREE.CylinderGeometry(ROD_R, ROD_R, 0.45, 24);
rodGeo.rotateX(Math.PI / 2);
const rod = new THREE.Mesh(rodGeo, copper);
rod.position.y = ROD_Y;
rod.visible = false;
rodGroup.add(rod);
structMeshes.push(rod);

const bMat = glowMat(HEX.B, 0.9);
const bAnims = [];
for (const z of FZ) {
  for (const x of FX) {
    const a = makeArrow(bMat, B_LEN, 0.0045, 0.012, 0.03);
    rig.add(a);
    const orient = (o, d) => {
      if (d > 0) {
        o.position.set(x, B_TOP, z);
        o.rotation.set(Math.PI, 0, 0);
      } else {
        o.position.set(x, B_BOT, z);
        o.rotation.set(0, 0, 0);
      }
    };
    bAnims.push(new Anim(a, B_LEN, orient, { sinkTip: (d) => d > 0 }));
  }
}

const I_LEN = 0.26;
const iArrow = makeArrow(glowMat(HEX.I), I_LEN, 0.007, 0.018, 0.045);
rodGroup.add(iArrow);
const iAnim = new Anim(iArrow, I_LEN, (o, c) => {
  o.position.set(0, ROD_Y + 0.031, 0.13 * c);
  o.rotation.set((-Math.PI / 2) * c, 0, 0);
});

const F_LEN = 0.19;
const fArrow = makeArrow(glowMat(HEX.F), F_LEN, 0.009, 0.022, 0.05);
rodGroup.add(fArrow);
const fAnim = new Anim(fArrow, F_LEN, (o, s) => {
  o.position.set(0, ROD_Y, 0);
  o.rotation.set(0, 0, (Math.PI / 2) * s);
});

const triad = new THREE.Group();
triad.position.set(0, 0.155, 0);
rig.add(triad);
const palm = new THREE.Mesh(new THREE.SphereGeometry(0.013, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 }));
palm.visible = false;
triad.add(palm);
const tField = makeArrow(glowMat(HEX.B), 0.125, 0.0065, 0.016, 0.035);
const tCurrent = makeArrow(glowMat(HEX.I), 0.15, 0.0065, 0.016, 0.035);
const tMotion = makeArrow(glowMat(HEX.F), 0.15, 0.0065, 0.016, 0.035);
triad.add(tField, tCurrent, tMotion);
const triadAnims = [
  new Anim(tField, 0.125, (o) => o.rotation.set(Math.PI, 0, 0)),
  new Anim(tCurrent, 0.15, (o) => o.rotation.set(-Math.PI / 2, 0, 0)),
  new Anim(tMotion, 0.15, (o) => o.rotation.set(0, 0, Math.PI / 2)),
];

const allAnims = [...bAnims, iAnim, fAnim, ...triadAnims];

function makeLabel(text, bg, h = 0.032) {
  const fs = 64, pad = 30, hh = 104;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `800 ${fs}px ${FONT}`;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hh;
  const ctx = c.getContext('2d');
  roundRect(ctx, 3, 3, w - 6, hh - 6, 30);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.font = `800 ${fs}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, hh / 2 + 3);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTexture(c), depthTest: false, transparent: true }));
  sp.scale.set((h * w) / hh, h, 1);
  sp.renderOrder = 20;
  sp.visible = false;
  return sp;
}

const bLabel = makeLabel('B  field', CSS.B);
bLabel.position.set(0.31, B_TOP + 0.04, -0.27);
rig.add(bLabel);
const iLabel = makeLabel('I  current', CSS.I);
rodGroup.add(iLabel);
const fLabel = makeLabel('F  force', CSS.F);
rodGroup.add(fLabel);

const triadLabels = [
  makeLabel('First finger: Field', CSS.B, 0.026),
  makeLabel('seCond finger: Current', CSS.I, 0.026),
  makeLabel('thuMb: Motion', CSS.F, 0.026),
];
triadLabels[0].position.set(0, -0.07, 0.075);
triadLabels[1].position.set(0, 0.035, -0.21);
triadLabels[2].position.set(-0.21, 0.035, 0);
triad.add(...triadLabels);

// ---------- the board that only the headset wearer sees ----------

const BCW = 1720, BCH = 680;
const bcan = document.createElement('canvas');
bcan.width = BCW;
bcan.height = BCH;
const bctx = bcan.getContext('2d');
const boardTex = canvasTexture(bcan);
const BOARD_W = 0.88;
const board = new THREE.Mesh(
  new THREE.PlaneGeometry(BOARD_W, (BOARD_W * BCH) / BCW),
  new THREE.MeshBasicMaterial({ map: boardTex, transparent: true }),
);
board.position.set(0, 0.45, -0.44);
board.rotation.x = -0.08;
board.visible = false;
rig.add(board);

function drawBoard(i) {
  const st = STEPS[i];
  const ctx = bctx;
  ctx.clearRect(0, 0, BCW, BCH);
  roundRect(ctx, 6, 6, BCW - 12, BCH - 12, 40);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const maxW = BCW - 112;
  let y = 78;
  ctx.fillStyle = '#93c5fd';
  ctx.font = `800 40px ${FONT}`;
  ctx.fillText(st.title, 56, y);
  y += 82;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 58px ${FONT}`;
  y = wrapText(ctx, st.main, 56, y, maxW, 68);
  y += 10;
  ctx.fillStyle = '#fde68a';
  ctx.font = `700 44px ${FONT}`;
  y = wrapText(ctx, st.sub, 56, y, maxW, 54);
  y += 4;
  ctx.fillStyle = '#cbd5e1';
  ctx.font = `500 38px ${FONT}`;
  wrapText(ctx, st.sub2, 56, y, maxW, 46);

  const n = 4, gap = 14, bw = (maxW - gap * (n - 1)) / n, cur = GROUP_OF[i];
  for (let g = 0; g < n; g++) {
    ctx.fillStyle = g < cur ? '#60a5fa' : g === cur ? '#fbbf24' : 'rgba(255, 255, 255, 0.18)';
    roundRect(ctx, 56 + g * (bw + gap), BCH - 118, bw, 12, 6);
    ctx.fill();
  }
  ctx.fillStyle = '#a5b4fc';
  ctx.font = `700 36px ${FONT}`;
  const hint = i === STEPS.length - 1
    ? 'Last step. Please take the headset off and pass it back. Thank you!'
    : 'TRIGGER (index finger) or PINCH = next  ·  GRIP = back  ·  A / X = bring the model here';
  ctx.fillText(hint, 56, BCH - 50);
  boardTex.needsUpdate = true;
}

// ---------- step state ----------

let now = 0;
let stepIdx = 0;
let presetName = null;
let structOp = 0, structTarget = 0;
let rodX = 0, rodTarget = 0, rodPlan = null;

function applyStep(i, instant) {
  const st = STEPS[i];
  const show3D = st.mode === '3d';
  const s = st.c * st.b;

  bAnims.forEach((A, k) => {
    A.want = st.b;
    if (show3D && !A.show) A.delayUntil = now + 0.15 + k * 0.03;
    A.show = show3D;
  });

  iAnim.want = st.c;
  if (show3D && !iAnim.show) iAnim.delayUntil = now + 0.5;
  iAnim.show = show3D;

  const fFirst = show3D && !fAnim.show;
  fAnim.want = s;
  if (fFirst) fAnim.delayUntil = now + 1.05;
  fAnim.show = show3D;

  const rule = st.mode === 'rule';
  triadAnims.forEach((A, k) => {
    if (rule && !A.show) A.delayUntil = now + 0.55 + k * 0.2;
    A.show = rule;
  });

  structTarget = show3D ? 1 : 0;
  rodTarget = 0;
  rodPlan = show3D ? { at: now + (fFirst ? 1.45 : 0.55), to: -s * ROD_SLIDE } : null;

  if (instant) {
    allAnims.forEach((A) => A.snap());
    structOp = structTarget;
    rodX = rodTarget = show3D ? -s * ROD_SLIDE : 0;
    rodPlan = null;
  }
  drawPaper(st);
}

function updateOverlay(i) {
  const st = STEPS[i];
  $('capTitle').textContent = st.title;
  $('capMain').textContent = st.main;
  $('capSub').textContent = st.sub || '';
  $('capSub2').textContent = st.sub2 || '';
  const dots = $('dots');
  dots.innerHTML = '';
  for (let g = 0; g < 4; g++) {
    const d = document.createElement('span');
    d.className = 'dot' + (g < GROUP_OF[i] ? ' done' : g === GROUP_OF[i] ? ' cur' : '');
    dots.appendChild(d);
  }
  $('btnNext').disabled = i >= STEPS.length - 1;
  $('btnBack').disabled = i <= 0;
}

function setStep(i, { publish = true, instant = false, from = null } = {}) {
  i = Math.max(0, Math.min(STEPS.length - 1, Math.round(i)));
  stepIdx = i;
  applyStep(i, instant);
  drawBoard(i);
  updateOverlay(i);
  const mode = STEPS[i].mode;
  if (instant || mode !== presetName) {
    if (!povActive) goPreset(mode, instant ? 0 : 1.6);
    presetName = mode;
  }
  if (publish) publishStep(i);
  if (from) flashLink(from);
}

// ---------- 2D camera ----------

let camTween = null;

function presetVectors(name) {
  const p = PRESETS[name];
  const tgt = new THREE.Vector3(...p.tgt);
  const pos = new THREE.Vector3(...p.pos);
  const fit = Math.max(1, 1.3 / camera.aspect);
  pos.sub(tgt).multiplyScalar(fit).add(tgt);
  return { pos, tgt };
}

function goPreset(name, dur) {
  const { pos, tgt } = presetVectors(name);
  if (!dur) {
    camera.position.copy(pos);
    controls.target.copy(tgt);
    controls.update();
    camTween = null;
    return;
  }
  camTween = { t0: now, dur, fp: camera.position.clone(), ft: controls.target.clone(), tp: pos, tt: tgt };
}

controls.addEventListener('start', () => { camTween = null; });

function onResize() {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

// ---------- link between the headset and the big screen ----------

const linkEl = $('link');
const LINK_TEXT = {
  on: '● Live: headset ⇄ big screen',
  retry: '◌ Connecting…  (← → still work)',
  off: '○ Offline: use ← → here',
  limited: '△ Link busy: use ← → here',
};
let linkState = 'retry';
let flashTimer = 0;

function renderLink() {
  linkEl.className = 'chip ' + linkState;
  linkEl.textContent = LINK_TEXT[linkState];
}
function setLink(state) {
  linkState = state;
  if (!flashTimer) renderLink();
}
function flashLink(role) {
  clearTimeout(flashTimer);
  linkEl.className = 'chip flash';
  linkEl.textContent = role === 'headset' ? '● Step sent from the headset' : '● Step sent from the big screen';
  flashTimer = setTimeout(() => {
    flashTimer = 0;
    renderLink();
  }, 1800);
}

let mySeq = 0;
function publishStep(i) {
  mySeq += 1;
  const body = JSON.stringify({ app: APP_TAG, step: i, seq: mySeq, from: MY_ID, role: ROLE });
  fetch(RELAY, { method: 'POST', body })
    .then((r) => { if (!r.ok) setLink(r.status === 429 ? 'limited' : 'retry'); })
    .catch(() => setLink('off'));
}

let lastTime = 0;
const seen = new Set();

function onRelayMessage(ev) {
  let m;
  try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (!m || m.event !== 'message' || typeof m.message !== 'string') return;
  if (seen.has(m.id) || m.time < lastTime) return;
  seen.add(m.id);
  lastTime = m.time;
  let p;
  try { p = JSON.parse(m.message); } catch (e) { return; }
  if (!p || p.app !== APP_TAG || typeof p.step !== 'number') return;
  setLink('on');
  if (p.from === MY_ID) {
    // Our own echo: re-apply only our latest step, so both screens settle on the relay's order.
    if (p.seq === mySeq && p.step !== stepIdx) setStep(p.step, { publish: false });
    return;
  }
  if (p.step !== stepIdx) setStep(p.step, { publish: false, from: p.role });
}

function startRelay() {
  if (!('EventSource' in window)) {
    setLink('off');
    return;
  }
  let es;
  try {
    es = new EventSource(RELAY + '/sse?since=10m');
  } catch (e) {
    setLink('off');
    return;
  }
  es.addEventListener('open', () => setLink('on'));
  es.onerror = () => setLink(navigator.onLine === false ? 'off' : 'retry');
  es.onmessage = onRelayMessage;
}

// ---------- live head view: headset sends its pose, the big screen renders from it ----------

const poseLinks = [];
let povActive = false;
let followPOV = true;

function startPoseLinks() {
  const lib = window.mqtt;
  if (!lib || typeof lib.connect !== 'function') return;
  for (const b of BROKERS) {
    const link = { name: b.name, every: b.every, up: false, client: null };
    try {
      link.client = lib.connect(b.url, {
        clientId: `g7${ROLE[0]}-${MY_ID}-${b.name}`,
        clean: true,
        connectTimeout: 8000,
        reconnectPeriod: 3000,
        keepalive: 20,
      });
    } catch (e) {
      continue;
    }
    link.client.on('connect', () => {
      link.up = true;
      if (ROLE === 'screen') link.client.subscribe(POSE_TOPIC, { qos: 0 });
      updateViewButton();
    });
    link.client.on('close', () => { link.up = false; updateViewButton(); });
    link.client.on('offline', () => { link.up = false; });
    link.client.on('error', () => {});
    if (ROLE === 'screen') link.client.on('message', (topic, payload) => onPose(payload));
    poseLinks.push(link);
  }
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const r4 = (v) => Math.round(v * 10000) / 10000;
const packPose = (p, q) => [r3(p.x), r3(p.y), r3(p.z), r4(q.x), r4(q.y), r4(q.z), r4(q.w)];

let poseSeq = 0;
let lastPoseSent = -1;
const _hp = new THREE.Vector3();
const _hq = new THREE.Quaternion();
const _hs = new THREE.Vector3();

function sendPose(headPos, headQuat, ctrls) {
  if (!poseLinks.some((L) => L.up)) return;
  poseSeq += 1;
  const msg = JSON.stringify({
    id: MY_ID,
    n: poseSeq,
    t: Date.now(),
    h: packPose(headPos, headQuat),
    r: [r3(rig.position.x), r3(rig.position.y), r3(rig.position.z), r4(rig.rotation.y), r3(stand.visible ? stand.scale.y : 0)],
    c: ctrls,
  });
  for (const L of poseLinks) {
    if (L.up && poseSeq % L.every === 0) L.client.publish(POSE_TOPIC, msg, { qos: 0 });
  }
}

function sendXRPose() {
  renderer.xr.getCamera().matrixWorld.decompose(_hp, _hq, _hs);
  const ctrls = [];
  for (let i = 0; i < 2; i++) {
    const ctl = renderer.xr.getController(i);
    ctrls.push(ctl.visible ? [1, ...packPose(ctl.position, ctl.quaternion)] : [0]);
  }
  sendPose(_hp, _hq, ctrls);
}

// Test helper: the headset page sends a made-up head path without a headset.
let simUntil = -1;
const _se = new THREE.Vector3();
const _sl = new THREE.Vector3();
const _sc = new THREE.Vector3();
const _sm = new THREE.Matrix4();
const _sq = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
function sendSimPose(t) {
  rig.position.set(0, 0.95, -0.68);
  rig.rotation.set(0, 0, 0);
  setStand(0.909);
  _se.set(0.14 * Math.sin(0.9 * t), 1.47 + 0.03 * Math.sin(1.3 * t), 0.05 * Math.cos(0.9 * t));
  _sl.set(0.18 * Math.sin(0.6 * t), 0.98 + 0.08 * Math.sin(0.4 * t), -0.68);
  _sm.lookAt(_se, _sl, _up);
  _sq.setFromRotationMatrix(_sm);
  _sc.set(_se.x + 0.18, _se.y - 0.32 + 0.05 * Math.sin(2 * t), _se.z - 0.28);
  sendPose(_se, _sq, [[1, ...packPose(_sc, _sq)], [0]]);
}

const poseBuf = [];
const offsets = [];
const lagSamples = [];
let poseSender = null;
let lastPoseN = 0;
let lastPoseAt = -1e9;
let baseOffset = 0;
let lagShownAt = 0;

function onPose(payload) {
  let p;
  try { p = JSON.parse(payload.toString()); } catch (e) { return; }
  if (!p || !Array.isArray(p.h) || p.h.length !== 7 || !Array.isArray(p.r)) return;
  if (p.id !== poseSender) {
    poseSender = p.id;
    lastPoseN = 0;
    poseBuf.length = 0;
    offsets.length = 0;
  }
  if (p.n <= lastPoseN) return;
  lastPoseN = p.n;
  const local = performance.now();
  lastPoseAt = local;
  offsets.push(local - p.t);
  if (offsets.length > 40) offsets.shift();
  baseOffset = Math.min(...offsets);
  lagSamples.push(Date.now() - p.t);
  if (lagSamples.length > 12) lagSamples.shift();
  poseBuf.push({
    t: p.t,
    pos: new THREE.Vector3(p.h[0], p.h[1], p.h[2]),
    quat: new THREE.Quaternion(p.h[3], p.h[4], p.h[5], p.h[6]),
    r: p.r,
    c: Array.isArray(p.c) ? p.c : [],
  });
  if (poseBuf.length > 40) poseBuf.shift();
}

function updateViewButton() {
  const btn = $('btnView');
  if (!btn) return;
  if (!followPOV) btn.textContent = 'Headset view: off';
  else if (povActive) btn.textContent = 'Headset view: LIVE';
  else btn.textContent = poseLinks.some((L) => L.up) ? 'Headset view: waiting' : 'Headset view: no link';
}

function enterPOV() {
  povActive = true;
  document.body.classList.add('pov');
  controls.enabled = false;
  camTween = null;
  camera.fov = 58;
  camera.updateProjectionMatrix();
  board.visible = true;
  updateViewButton();
}

function exitPOV() {
  povActive = false;
  document.body.classList.remove('pov');
  controls.enabled = true;
  camera.fov = 40;
  camera.updateProjectionMatrix();
  board.visible = false;
  remoteCtl.forEach((g) => { g.visible = false; });
  layout2D();
  presetName = STEPS[stepIdx].mode;
  goPreset(presetName, 0);
  updateViewButton();
}

const _cv = new THREE.Vector3();
const _cq = new THREE.Quaternion();
function updatePOV(dt) {
  const live = followPOV && poseBuf.length > 0 && performance.now() - lastPoseAt < 3000;
  if (live && !povActive) enterPOV();
  if (!live && povActive) exitPOV();
  if (!povActive) return;

  // Render a little behind the newest sample so that late packets can still be interpolated.
  const rt = performance.now() - baseOffset - BUFFER_MS;
  let a = poseBuf[poseBuf.length - 1];
  let b = a;
  if (rt <= poseBuf[0].t) {
    a = b = poseBuf[0];
  } else {
    for (let k = poseBuf.length - 1; k > 0; k--) {
      if (poseBuf[k - 1].t <= rt) {
        a = poseBuf[k - 1];
        b = poseBuf[k];
        break;
      }
    }
  }
  const u = a === b ? 1 : Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t)));
  camera.position.lerpVectors(a.pos, b.pos, u);
  camera.quaternion.slerpQuaternions(a.quat, b.quat, u);

  const r = b.r;
  rig.position.set(r[0], r[1], r[2]);
  rig.rotation.set(0, r[3], 0);
  setStand(r[4] || 0);
  floor.position.y = 0;

  const alpha = 1 - Math.exp(-dt / 0.05);
  for (let i = 0; i < 2; i++) {
    const d = b.c[i];
    const g = remoteCtl[i];
    if (d && d[0] === 1 && d.length === 8) {
      _cv.set(d[1], d[2], d[3]);
      _cq.set(d[4], d[5], d[6], d[7]);
      if (!g.visible) {
        g.position.copy(_cv);
        g.quaternion.copy(_cq);
      }
      g.visible = true;
      g.position.lerp(_cv, alpha);
      g.quaternion.slerp(_cq, alpha);
    } else {
      g.visible = false;
    }
  }

  if (performance.now() - lagShownAt > 500) {
    lagShownAt = performance.now();
    const s = lagSamples.slice().sort((x, y) => x - y);
    const lag = s.length ? s[Math.floor(s.length / 2)] + BUFFER_MS : NaN;
    $('liveLag').textContent = lag > 0 && lag < 5000 ? ` · delay ≈ ${(lag / 1000).toFixed(2)} s` : '';
  }
}

function toggleFollow() {
  followPOV = !followPOV;
  if (!followPOV && povActive) exitPOV();
  updateViewButton();
}

// ---------- headset: VR session, input, recentring ----------

let xrSession = null;
let recenterAt = -1;
let lastNav = -10;
let prevAX = false;
const hands = [];
const _p = new THREE.Vector3();
const _d = new THREE.Vector3();

function vrNav(delta) {
  if (now - lastNav < 0.45) return;
  lastNav = now;
  setStep(stepIdx + delta);
}

const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -0.18)]);
const rayMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
const tipGeo = new THREE.SphereGeometry(0.011, 12, 10);
const tipMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 });

const remoteCtl = [];
if (ROLE === 'screen') {
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Line(rayGeo, rayMat));
    g.add(new THREE.Mesh(tipGeo, tipMat));
    g.visible = false;
    scene.add(g);
    remoteCtl.push(g);
  }
}

if (ROLE === 'headset') {
  for (let i = 0; i < 2; i++) {
    const ctl = renderer.xr.getController(i);
    ctl.addEventListener('selectstart', () => vrNav(1));
    ctl.addEventListener('squeezestart', () => vrNav(-1));
    ctl.add(new THREE.Line(rayGeo, rayMat));
    ctl.add(new THREE.Mesh(tipGeo, tipMat));
    scene.add(ctl);
    const hand = renderer.xr.getHand(i);
    scene.add(hand);
    hands.push(hand);
  }
}

const jointGeo = new THREE.SphereGeometry(0.0075, 10, 8);
const jointMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 });
function decorateHands() {
  for (const hand of hands) {
    const joints = hand.joints;
    if (!joints) continue;
    for (const name in joints) {
      const j = joints[name];
      if (!j.userData.dot) {
        j.userData.dot = new THREE.Mesh(jointGeo, jointMat);
        j.add(j.userData.dot);
      }
    }
  }
}

function pollButtons() {
  const session = renderer.xr.getSession();
  if (!session) return;
  let ax = false;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (gp && gp.buttons && gp.buttons.length > 4 && gp.buttons[4].pressed) ax = true;
  }
  if (ax && !prevAX) recenterAt = now;
  prevAX = ax;
}

function maybeRecenter() {
  if (recenterAt < 0 || now < recenterAt) return;
  const cam = renderer.xr.getCamera();
  _p.setFromMatrixPosition(cam.matrixWorld);
  if (_p.lengthSq() < 1e-8 && now < recenterAt + 2) return;
  recenterAt = -1;
  cam.getWorldDirection(_d);
  _d.y = 0;
  if (_d.lengthSq() < 1e-6) _d.set(0, 0, -1);
  _d.normalize();
  const floorKnown = _p.y > 0.7;
  const y = floorKnown ? Math.max(0.4, _p.y - 0.52) : _p.y - 0.52;
  rig.position.set(_p.x + _d.x * 0.68, y, _p.z + _d.z * 0.68);
  rig.rotation.set(0, Math.atan2(-_d.x, -_d.z), 0);
  setStand(floorKnown ? y - 0.041 : 0);
}

function onXREnd() {
  xrSession = null;
  board.visible = false;
  layout2D();
  camera.fov = 40;
  camera.near = 0.01;
  camera.far = 60;
  onResize();
  goPreset(STEPS[stepIdx].mode, 0);
  $('enterVR').textContent = 'ENTER VR';
}

async function enterVR() {
  if (xrSession) {
    xrSession.end();
    return;
  }
  const note = $('vrNote');
  let session;
  try {
    session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
    });
  } catch (err) {
    note.textContent = 'Could not start VR: ' + ((err && err.message) || err);
    return;
  }
  try {
    await renderer.xr.setSession(session);
  } catch (err) {
    note.textContent = 'VR started but the floor was not found: ' + ((err && err.message) || err);
    session.end();
    return;
  }
  xrSession = session;
  session.addEventListener('end', onXREnd);
  session.addEventListener('visibilitychange', () => {
    if (session.visibilityState === 'visible') recenterAt = now + 0.3;
  });
  floor.position.y = 0;
  board.visible = true;
  recenterAt = now + 0.35;
  $('enterVR').textContent = 'EXIT VR';
}

if (ROLE === 'headset') {
  const btn = $('enterVR');
  const note = $('vrNote');
  btn.addEventListener('click', enterVR);
  if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
      if (ok) {
        btn.hidden = false;
        note.textContent = 'Point at ENTER VR and pull the trigger.';
      } else {
        note.textContent = 'No VR on this device. Use the buttons, or open this page in the Quest browser.';
      }
    }).catch(() => { note.textContent = 'VR check failed. Use the buttons.'; });
  } else {
    note.textContent = 'No VR on this device. Use the buttons, or open this page in the Quest browser.';
  }
}

// ---------- keys and buttons ----------

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
}

window.addEventListener('keydown', (e) => {
  const k = e.key;
  if (['ArrowRight', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) {
    e.preventDefault();
    setStep(stepIdx + 1);
  } else if (['ArrowLeft', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) {
    e.preventDefault();
    setStep(stepIdx - 1);
  } else if (['r', 'R', 'Home'].includes(k)) {
    e.preventDefault();
    setStep(0);
  } else if (['f', 'F'].includes(k)) {
    e.preventDefault();
    toggleFullscreen();
  } else if (['v', 'V'].includes(k) && ROLE === 'screen') {
    e.preventDefault();
    toggleFollow();
  }
});

function onButton(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener('click', (e) => {
    e.currentTarget.blur();
    fn();
  });
}
onButton('btnNext', () => setStep(stepIdx + 1));
onButton('btnBack', () => setStep(stepIdx - 1));
onButton('btnRestart', () => setStep(0));
onButton('btnFull', toggleFullscreen);
onButton('btnView', toggleFollow);

// ---------- loop ----------

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  now += dt;
  const inXR = renderer.xr.isPresenting;

  if (camTween && !inXR && !povActive) {
    const u = Math.min(1, (now - camTween.t0) / camTween.dur);
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    camera.position.lerpVectors(camTween.fp, camTween.tp, e);
    controls.target.lerpVectors(camTween.ft, camTween.tt, e);
    if (u >= 1) camTween = null;
  }
  if (!inXR && !povActive) controls.update();
  if (ROLE === 'screen') updatePOV(dt);

  for (const A of allAnims) A.update(dt, now);

  structOp += (structTarget - structOp) * (1 - Math.exp(-7 * dt));
  metal.opacity = structOp;
  copper.opacity = structOp;
  for (const m of structMeshes) m.visible = structOp > 0.02;

  if (rodPlan && now >= rodPlan.at) {
    rodTarget = rodPlan.to;
    rodPlan = null;
  }
  rodX += (rodTarget - rodX) * (1 - Math.exp(-(rodTarget === 0 ? 10 : 3.2) * dt));
  rodGroup.position.x = rodX;

  bLabel.visible = bAnims.some((A) => A.g > 0.6);
  iLabel.visible = iAnim.g > 0.6;
  iLabel.position.set(0.055, ROD_Y + 0.058, -0.165 * iAnim.dir);
  fLabel.visible = fAnim.g > 0.6;
  fLabel.position.set(-0.24 * fAnim.dir, ROD_Y + 0.043, 0);
  palm.visible = triadAnims[0].g > 0.05;
  triadLabels.forEach((L, k) => { L.visible = triadAnims[k].g > 0.6; });

  if (inXR) {
    pollButtons();
    decorateHands();
    maybeRecenter();
  }
  if (now - lastPoseSent >= 1 / POSE_HZ) {
    if (inXR) {
      lastPoseSent = now;
      sendXRPose();
    } else if (now < simUntil) {
      lastPoseSent = now;
      sendSimPose(now);
    } else if (simUntil > 0) {
      simUntil = -1;
      if (!povActive) layout2D();
    }
  }
  renderer.render(scene, camera);
});

window.__g7 = {
  setStep: (i) => setStep(i),
  get step() { return stepIdx; },
  room: ROOM,
  id: MY_ID,
  role: ROLE,
  peekBoard() {
    board.visible = true;
    camTween = null;
    presetName = null;
    camera.position.set(0, 0.47, 0.5);
    controls.target.set(0, 0.45, -0.44);
    controls.update();
  },
  simPose(seconds = 20) { simUntil = now + seconds; },
  get pov() {
    return {
      active: povActive,
      links: poseLinks.map((L) => `${L.name}:${L.up ? 'up' : 'down'}`),
      buffered: poseBuf.length,
      lagMs: lagSamples.length ? lagSamples.slice().sort((x, y) => x - y)[Math.floor(lagSamples.length / 2)] : null,
      sent: poseSeq,
    };
  },
};

setStep(0, { publish: false, instant: true });
startRelay();
startPoseLinks();
