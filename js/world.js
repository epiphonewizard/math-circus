// The 3D world: checkered track floating in the digital void, gates, scenery, particles.
// The player stays at z = 0; everything else moves toward +z at World.speed.
const LANE_W = 2.5;
const TRACK_W = 8.7;
const TILE = 2.5;
const N_TILES = 96;
const TRACK_BACK = 40;     // tiles recycle once they pass this z (behind the camera)
const CURTAIN_H = 3.2;

// Older iPads lack canvas roundRect
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function numberTexture(text) {
  return canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#2a1763';
    g.beginPath(); g.roundRect(0, 0, w, h, 34); g.fill();
    g.fillStyle = '#fff8ec';
    g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 26); g.fill();
    g.fillStyle = '#2a1763';
    g.font = '800 112px "Baloo 2", "Arial Rounded MT Bold", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 8);
  });
}

const World = {
  speed: 0,
  t: 0,
  gates: [],
  movers: [],

  init(container) {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(r.domElement);
    this.maxAniso = r.capabilities.getMaxAnisotropy();

    const s = this.scene = new THREE.Scene();
    s.background = canvasTex(4, 512, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, '#120a3d');
      gr.addColorStop(0.3, '#3d1d96');
      gr.addColorStop(0.5, '#b889f0');
      gr.addColorStop(1, '#b889f0');
      g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
    });
    s.fog = new THREE.Fog(0xb889f0, 55, 185);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 600);
    this.camera.position.set(0, 4.5, 7.2);
    this.camLook = new THREE.Vector3(0, 1.5, -12);

    s.add(new THREE.HemisphereLight(0xfff4ff, 0x5b3cc4, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(5, 12, 8);
    s.add(sun);

    this.makeShared();
    this.buildTrack();
    this.buildBackdrop();
    this.buildParticles();
    for (let z = TRACK_BACK; z > -180; z -= 10) this.spawnProps(z);
    this.propAcc = 0;

    window.addEventListener('resize', () => this.resize());
    this.resize();
  },

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 76 : 62;   // portrait tablets need a wider view to fit 3 lanes
    this.camera.updateProjectionMatrix();
  },

  makeShared() {
    const L = (color) => new THREE.MeshLambertMaterial({ color });
    this.mat = {
      red: L(0xe0263a), blue: L(0x2f5be0), yellow: L(0xffd23a), gold: L(0xf2b430),
      purple: L(0x2a1763), white: L(0xffffff), dark: L(0x2a1763),
      padRed: L(0xff3355), padRing: L(0xffe14d), glove: L(0xe0263a),
    };
    const hazard = canvasTex(64, 16, (g) => {
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#1a1030' : '#ffd23a'; g.fillRect(i * 8, 0, 8, 16); }
    });
    hazard.wrapS = THREE.RepeatWrapping; hazard.repeat.set(6, 1);
    this.mat.hazard = new THREE.MeshLambertMaterial({ map: hazard });

    const velvet = canvasTex(128, 256, (g, w, h) => {
      for (let x = 0; x < w; x++) {
        const k = 0.62 + 0.38 * Math.abs(Math.sin((x / w) * Math.PI * 5));
        g.fillStyle = `rgb(${Math.round(200 * k)},${Math.round(20 * k)},${Math.round(50 * k)})`;
        g.fillRect(x, 0, 1, h);
      }
      g.fillStyle = '#ffd23a';
      g.fillRect(0, h - 26, w, 26);
      for (let x = 0; x < w; x += 16) { g.beginPath(); g.arc(x + 8, h - 26, 8, 0, Math.PI); g.fill(); }
      g.font = '800 120px "Baloo 2", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = '#5a0a1e';
      g.strokeText('?', w / 2, h / 2 - 10);
      g.fillText('?', w / 2, h / 2 - 10);
    });
    this.mat.velvet = new THREE.MeshLambertMaterial({ map: velvet });

    this.geo = {
      pad: new THREE.CylinderGeometry(0.8, 0.9, 0.18, 20),
      padRing: new THREE.TorusGeometry(0.55, 0.09, 8, 20),
      strip: new THREE.BoxGeometry(TRACK_W, 0.04, 0.3),
      sign: new THREE.PlaneGeometry(2.1, 1.31),
      signBack: new THREE.BoxGeometry(2.25, 1.45, 0.08),
      rope: new THREE.CylinderGeometry(0.03, 0.03, 1, 6),
      ball: new THREE.SphereGeometry(0.4, 12, 10),
      curtain: new THREE.BoxGeometry(2.2, CURTAIN_H, 0.18),
      pillar: new THREE.BoxGeometry(0.3, CURTAIN_H + 0.3, 0.5),
    };
  },

  buildTrack() {
    const tex = canvasTex(870, 250, (g) => {
      const A = '#7b3ff2', B = '#ffd447';
      for (let row = 0; row < 2; row++) for (let col = 0; col < 6; col++) {
        g.fillStyle = (row + col) % 2 ? B : A;
        g.fillRect(60 + col * 125, row * 125, 125, 125);
      }
      for (const x0 of [0, 810]) for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#ffffff' : '#e0263a';
        g.fillRect(x0, i * 62.5, 60, 62.5);
      }
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(306, 0, 8, 250);
      g.fillRect(556, 0, 8, 250);
    });
    tex.anisotropy = this.maxAniso;
    const top = new THREE.MeshLambertMaterial({ map: tex });
    const side = new THREE.MeshLambertMaterial({ color: 0x2a1763 });
    const geo = new THREE.BoxGeometry(TRACK_W, 1.0, TILE);
    const mats = [side, side, top, side, side, side];
    this.tiles = [];
    for (let i = 0; i < N_TILES; i++) {
      const m = new THREE.Mesh(geo, mats);
      m.position.set(0, -0.5, TRACK_BACK - TILE / 2 - i * TILE);
      this.scene.add(m);
      this.tiles.push(m);
    }
  },

  buildBackdrop() {
    // Stars
    const pts = [];
    for (let i = 0; i < 500; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
      const R = 400;
      pts.push(Math.cos(th) * Math.sin(ph) * R, Math.cos(ph) * R * 0.7 + 20, Math.sin(th) * Math.sin(ph) * R);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }));
    this.scene.add(this.stars);

    // Big top tent on the horizon
    const stripes = canvasTex(256, 8, (g) => {
      for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e0263a'; g.fillRect(i * 16, 0, 16, 8); }
    });
    stripes.wrapS = THREE.RepeatWrapping; stripes.repeat.set(2, 1);
    const tm = new THREE.MeshBasicMaterial({ map: stripes, fog: false });
    const tent = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(45, 45, 26, 40, 1, true), tm);
    wall.position.y = 3;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(50, 32, 40, 1, true), tm);
    roof.position.y = 32;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 14, 8), new THREE.MeshBasicMaterial({ color: 0xffd23a, fog: false }));
    pole.position.y = 54;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshBasicMaterial({ color: 0x2f5be0, fog: false, side: THREE.DoubleSide }));
    flag.position.set(4.5, 58, 0);
    tent.add(wall, roof, pole, flag);
    tent.position.set(0, -12, -320);
    this.scene.add(tent);

    // Shared prop assets
    const poleTex = canvasTex(8, 64, (g) => {
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#e0263a'; g.fillRect(0, i * 8, 8, 8); }
    });
    poleTex.wrapT = THREE.RepeatWrapping; poleTex.repeat.set(1, 6);
    this.poleGeo = new THREE.CylinderGeometry(0.22, 0.22, 11, 10);
    this.poleMat = new THREE.MeshLambertMaterial({ map: poleTex });
    this.ballGeo = new THREE.SphereGeometry(0.5, 14, 10);
    const pal = [0xffd23a, 0x2f5be0, 0xe0263a, 0x2fbf71, 0xff7ad9, 0x00d9c0];
    this.palMats = pal.map(c => new THREE.MeshLambertMaterial({ color: c }));
    this.shapeGeos = [
      new THREE.BoxGeometry(2, 2, 2), new THREE.OctahedronGeometry(1.6), new THREE.TorusGeometry(1.4, 0.45, 8, 20),
      new THREE.ConeGeometry(1.3, 2.4, 4), new THREE.TetrahedronGeometry(1.7), new THREE.IcosahedronGeometry(1.4),
    ];
  },

  addMover(obj, f = 1, spin = 0) {
    this.scene.add(obj);
    this.movers.push({ obj, f, spin });
  },

  spawnProps(z) {
    [-1, 1].forEach(s => {
      const pole = new THREE.Mesh(this.poleGeo, this.poleMat);
      pole.position.set(s * 5.4, -3, z);
      pole.add(new THREE.Mesh(this.ballGeo, pick(this.palMats)).translateY(6));
      this.addMover(pole, 1);
    });
    if (Math.random() < 0.8) {
      const sh = new THREE.Mesh(pick(this.shapeGeos), pick(this.palMats));
      const side = Math.random() < 0.5 ? -1 : 1;
      sh.position.set(side * (11 + Math.random() * 26), -12 + Math.random() * 26, z);
      sh.scale.setScalar(0.7 + Math.random() * 1.6);
      this.addMover(sh, 0.6, 0.3 + Math.random() * 0.8);
    }
  },

  // ---------- GATES ----------
  spawnGate(kind, options, desiredZ) {
    const g = {
      kind, options, group: new THREE.Group(), z: 0,
      contactZ: kind === 'cliff' ? -1.0 : -0.5,
      anims: [], disposables: [], hidden: [], pads: [], curtains: [],
      top: new THREE.Group(),   // arch + signs: lifts out of the camera's way as the gate arrives
    };
    g.group.add(g.top);
    // Snap the gate to a tile edge so a cliff gap lines up exactly with two missing tiles.
    let best = null, bd = Infinity;
    for (const t of this.tiles) {
      const d = Math.abs(t.position.z + TILE / 2 - desiredZ);
      if (d < bd) { bd = d; best = t; }
    }
    g.z = best.position.z + TILE / 2;

    if (kind === 'cliff') {
      for (const t of this.tiles) {
        const c = t.position.z;
        if (Math.abs(c - (g.z - TILE / 2)) < 0.01 || Math.abs(c - (g.z - 1.5 * TILE)) < 0.01) {
          t.visible = false;
          g.hidden.push(t);
        }
      }
      this.buildCliff(g);
    } else {
      this.buildCurtains(g);
    }
    g.group.position.z = g.z;
    this.scene.add(g.group);
    this.gates.push(g);
    return g;
  },

  buildSigns(g, y, z, ropesTo) {
    for (let i = 0; i < 3; i++) {
      if (g.options[i] === '') continue;   // recall modes only show a "?" sign in the middle
      const x = (i - 1) * LANE_W;
      const tex = numberTexture(String(g.options[i]));
      tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex, fog: false });
      g.disposables.push(tex, mat);
      const back = new THREE.Mesh(this.geo.signBack, this.mat.purple);
      back.position.set(x, y, z - 0.06);
      const sign = new THREE.Mesh(this.geo.sign, mat);
      sign.position.set(x, y, z);
      g.top.add(back, sign);
      if (ropesTo) {
        const len = ropesTo - (y + 0.72);
        [-0.8, 0.8].forEach(dx => {
          const r = new THREE.Mesh(this.geo.rope, this.mat.white);
          r.scale.y = len;
          r.position.set(x + dx, y + 0.72 + len / 2, z - 0.06);
          g.top.add(r);
        });
      }
    }
  },

  buildCliff(g) {
    const G = g.group;
    const s1 = new THREE.Mesh(this.geo.strip, this.mat.hazard);
    s1.position.set(0, 0.02, 0.16);
    const s2 = s1.clone();
    s2.position.z = -2 * TILE - 0.16;
    G.add(s1, s2);
    for (let i = 0; i < 3; i++) {
      const pad = new THREE.Group();
      pad.position.set((i - 1) * LANE_W, 0, 1.0);
      const base = new THREE.Mesh(this.geo.pad, this.mat.padRed);
      base.position.y = 0.09;
      const ring = new THREE.Mesh(this.geo.padRing, this.mat.padRing);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.2;
      pad.add(base, ring);
      G.add(pad);
      g.pads.push(pad);
    }
    const H = 5.0, z = -0.3;
    [-1, 1].forEach(s => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, H + 1.2, 12), s < 0 ? this.mat.red : this.mat.blue);
      post.position.set(s * (TRACK_W / 2 + 0.35), H / 2 - 0.6, z);
      const knob = new THREE.Mesh(this.geo.ball, this.mat.yellow);
      knob.position.set(s * (TRACK_W / 2 + 0.35), H + 0.2, z);
      g.top.add(post, knob);
    });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TRACK_W + 1.4, 0.45, 0.45), this.mat.yellow);
    beam.position.set(0, H, z);
    g.top.add(beam);
    this.buildSigns(g, 3.5, z + 0.3, H);
  },

  buildCurtains(g) {
    const G = g.group, H = CURTAIN_H;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(TRACK_W + 0.6, 0.5, 0.6), this.mat.gold);
    beam.position.set(0, H + 0.2, 0);
    G.add(beam);
    [-3.75, -1.25, 1.25, 3.75].forEach(x => {
      const p = new THREE.Mesh(this.geo.pillar, this.mat.gold);
      p.position.set(x, H / 2, 0);
      G.add(p);
    });
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(this.geo.curtain, this.mat.velvet);
      c.position.set((i - 1) * LANE_W, H / 2, 0);
      G.add(c);
      g.curtains.push(c);
    }
    this.buildSigns(g, H + 1.25, 0.1);
  },

  openCurtain(g, lane) {
    const c = g.curtains[lane];
    g.anims.push(dt => {
      const k = Math.min(1, dt * 12);
      c.scale.y += (0.08 - c.scale.y) * k;
      c.position.y += (CURTAIN_H - 0.15 - c.position.y) * k;
      return c.scale.y > 0.09;
    });
  },

  punch(g, lane) {
    const x = (lane - 1) * LANE_W;
    const glove = new THREE.Group();
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), this.mat.glove);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 8), this.mat.yellow);
    arm.rotation.x = Math.PI / 2;
    arm.position.z = -0.8;
    glove.add(fist, arm);
    glove.position.set(x, 1.4, 0);
    g.group.add(glove);
    const pop = this.textSprite('BONK!', '#ffd23a');
    pop.position.set(x, 3.0, 1);
    g.group.add(pop);
    g.disposables.push(pop.material.map, pop.material);
    let t = 0;
    g.anims.push(dt => {
      t += dt;
      glove.position.z = 0.2 + Math.sin(Math.min(1, t / 0.18) * Math.PI) * 1.3 + Math.min(t, 0.18) * 2;
      const ps = Math.max(0.01, Math.min(1, t * 6) * 2.4);
      pop.scale.set(ps, ps / 2, 1);
      g.curtains[lane].rotation.z = Math.sin(t * 40) * 0.05 * Math.max(0, 1 - t * 2);
      return t < 1.5;
    });
  },

  bouncePad(g, lane) {
    const pad = g.pads[lane];
    let t = 0;
    g.anims.push(dt => {
      t += dt;
      pad.scale.y = 1 + Math.sin(Math.min(1, t / 0.3) * Math.PI) * 1.6;
      return t < 0.3;
    });
  },

  fizzlePad(g, lane) {
    const pad = g.pads[lane];
    g.anims.push(dt => {
      const s = Math.max(0, pad.scale.x - dt * 5);
      pad.scale.setScalar(s);
      pad.rotation.y += dt * 20;
      return s > 0;
    });
  },

  textSprite(text, color) {
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.font = '800 92px "Baloo 2", Arial, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 14; g.strokeStyle = '#2a1763';
      g.strokeText(text, w / 2, h / 2);
      g.fillStyle = color;
      g.fillText(text, w / 2, h / 2);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthTest: false }));
    sp.scale.set(0.01, 0.005, 1);
    sp.renderOrder = 10;
    return sp;
  },

  removeGate(g) {
    const i = this.gates.indexOf(g);
    if (i < 0) return;
    this.gates.splice(i, 1);
    this.scene.remove(g.group);
    for (const t of g.hidden) t.visible = true;
    for (const d of g.disposables) d.dispose();
  },

  clearGates() {
    while (this.gates.length) this.removeGate(this.gates[0]);
  },

  // ---------- PARTICLES ----------
  buildParticles() {
    this.parts = [];
    const geo = new THREE.PlaneGeometry(0.16, 0.26);
    const cols = [0xffd23a, 0xe0263a, 0x2f5be0, 0x2fbf71, 0xff7ad9, 0xffffff];
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide }));
      m.visible = false;
      this.scene.add(m);
      this.parts.push({ m, v: new THREE.Vector3(), life: 0 });
    }
  },

  confetti(pos, n = 40) {
    let c = 0;
    for (const p of this.parts) {
      if (p.life > 0) continue;
      p.life = 0.9 + Math.random() * 0.6;
      p.m.visible = true;
      p.m.position.copy(pos);
      p.v.set((Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 4 + 3);
      if (++c >= n) break;
    }
  },

  // ---------- FRAME ----------
  update(dt) {
    this.t += dt;
    const d = this.speed * dt;
    for (const t of this.tiles) {
      t.position.z += d;
      if (t.position.z > TRACK_BACK + TILE / 2) { t.position.z -= N_TILES * TILE; t.visible = true; }
    }
    for (let i = this.movers.length - 1; i >= 0; i--) {
      const m = this.movers[i];
      m.obj.position.z += d * m.f;
      if (m.spin) { m.obj.rotation.x += m.spin * dt; m.obj.rotation.y += m.spin * 0.7 * dt; }
      if (m.obj.position.z > TRACK_BACK + 5) { this.scene.remove(m.obj); this.movers.splice(i, 1); }
    }
    this.propAcc += d;
    while (this.propAcc >= 10) { this.propAcc -= 10; this.spawnProps(-180 + this.propAcc); }

    for (let i = this.gates.length - 1; i >= 0; i--) {
      const g = this.gates[i];
      g.z += d;
      g.group.position.z = g.z;
      for (let k = g.anims.length - 1; k >= 0; k--) if (g.anims[k](dt) === false) g.anims.splice(k, 1);
      if (g.z > -11) g.top.position.y += (11 - g.top.position.y) * Math.min(1, dt * 5);
      if (g.z > 20) this.removeGate(g);
    }
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.v.y -= 14 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += dt * 8;
      p.m.rotation.y += dt * 6;
      if (p.life <= 0) p.m.visible = false;
    }
    this.stars.rotation.y += dt * 0.01;
  },

  render() { this.renderer.render(this.scene, this.camera); },
};
