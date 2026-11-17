// Stylised low-poly fan versions of Pomni, Jax and Caine, built from primitives.
// Every model faces +z. Structure: root > rig (pivot at hips, y=0.9) > body.
const Characters = (() => {
  const matCache = {};
  const M = (color) => {
    if (!matCache[color]) matCache[color] = new THREE.MeshToonMaterial({ color });
    return matCache[color];
  };
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };
  const limb = (len, r1, r2, mat) => {
    const g = new THREE.CylinderGeometry(r1, r2, len, 8);
    g.translate(0, -len / 2, 0);
    return new THREE.Mesh(g, mat);
  };
  const pivot = (x, y, z, child) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    if (child) p.add(child);
    return p;
  };
  function skeleton() {
    const root = new THREE.Group();
    const rig = new THREE.Group();
    rig.position.y = 0.9;
    const body = new THREE.Group();
    body.position.y = -0.9;
    rig.add(body);
    root.add(rig);
    return { root, rig, body };
  }

  // ---------- POMNI ----------
  const POMNI = {
    'pomni': { a: 0xd9263b, b: 0x2f5be0, bell: 0xffd23a, face: 0xf7f2ea, ruff: 0xffffff },
    'pomni-gold': { a: 0xffc21a, b: 0xe07f00, bell: 0xffffff, face: 0xfff6e0, ruff: 0xfff3b0 },
    'pomni-glitch': { a: 0x8a2be2, b: 0x00d9c0, bell: 0xff3df2, face: 0xe8f7ff, ruff: 0xd6fffb },
  };

  function makePomni(variant) {
    const P = POMNI[variant] || POMNI.pomni;
    const { root, rig, body } = skeleton();

    const legL = pivot(-0.15, 0.62, 0, limb(0.5, 0.09, 0.075, M(P.a)));
    const legR = pivot(0.15, 0.62, 0, limb(0.5, 0.09, 0.075, M(P.b)));
    const shoe = new THREE.SphereGeometry(0.12, 10, 8);
    [[legL, P.b], [legR, P.a]].forEach(([leg, col]) => {
      const s = mesh(shoe, M(col), 0, -0.55, 0.07);
      s.scale.set(1, 0.65, 1.7);
      leg.add(s);
    });
    body.add(legL, legR);

    // Torso split down the middle, one colour per side
    const tA = new THREE.CylinderGeometry(0.3, 0.38, 0.62, 16, 1, false, 0, Math.PI);
    const tB = new THREE.CylinderGeometry(0.3, 0.38, 0.62, 16, 1, false, Math.PI, Math.PI);
    body.add(mesh(tA, M(P.a), 0, 0.92, 0), mesh(tB, M(P.b), 0, 0.92, 0));
    const btn = new THREE.SphereGeometry(0.045, 8, 6);
    body.add(mesh(btn, M(P.bell), 0, 1.04, 0.32), mesh(btn, M(P.bell), 0, 0.86, 0.36));

    // Frilly collar
    const frill = new THREE.SphereGeometry(0.1, 8, 6);
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      body.add(mesh(frill, M(P.ruff), Math.sin(ang) * 0.33, 1.25, Math.cos(ang) * 0.33));
    }

    // Head
    const head = pivot(0, 1.62, 0);
    body.add(head);
    head.add(mesh(new THREE.SphereGeometry(0.36, 20, 16), M(P.face)));
    const eye = new THREE.SphereGeometry(0.1, 14, 10);
    const hl = new THREE.SphereGeometry(0.03, 8, 6);
    const cheek = new THREE.SphereGeometry(0.05, 8, 6);
    [-1, 1].forEach(s => {
      const e = mesh(eye, M(0x16112a), s * 0.13, 0.03, 0.3);
      e.scale.set(0.85, 1.2, 0.5);
      head.add(e);
      head.add(mesh(hl, M(0xffffff), s * 0.13 - 0.03, 0.09, 0.35));
      const c = mesh(cheek, M(0xff8fa6), s * 0.22, -0.1, 0.27);
      c.scale.z = 0.4;
      head.add(c);
    });
    const mouth = mesh(new THREE.TorusGeometry(0.05, 0.016, 6, 12, Math.PI), M(0x5a1020), 0, -0.12, 0.34);
    mouth.rotation.z = Math.PI;
    head.add(mouth);

    // Jester hat: split cap + two curled points with bells
    const capA = new THREE.SphereGeometry(0.38, 16, 8, Math.PI / 2, Math.PI, 0, Math.PI / 2);
    const capB = new THREE.SphereGeometry(0.38, 16, 8, -Math.PI / 2, Math.PI, 0, Math.PI / 2);
    head.add(mesh(capA, M(P.a), 0, 0.06, 0), mesh(capB, M(P.b), 0, 0.06, 0));
    const bell = new THREE.SphereGeometry(0.11, 10, 8);
    [-1, 1].forEach(s => {
      const curve = new THREE.CubicBezierCurve3(
        new THREE.Vector3(s * 0.12, 0.3, 0), new THREE.Vector3(s * 0.35, 0.9, 0),
        new THREE.Vector3(s * 0.9, 0.8, 0), new THREE.Vector3(s * 0.82, 0.3, 0));
      head.add(mesh(new THREE.TubeGeometry(curve, 16, 0.1, 8, false), M(s > 0 ? P.a : P.b)));
      head.add(mesh(bell, M(P.bell), s * 0.82, 0.22, 0));
    });

    const armL = pivot(-0.36, 1.12, 0, limb(0.42, 0.07, 0.06, M(P.b)));
    const armR = pivot(0.36, 1.12, 0, limb(0.42, 0.07, 0.06, M(P.a)));
    const glove = new THREE.SphereGeometry(0.085, 10, 8);
    armL.add(mesh(glove, M(0xffffff), 0, -0.45, 0));
    armR.add(mesh(glove, M(0xffffff), 0, -0.45, 0));
    armL.rotation.z = -0.25;
    armR.rotation.z = 0.25;
    body.add(armL, armR);

    return { root, rig, body, head, legL, legR, armL, armR, kind: 'pomni', headY: 1.62 };
  }

  // ---------- JAX ----------
  const JAX = {
    'jax': { fur: 0x8e6ad6, muzzle: 0xcbb6f2, over: 0x2f4aa8, teeth: 0xf2e6a0 },
    'jax-gold': { fur: 0xe8b923, muzzle: 0xfff0b0, over: 0x7a2bb0, teeth: 0xffffff },
  };

  function makeJax(variant) {
    const J = JAX[variant] || JAX.jax;
    const { root, rig, body } = skeleton();

    const legL = pivot(-0.17, 0.8, 0, limb(0.7, 0.1, 0.09, M(J.over)));
    const legR = pivot(0.17, 0.8, 0, limb(0.7, 0.1, 0.09, M(J.over)));
    const shoe = new THREE.SphereGeometry(0.14, 10, 8);
    [legL, legR].forEach(leg => {
      const s = mesh(shoe, M(0xf4f4f4), 0, -0.72, 0.08);
      s.scale.set(1, 0.6, 1.6);
      leg.add(s);
    });
    body.add(legL, legR);

    body.add(mesh(new THREE.CylinderGeometry(0.34, 0.32, 0.42, 14), M(J.over), 0, 0.98, 0));
    body.add(mesh(new THREE.CapsuleGeometry(0.29, 0.42, 6, 14), M(J.fur), 0, 1.4, 0));
    body.add(mesh(new THREE.BoxGeometry(0.38, 0.3, 0.08), M(J.over), 0, 1.22, 0.27));
    const strap = new THREE.BoxGeometry(0.07, 0.42, 0.05);
    const btn = new THREE.SphereGeometry(0.04, 8, 6);
    [-1, 1].forEach(s => {
      body.add(mesh(strap, M(J.over), s * 0.14, 1.5, 0.26));
      body.add(mesh(btn, M(0xffd23a), s * 0.14, 1.38, 0.3));
    });

    const head = pivot(0, 2.05, 0);
    body.add(head);
    const skull = mesh(new THREE.SphereGeometry(0.36, 20, 16), M(J.fur));
    skull.scale.set(1.05, 0.92, 0.95);
    head.add(skull);
    const muz = mesh(new THREE.SphereGeometry(0.2, 14, 10), M(J.muzzle), 0, -0.12, 0.24);
    muz.scale.set(1.45, 0.8, 0.85);
    head.add(muz);
    head.add(mesh(new THREE.BoxGeometry(0.5, 0.16, 0.04), M(0x2a1030), 0, -0.13, 0.4));
    head.add(mesh(new THREE.BoxGeometry(0.44, 0.11, 0.05), M(J.teeth), 0, -0.13, 0.42));
    const gap = new THREE.BoxGeometry(0.012, 0.11, 0.02);
    for (let i = -2; i <= 2; i++) head.add(mesh(gap, M(0xb8a860), i * 0.075, -0.13, 0.445));
    head.add(mesh(new THREE.SphereGeometry(0.045, 8, 6), M(0x4a2a70), 0, -0.01, 0.42));

    const eyeG = new THREE.SphereGeometry(0.085, 12, 10);
    const pupG = new THREE.SphereGeometry(0.035, 8, 6);
    const lidG = new THREE.SphereGeometry(0.094, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    [-1, 1].forEach(s => {
      head.add(mesh(eyeG, M(0xfff6c8), s * 0.13, 0.08, 0.29));
      head.add(mesh(pupG, M(0x111111), s * 0.12, 0.06, 0.37));
      const lid = mesh(lidG, M(J.fur), s * 0.13, 0.08, 0.29);
      lid.rotation.x = 0.45; // smug half-lidded look
      head.add(lid);
      const ear = mesh(new THREE.CapsuleGeometry(0.08, 0.8, 4, 10), M(J.fur), s * 0.16, 0.78, -0.03);
      ear.rotation.z = -s * 0.12;
      head.add(ear);
    });

    const armL = pivot(-0.4, 1.58, 0, limb(0.6, 0.075, 0.07, M(J.fur)));
    const armR = pivot(0.4, 1.58, 0, limb(0.6, 0.075, 0.07, M(J.fur)));
    const glove = new THREE.SphereGeometry(0.1, 10, 8);
    armL.add(mesh(glove, M(0xffffff), 0, -0.63, 0));
    armR.add(mesh(glove, M(0xffffff), 0, -0.63, 0));
    armL.rotation.z = -0.15;
    armR.rotation.z = 0.15;
    body.add(armL, armR);

    return { root, rig, body, head, legL, legR, armL, armR, kind: 'jax', headY: 2.05 };
  }

  // ---------- CAINE (ringmaster: floating teeth + eyes + top hat) ----------
  function makeCaine() {
    const root = new THREE.Group();
    const rig = new THREE.Group();
    root.add(rig);
    const halfCyl = (r, h) => new THREE.CylinderGeometry(r, r, h, 24, 1, false, -Math.PI / 2, Math.PI);
    rig.add(mesh(halfCyl(0.62, 0.34), M(0xffffff), 0, 0.27, 0));
    rig.add(mesh(halfCyl(0.62, 0.34), M(0xffffff), 0, -0.27, 0));
    rig.add(mesh(halfCyl(0.66, 0.12), M(0xe0263a), 0, 0.47, 0));
    rig.add(mesh(halfCyl(0.66, 0.12), M(0xe0263a), 0, -0.47, 0));
    rig.add(mesh(halfCyl(0.58, 0.22), M(0x2a0a18), 0, 0, -0.02));
    const gap = new THREE.BoxGeometry(0.02, 0.32, 0.02);
    for (let i = -2; i <= 2; i++) {
      const ang = i * 0.42;
      [0.27, -0.27].forEach(y => {
        const b = mesh(gap, M(0xbbbbcc), Math.sin(ang) * 0.625, y, Math.cos(ang) * 0.625);
        b.rotation.y = ang;
        rig.add(b);
      });
    }
    const eye = new THREE.SphereGeometry(0.2, 16, 12);
    const pup = new THREE.SphereGeometry(0.09, 10, 8);
    [-1, 1].forEach(s => {
      rig.add(mesh(eye, M(0xffffff), s * 0.22, 0, 0.36));
      rig.add(mesh(pup, M(0x111122), s * 0.22, 0, 0.53));
    });
    rig.add(mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.05, 24), M(0x15151c), 0, 0.56, 0));
    rig.add(mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.62, 20), M(0x15151c), 0, 0.9, 0));
    rig.add(mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.1, 20), M(0xe0263a), 0, 0.65, 0));
    rig.add(mesh(new THREE.ConeGeometry(0.48, 1.0, 16), M(0xc81e34), 0, -1.15, 0));
    const tie = new THREE.ConeGeometry(0.1, 0.2, 4);
    [-1, 1].forEach(s => {
      const t = mesh(tie, M(0xffd23a), s * 0.1, -0.68, 0.32);
      t.rotation.z = s * Math.PI / 2;
      rig.add(t);
    });
    const glove = new THREE.SphereGeometry(0.15, 10, 8);
    const gl = mesh(glove, M(0xffffff), -0.8, -0.8, 0.2);
    const gr = mesh(glove, M(0xffffff), 0.8, -0.6, 0.2);
    rig.add(gl, gr);
    const cane = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), M(0x15151c), 0.82, -0.9, 0.2);
    cane.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), M(0xffffff), 0, 0.68, 0));
    rig.add(cane);
    return { root, rig, glL: gl, glR: gr, kind: 'caine' };
  }

  function make(id) { return id.startsWith('jax') ? makeJax(id) : makePomni(id); }

  // Run / idle / airborne pose
  function animate(c, ph, amt, air) {
    if (air) {
      c.legL.rotation.x = -0.9; c.legR.rotation.x = 0.5;
      c.armL.rotation.x = -2.5; c.armR.rotation.x = -2.5;
      c.rig.position.y = 0.9;
      return;
    }
    const s = Math.sin(ph);
    c.legL.rotation.x = s * 0.9 * amt;
    c.legR.rotation.x = -s * 0.9 * amt;
    c.armL.rotation.x = -s * 0.8 * amt;
    c.armR.rotation.x = s * 0.8 * amt;
    c.rig.position.y = 0.9 + Math.abs(Math.cos(ph)) * 0.12 * amt;
  }

  return { make, makePomni, makeJax, makeCaine, animate };
})();
