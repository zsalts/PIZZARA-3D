/* ============ visor 3D (Three.js) ============ */
import * as THREE from 'three';
import { W, L, M, BG, GROUND, clamp, ease, easeOut, easeBack } from './util.js';
import { app } from './state.js';
import { pitchImg, drawShapes, LINK_3D, isLight } from './cancha.js';

/* ---------- tiempos ---------- */
export const slideT = s => ({ intro: 1.1, mv: s.moveDur ?? 1.6, hold: s.hold ?? .6, end: 2.2 });
export const slideDur = s => { const T = slideT(s); return T.intro + (s.steps.length - 1) * (T.mv + T.hold) + T.end; };
export function posAt(s, id, t) {
  const T = slideT(s), n = s.steps.length, tt = t - T.intro;
  if (tt <= 0 || n === 1) return s.steps[0][id];
  const seg = T.mv + T.hold, k = Math.floor(tt / seg);
  if (k >= n - 1) return s.steps[n - 1][id];
  const a = ease(Math.min((tt - k*seg) / T.mv, 1)), A = s.steps[k][id], B = s.steps[k + 1][id];
  if (!A || !B) return A || B;
  return [A[0] + (B[0] - A[0]) * a, A[1] + (B[1] - A[1]) * a];
}
export const hdrOf = (w, h) => (h > w ? w / 1080 : .62 * h / 1080) * 590;
/** ¿Se dibujan textos (antetítulo, título, bajada, @cuenta) sobre la imagen? Opción de proyecto, apagada por defecto. */
export const showTexts = () => !!app.P?.showTexts;

/** Textura del número/rol impreso en la cara superior del disco (fondo transparente, contraste automático). */
function labelTexture(txt, teamHex, hl) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'), n = txt.length;
  const fs = (n > 2 ? 92 : n > 1 ? 120 : 140) * LABEL_BOOST / 1.25;
  x.font = `800 ${fs}px Montserrat`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const light = isLight(teamHex) && !hl;
  x.lineWidth = fs * .12; x.strokeStyle = light ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)'; x.strokeText(txt, 128, 136);
  x.fillStyle = light ? '#151413' : '#ffffff'; x.fillText(txt, 128, 136);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/** Textura radial para la sombra de contacto bajo cada ficha. */
function blobTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(2,10,28,.6)'); g.addColorStop(.55, 'rgba(2,10,28,.22)'); g.addColorStop(1, 'rgba(2,10,28,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Escala de las fichas en 3D (disco, etiqueta, bocha, sombra, anillo de destacada y estela). El editor 2D no cambia. */
export const TOKEN_SCALE = 0.6;
/** Tamaño del número impreso sobre el disco (1,25 = referencia; subilo si hace falta más legibilidad). */
export const LABEL_BOOST = 1.25;
/** Ficha tipo imán de pizarra (unidades locales, × TOKEN_SCALE en el mundo): radio 2,9 → 1,74 m; espesor 0,32 → 0,19 m. */
const DISC_R = 2.9, DISC_H = .32, BALL_R = .45;
/** Parámetros de cámara (exportados para poder medirlos). Elevación de la mirada en grados, FOV vertical por formato,
    margen del encuadre (fracción del cuadro) y altura máxima de una ficha con su etiqueta (m), usada como margen fijo. */
export const CAM = { GOAL_EL: 45, GOAL_EL_PORT: 70, FOV_LAND: 38, FOV_PORT: 46, FIT_MG: .97,
  // lo más alto de una ficha: la bocha (2 × BALL_R) o el disco con su etiqueta impresa → ≈ 0,54 m
  PAWN_TOP: Math.max(DISC_H + .03, 2 * BALL_R) * TOKEN_SCALE };
const SPX = 14;   // resolución de la capa de anotaciones (px por metro)

export class Viewer {
  constructor(stage) {
    this.stage = stage; this.c2 = stage.getContext('2d');
    const r = this.r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.outputColorSpace = THREE.SRGBColorSpace;
    const sc = this.scene = new THREE.Scene();
    sc.background = new THREE.Color(BG); sc.fog = new THREE.Fog(BG, 170, 460);
    this.cam = new THREE.PerspectiveCamera(30, 1, 1, 1500);
    this.tmp = new THREE.PerspectiveCamera(30, 1, 1, 1500);

    // iluminación: cielo/suelo + luz principal con sombra + relleno frío + contraluz
    sc.add(new THREE.HemisphereLight(0xfffaf2, 0x2a4a7a, 1.15));
    const d = new THREE.DirectionalLight(0xfff4e6, 2.1);
    // luz principal de costado y desde el fondo (arco rival): las sombras caen hacia la cámara y se leen bien
    d.position.set(-55, 75, -45); d.castShadow = true;
    const big = r.capabilities.maxTextureSize >= 8192 && !/Mobi|Android/i.test(navigator.userAgent);
    d.shadow.mapSize.set(big ? 4096 : 2048, big ? 4096 : 2048);
    Object.assign(d.shadow.camera, { left: -62, right: 62, top: 72, bottom: -72, near: 10, far: 260 });
    d.shadow.bias = -.0003; d.shadow.normalBias = .02; d.shadow.radius = 4; sc.add(d);
    const fill = new THREE.DirectionalLight(0xdfe8ff, .45); fill.position.set(50, 40, 70); sc.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, .55); rim.position.set(20, 30, -90); sc.add(rim);

    const gmat = new THREE.MeshStandardMaterial({ color: GROUND, roughness: .9 });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), gmat);
    g.rotation.x = -Math.PI / 2; g.position.y = -.02; g.receiveShadow = true; sc.add(g);
    const tex = new THREE.CanvasTexture(pitchImg); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = r.capabilities.getMaxAnisotropy();
    const pitchGeo = new THREE.PlaneGeometry(W + 2*M, L + 2*M);
    const pm = new THREE.Mesh(pitchGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: .9 }));
    pm.rotation.x = -Math.PI / 2; pm.receiveShadow = true; sc.add(pm);

    // capa de anotaciones (flechas, zonas, textos) pintada sobre la cancha
    this.shapeCv = document.createElement('canvas');
    this.shapeCv.width = (W + 2*M) * SPX; this.shapeCv.height = (L + 2*M) * SPX;
    this.shapeTex = new THREE.CanvasTexture(this.shapeCv); this.shapeTex.colorSpace = THREE.SRGBColorSpace;
    this.shapeTex.anisotropy = r.capabilities.getMaxAnisotropy();
    this.shapeMesh = new THREE.Mesh(pitchGeo, new THREE.MeshBasicMaterial({ map: this.shapeTex, transparent: true, depthWrite: false, opacity: 0 }));
    this.shapeMesh.rotation.x = -Math.PI / 2; this.shapeMesh.position.y = .03; this.shapeMesh.renderOrder = 1; sc.add(this.shapeMesh);

    // arcos
    const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .5 });
    for (const sgn of [-1, 1]) {
      const goal = new THREE.Group();
      const post = new THREE.BoxGeometry(.1, 2.14, .1);
      for (const px of [-1.83, 1.83]) { const p = new THREE.Mesh(post, wm); p.position.set(px, 1.07, 0); p.castShadow = true; goal.add(p); }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.76, .1, .1), wm); bar.position.y = 2.14; bar.castShadow = true; goal.add(bar);
      const net = new THREE.Mesh(new THREE.BoxGeometry(3.66, 2.1, 1.2), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: .18, depthWrite: false }));
      net.position.set(0, 1.05, -.6); goal.add(net);
      goal.position.z = sgn * L / 2; if (sgn > 0) goal.rotation.y = Math.PI;
      sc.add(goal);
    }
    // geometrías compartidas por todas las fichas
    this.G = {
      puck: new THREE.CylinderGeometry(DISC_R, DISC_R, DISC_H, 48, 1),        // grupos: 0 canto, 1 tapa, 2 base
      rim: new THREE.RingGeometry(DISC_R - .26, DISC_R, 64),                   // bisel claro sobre la tapa
      halo: new THREE.RingGeometry(DISC_R + .25, DISC_R + 1.05, 64),           // anillo de destacada en el piso
      label: new THREE.PlaneGeometry(DISC_R * 1.6, DISC_R * 1.6),
      link: new THREE.BoxGeometry(1, .07, .55), ball: new THREE.SphereGeometry(BALL_R, 20, 14),
      blob: new THREE.PlaneGeometry(1, 1),
    };
    this.G.puck.translate(0, DISC_H / 2, 0);
    this.mats = new Map();   // materiales compartidos por color/estado (userData.shared: no se liberan en clear)
    this.blobTex = blobTexture();


    this.dyn = new THREE.Group(); sc.add(this.dyn);
    this.objs = new Map(); this.links = [];
    this.t = 0; this.clock = 0; this.playing = false; this.playAll = true; this.busy = false;
    this.camPos = new THREE.Vector3(0, 120, 140); this.camTgt = new THREE.Vector3();
    this.setFormat(1080, 1920);
  }
  setFormat(w, h, q = this.q || 1) {
    this.bw = w; this.bh = h; this.q = q;
    w = Math.round(w * q); h = Math.round(h * q);
    this.w = w; this.h = h; this.stage.width = w; this.stage.height = h;
    this.r.setSize(w, h, false);
    // sin textos la cancha usa todo el cuadro; con textos se reserva la franja del encabezado
    const hdr = showTexts() ? hdrOf(w, h) : 0;
    this.aspect = w / (h - hdr);
    this.cam.aspect = this.aspect; this.cam.setViewOffset(w, h - hdr, 0, -hdr, w, h); this.cam.updateProjectionMatrix();
    this.cam.fov = w >= h ? CAM.FOV_LAND : CAM.FOV_PORT; this.cam.updateProjectionMatrix();
    if (this.s) this.setCamera();
  }
  clear() {
    // libera materiales propios y texturas de etiquetas; los materiales compartidos (userData.shared) y las
    // geometrías de this.G se reutilizan entre slides
    this.dyn.traverse(o => {
      if (!o.material) return;
      for (const m of [].concat(o.material)) { if (m.userData.shared) continue; if (m.map && m.map !== this.blobTex) m.map.dispose(); m.dispose(); }
    });
    this.dyn.clear(); this.objs.clear(); this.links = [];
  }
  /** Material compartido (cacheado por clave). */
  mat(key, make) {
    let m = this.mats.get(key);
    if (!m) { m = make(); m.userData.shared = true; this.mats.set(key, m); }
    return m;
  }
  /** Libera materiales compartidos de colores que ya no se usan. */
  retainMats(colors) {
    for (const [k, m] of this.mats) if (k.includes('#') && !colors.some(c => k.includes(c))) { m.dispose(); this.mats.delete(k); }
  }
  /** Ficha: disco plano tipo imán de pizarra, número impreso en la tapa (legible desde la cámara del preset). */
  /** Todas las fichas a pleno (sin atenuado); las destacadas solo suman el anillo amarillo. */
  makePawn(e, camAz) {
    const P = app.P, hex = e.team === 'away' ? P.awayColor : P.homeColor;
    const col = new THREE.Color(hex), white = new THREE.Color('#fff');
    const o = new THREE.Group(), fig = new THREE.Group(), base = new THREE.Group();
    const top = this.mat(`top|${hex}`, () => new THREE.MeshStandardMaterial({ color: col, roughness: .5 }));
    const side = this.mat(`side|${hex}`, () => new THREE.MeshStandardMaterial({ color: col.clone().lerp(new THREE.Color('#000'), .3), roughness: .6 }));
    const puck = new THREE.Mesh(this.G.puck, [side, top, side]);
    puck.castShadow = true; puck.receiveShadow = true; fig.add(puck);
    const rim = new THREE.Mesh(this.G.rim, this.mat(`rim|${e.hl}`, () => new THREE.MeshBasicMaterial({ color: e.hl ? '#f2c94c' : '#ffffff', transparent: true, opacity: .95, depthWrite: false })));
    rim.rotation.x = -Math.PI / 2; rim.position.y = DISC_H + .01; fig.add(rim);
    if (e.label) {
      // etiqueta plana sobre la tapa, girada según el azimut de la cámara para leerse derecha
      const lab = new THREE.Mesh(this.G.label, new THREE.MeshBasicMaterial({ map: labelTexture(e.label, hex, e.hl), transparent: true, opacity: 1, depthWrite: false }));
      lab.rotation.set(-Math.PI / 2, camAz, 0, 'YXZ');   // acostada (X) y luego girada en el piso (Y) hacia la cámara
      lab.position.y = DISC_H + .02; lab.renderOrder = 3; fig.add(lab);
    }
    o.add(fig);
    if (e.hl) { // anillo de destacada en el piso alrededor del disco
      const halo = new THREE.Mesh(this.G.halo, this.mat('halo', () => new THREE.MeshBasicMaterial({ color: '#f2c94c', transparent: true, opacity: .75, depthWrite: false })));
      halo.rotation.x = -Math.PI / 2; halo.position.y = .03; base.add(halo);
    }
    { // sombra de contacto muy sutil (el disco está apoyado, no flota)
      const blob = new THREE.Mesh(this.G.blob, this.mat('blob', () => new THREE.MeshBasicMaterial({ map: this.blobTex, transparent: true, depthWrite: false, opacity: .3 })));
      blob.rotation.x = -Math.PI / 2; blob.position.y = .02; blob.scale.setScalar(DISC_R * 2.5); base.add(blob);
    }
    o.add(base);
    o.scale.setScalar(TOKEN_SCALE);
    o.userData = { fig, base, kind: 'pawn' };
    return o;
  }
  makeBall() {
    const o = new THREE.Group(), fig = new THREE.Group(), base = new THREE.Group();
    // bocha: esfera blanca chica apoyada en el piso (rueda, no rebota)
    const m = new THREE.Mesh(this.G.ball, this.mat('ball', () => new THREE.MeshStandardMaterial({ color: '#f6f7f9', roughness: .35 })));
    // sin estela, halo ni disco de sombra extra: solo la sombra real de la luz
    m.position.y = BALL_R; m.castShadow = true; fig.add(m); o.add(fig); o.add(base);
    o.scale.setScalar(TOKEN_SCALE);
    o.userData = { fig, base, kind: 'ball', spin: m };
    return o;
  }
  paintShapes(s) {
    const x = this.shapeCv.getContext('2d');
    x.clearRect(0, 0, this.shapeCv.width, this.shapeCv.height);
    const T = q => (M + q) * SPX;
    drawShapes(x, s.shapes || [], T, T, SPX, {});
    this.shapeTex.needsUpdate = true;
    this.shapeMesh.visible = !!s.shapes?.length;
  }
  load(i, snapCam) {
    this.clear();
    const P = app.P;
    this.retainMats([P.homeColor, P.awayColor]);
    this.i = i; const s = this.s = P.slides[i]; this.t = 0; this.dur = slideDur(s);
    const camAz = 0;   // cámara única detrás del arco: etiquetas derechas
    s.ents.forEach((e, k) => {
      const o = e.type === 'ball' ? this.makeBall() : this.makePawn(e, camAz);
      o.userData.k = k; this.dyn.add(o); this.objs.set(e.id, { o, e, prev: null, m: 0, dx: 0, dz: 0 });
    });
    // conexiones entre jugadoras: solo si el proyecto lo pide (por defecto no se muestran en la presentación)
    if (P.showLinks) s.links.forEach(([a, b], k) => {
      if (!this.objs.has(a) || !this.objs.has(b)) return;
      const m = new THREE.Mesh(this.G.link, new THREE.MeshStandardMaterial({ color: LINK_3D, roughness: .6, transparent: true, opacity: .92 }));
      m.receiveShadow = true; this.dyn.add(m); this.links.push({ m, a, b, k });
    });
    this.paintShapes(s);
    this.setCamera();   // cámara FIJA: corte directo al encuadre del slide (sin transición)
    this.onSlide?.(i);
  }
  /**
   * ÚNICA cámara del visor, video, PNG y PDF: mangrullo detrás del arco propio, cancha completa.
   * Depende SOLO del formato (ancho/alto del cuadro y franja de textos): no mira el slide, sus fichas ni s.camera.
   * Encuadre: líneas de la cancha a nivel del suelo + margen fijo en el fondo lejano a la altura máxima de una ficha.
   */
  computeCam() {
    const D2R = Math.PI / 180, port = this.w < this.h;
    const V3 = (x, y, z) => new THREE.Vector3(x - W/2, y, z - L/2);
    const corners = (y) => [V3(0, y, 0), V3(W, y, 0), V3(0, y, L), V3(W, y, L)];
    const field = corners(0).concat(corners(CAM.PAWN_TOP).filter(p => p.z < 0));   // fondo lejano elevado
    return this.fit(field, (port ? CAM.GOAL_EL_PORT : CAM.GOAL_EL) * D2R, 0, CAM.FIT_MG);
  }
  /** Coloca la cámara en el encuadre del slide. Es la ÚNICA escritura de camPos/camTgt. */
  setCamera() {
    this.goal = this.computeCam();
    this.camPos.copy(this.goal.pos); this.camTgt.copy(this.goal.tgt);
  }
  fit(pts, el, az, mg = .9) {
    const c = this.tmp; c.fov = this.cam.fov; c.aspect = this.aspect; c.updateProjectionMatrix();
    const box = new THREE.Box3().setFromPoints(pts), tgt = box.getCenter(new THREE.Vector3()); tgt.y = 0;
    const dir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const right = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)), fwd = new THREE.Vector3(-Math.sin(az), 0, -Math.cos(az));
    const v = new THREE.Vector3();
    const place = D => { c.position.copy(tgt).addScaledVector(dir, D); c.lookAt(tgt); c.updateMatrixWorld(); };
    const bounds = () => { let a = 1e9, b = -1e9, cc = 1e9, d = -1e9; for (const p of pts) { v.copy(p).project(c); a = Math.min(a, v.x); b = Math.max(b, v.x); cc = Math.min(cc, v.y); d = Math.max(d, v.y); } return [a, b, cc, d]; };
    let D = 100;
    for (let it = 0; it < 4; it++) {
      let lo = 5, hi = 1000;
      for (let j = 0; j < 30; j++) { D = (lo + hi) / 2; place(D); const [a, b, cc, d] = bounds(); (a >= -mg && b <= mg && cc >= -mg && d <= mg) ? hi = D : lo = D; }
      D = hi; place(D);
      const [a, b, cc, d] = bounds(), hh = D * Math.tan(c.fov * Math.PI / 360);
      tgt.addScaledVector(right, (a + b) / 2 * hh * c.aspect).addScaledVector(fwd, (cc + d) / 2 * hh / Math.sin(el));
    }
    place(D);
    return { pos: c.position.clone(), tgt: tgt.clone() };
  }
  /** Cámara fija: misma posición y objetivo en todos los cuadros (sin deriva, paneo ni transición). */
  updateCamera() {
    // la niebla acompaña la distancia (en 9:16 la torre queda más lejos) para no tapar la cancha
    const dist = this.camPos.distanceTo(this.camTgt);
    this.scene.fog.near = dist + 60; this.scene.fog.far = dist * 2.2 + 260;
    this.cam.position.copy(this.camPos); this.cam.lookAt(this.camTgt);
  }
  frame(dt) {
    if (!this.s) return;
    if (this.playing) {
      this.t += dt;
      if (this.t >= this.dur) {
        if (this.playAll && this.i < app.P.slides.length - 1) this.load(this.i + 1, false);
        else { this.t = this.dur; this.playing = false; this.onEnd?.(); }
      }
    }
    this.clock += dt;
    const s = this.s;
    for (const [id, R] of this.objs) {
      const p = posAt(s, id, this.t); if (!p) continue;
      const x = p[0] - W/2, z = p[1] - L/2, { o } = R, ud = o.userData;
      const k = clamp((this.t - .05 - ud.k * .04) / .55), scl = k <= 0 ? .0001 : easeBack(k);
      let vx = 0, vz = 0;
      if (R.prev && dt > 0) { vx = (x - R.prev[0]) / dt; vz = (z - R.prev[1]) / dt; }
      R.prev = [x, z];
      const sp = Math.hypot(vx, vz);
      R.m += (Math.min(sp / 7, 1) - R.m) * (1 - Math.exp(-dt * 10));
      if (sp > .3) { R.dx = vx / sp; R.dz = vz / sp; }
      o.position.set(x, 0, z);
      ud.fig.scale.setScalar(scl); ud.base.scale.setScalar(Math.max(.0001, easeOut(k)));
      if (ud.kind === 'pawn') {
        // disco plano: solo se desliza sobre el piso (sin rebote ni inclinación)
      } else {
        ud.spin.rotation.x += vz * dt / (BALL_R * TOKEN_SCALE); ud.spin.rotation.z -= vx * dt / (BALL_R * TOKEN_SCALE);   // rueda sin deslizar

      }
    }
    for (const Lk of this.links) {
      const A = this.objs.get(Lk.a).o.position, B = this.objs.get(Lk.b).o.position;
      const kl = easeOut(clamp((this.t - .55 - Lk.k * .03) / .6));
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz);
      Lk.m.visible = kl > .001;
      Lk.m.scale.x = Math.max(.001, len * kl);
      Lk.m.position.set(A.x + dx * kl / 2, .1, A.z + dz * kl / 2);
      Lk.m.rotation.y = -Math.atan2(dz, dx);
    }
    this.shapeMesh.material.opacity = easeOut(clamp((this.t - .4) / .6));
    this.updateCamera();
    this.r.render(this.scene, this.cam);
    this.c2.drawImage(this.r.domElement, 0, 0);
    if (showTexts()) drawOverlay(this.c2, s, this.w, this.h, this.t);
  }
  /** Dibuja el estado final de un slide (para exportar PNG/PDF). */
  renderStill(i) {
    this.load(i, true);
    this.playing = false; this.t = this.dur;
    this.frame(0);
    return this.stage;
  }
}

export function drawOverlay(ctx, s, w, h, t) {
  const P = app.P;
  const v = h > w, u = v ? w / 1080 : .62 * h / 1080, hdr = hdrOf(w, h), X = 52 * u;
  const g = ctx.createLinearGradient(0, 0, 0, hdr + 90 * u);
  g.addColorStop(0, 'rgba(15,36,64,1)'); g.addColorStop(.78, 'rgba(15,36,64,.92)'); g.addColorStop(1, 'rgba(15,36,64,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, hdr + 90 * u);
  ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  if (P.handle) {
    ctx.fillStyle = '#c8323c'; ctx.beginPath(); ctx.arc(X + 7*u, 140*u, 7*u, 0, 7); ctx.fill();
    ctx.font = `800 ${30*u}px Montserrat`; ctx.letterSpacing = `${4*u}px`; ctx.fillStyle = '#ffffff';
    ctx.fillText(P.handle, X + 28*u, 151*u);
    ctx.fillStyle = '#c8323c'; ctx.fillRect(X, 178*u, 190*u, 4*u);
  }
  const a = easeOut(clamp((t - .05) / .6));
  ctx.globalAlpha = a; ctx.translate(0, (1 - a) * 36 * u);
  if (s.kicker) {
    ctx.fillStyle = '#c8323c'; ctx.fillRect(X, 254*u, 68*u, 7*u);
    ctx.font = `800 ${34*u}px Montserrat`; ctx.letterSpacing = `${9*u}px`; ctx.fillStyle = '#ff7a82';
    ctx.fillText(s.kicker, X + 94*u, 270*u);
  }
  if (s.title) {
    const title = s.title, acc = (s.accent || '').trim(), maxW = w - 2*X;
    let size = 240 * u; ctx.letterSpacing = '0px';
    ctx.font = `${size}px "Bebas Neue"`;
    const tw = ctx.measureText(title).width; if (tw > maxW) { size *= maxW / tw; ctx.font = `${size}px "Bebas Neue"`; }
    const ix = acc ? title.indexOf(acc) : -1;
    const parts = ix < 0 ? [[title, '#ffffff']] : [[title.slice(0, ix), '#ffffff'], [acc, '#e8414b'], [title.slice(ix + acc.length), '#ffffff']];
    let px = X - 4*u;
    for (const [txt, col] of parts) { ctx.fillStyle = col; ctx.fillText(txt, px, 478*u); px += ctx.measureText(txt).width; }
  }
  if (s.subtitle) {
    ctx.font = `800 ${29*u}px Montserrat`; ctx.letterSpacing = `${5.5*u}px`; ctx.fillStyle = '#ffffff';
    ctx.fillText(s.subtitle, X, 540*u);
  }
  ctx.restore(); ctx.letterSpacing = '0px';
}
