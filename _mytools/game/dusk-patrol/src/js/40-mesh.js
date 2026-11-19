/* ============================================================
   Low-poly aircraft & missile meshes, contrails, flames, shadows
   ============================================================ */

const CAMO = {
  light: [0.76, 0.78, 0.82],
  mid: [0.50, 0.53, 0.60],
  dark: [0.29, 0.32, 0.39],
  slate: [0.37, 0.39, 0.46],
  radome: [0.085, 0.085, 0.115],
  canopy: [0.95, 0.70, 0.26],
  canopy2: [0.72, 0.47, 0.16],
  red: [0.66, 0.11, 0.12],
  metal: [0.28, 0.27, 0.30],
  nozzle: [0.40, 0.34, 0.30],
  white: [0.82, 0.82, 0.80],
  darkGrey: [0.16, 0.16, 0.19],
};

function headingQuat(yaw, pitch, roll) {
  return qNormalize(qMul(
    qAxis({ x: 0, y: 1, z: 0 }, -yaw),
    qMul(qAxis({ x: 1, y: 0, z: 0 }, pitch), qAxis({ x: 0, y: 0, z: 1 }, -roll))
  ));
}

function polyNormal(verts) {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

function MeshBuilder() {
  const polys = [];
  function poly(verts, color) {
    let area = 0;
    for (let i = 1; i < verts.length - 1; i++) {
      const a = verts[0], b = verts[i], c = verts[i + 1];
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    }
    if (area > 1e-7) polys.push({ verts, color });
  }
  function mirrorPoly(verts, color) {
    poly(verts.map((v) => [-v[0], v[1], v[2]]).reverse(), color);
  }
  function build() {
    const solidPos = [], solidNor = [], solidCol = [];
    const smooth = new Map();
    const tris = [];
    for (const p of polys) {
      const n = polyNormal(p.verts);
      for (let i = 1; i < p.verts.length - 1; i++) {
        const tri = [p.verts[0], p.verts[i], p.verts[i + 1]];
        tris.push({ tri, n });
        for (const v of tri) {
          solidPos.push(v[0], v[1], v[2]);
          solidNor.push(n[0], n[1], n[2]);
          solidCol.push(p.color[0], p.color[1], p.color[2]);
          const k = v[0].toFixed(2) + ',' + v[1].toFixed(2) + ',' + v[2].toFixed(2);
          let s = smooth.get(k);
          if (!s) { s = [0, 0, 0, 0, 0, 0]; smooth.set(k, s); }
          s[0] += n[0]; s[1] += n[1]; s[2] += n[2];
          s[3] += v[0]; s[4] += v[1]; s[5] += v[2];
        }
      }
    }
    const outPos = [], outNor = [];
    for (const t of tris) {
      for (const v of t.tri) {
        const k = v[0].toFixed(2) + ',' + v[1].toFixed(2) + ',' + v[2].toFixed(2);
        const s = smooth.get(k);
        const l = Math.hypot(s[0], s[1], s[2]) || 1;
        outPos.push(v[0], v[1], v[2]);
        outNor.push(s[0] / l, s[1] / l, s[2] / l);
      }
    }
    return {
      solid: makeVAO(GL.gl, new Float32Array(solidPos), new Float32Array(solidNor), new Float32Array(solidCol)),
      count: solidPos.length / 3,
      outline: makeOutlineVAO(GL.gl, new Float32Array(outPos), new Float32Array(outNor)),
      outCount: outPos.length / 3,
    };
  }
  return { poly, mirror: mirrorPoly, build };
}

function makeVAO(gl, pos, nor, col) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bp = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bp);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const bn = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bn);
  gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  const bc = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bc);
  gl.bufferData(gl.ARRAY_BUFFER, col, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, count: pos.length / 3 };
}

function makeOutlineVAO(gl, pos, nor) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const bp = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bp);
  gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const bn = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bn);
  gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, count: pos.length / 3 };
}

function fuselageRing(z, r, yo) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = ((i + 0.5) / 8) * TAU;
    pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.82 + yo, z]);
  }
  return pts;
}

function buildAircraft() {
  const B = MeshBuilder();
  const sections = [
    [-9.65, 0.03, 0.13],
    [-8.5, 0.30, 0.11],
    [-7.0, 0.68, 0.08],
    [-5.1, 0.98, 0.05],
    [-2.7, 1.20, 0.02],
    [0.3, 1.30, 0.0],
    [3.0, 1.18, 0.02],
    [5.8, 0.94, 0.06],
    [7.8, 0.74, 0.10],
    [8.85, 0.58, 0.12],
  ];
  const rings = sections.map((s) => fuselageRing(s[0], s[1], s[2]));
  const camo = [CAMO.light, CAMO.mid, CAMO.dark, CAMO.slate, CAMO.mid, CAMO.light, CAMO.dark, CAMO.mid, CAMO.slate];
  for (let s = 0; s < rings.length - 1; s++) {
    const A = rings[s], Bq = rings[s + 1];
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      const col = s < 2 ? CAMO.radome : camo[(s * 5 + i * 3) % camo.length];
      B.poly([A[i], A[j], Bq[j], Bq[i]], col);
    }
  }
  // nose cap
  const nose = rings[0];
  B.poly([nose[0], nose[1], nose[2], nose[3], nose[4], nose[5], nose[6], nose[7]], CAMO.radome);
  // tail cap
  const tail = rings[rings.length - 1];
  B.poly(tail.slice().reverse(), CAMO.darkGrey);

  // canopy: faceted gold bubble with dark frame
  const bfL = [-0.52, 0.94, -5.0], bfR = [0.52, 0.94, -5.0];
  const bmL = [-0.74, 0.99, -3.15], bmR = [0.74, 0.99, -3.15];
  const brL = [-0.50, 1.00, -1.45], brR = [0.50, 1.00, -1.45];
  const tf = [0, 1.46, -4.75], tm = [0, 1.84, -3.15], tr = [0, 1.46, -1.5];
  B.poly([bfL, bfR, tf], CAMO.darkGrey);
  B.poly([bfL, bmL, tm, tf], CAMO.canopy);
  B.poly([bfR, tf, tm, bmR], CAMO.canopy2);
  B.poly([bmL, brL, tr, tm], CAMO.canopy2);
  B.poly([bmR, tm, tr, brR], CAMO.canopy);
  B.poly([brL, brR, tr], CAMO.darkGrey);
  B.poly([[0.045, 1.47, -4.76], [0.045, 1.85, -3.15], [0.045, 1.47, -1.51],
          [-0.045, 1.47, -1.51], [-0.045, 1.85, -3.15], [-0.045, 1.47, -4.76]], CAMO.darkGrey);
  const sill = [[-0.8, 0.93, -5.0], [-0.86, 0.93, -1.4], [-0.6, 0.95, -1.4], [-0.58, 0.95, -5.0]];
  B.poly(sill, CAMO.darkGrey);
  B.mirror(sill, CAMO.darkGrey);
  B.poly([[-0.76, 0.99, -3.15], [0.76, 0.99, -3.15], [0.045, 1.85, -3.15], [-0.045, 1.85, -3.15]], CAMO.darkGrey);

  // wings: cranked cropped delta, three-tone splinter panels
  const wLEr = [1.02, 0.08, -4.35], wLEm = [3.55, 0.12, -0.15], wLEt = [5.85, 0.14, 2.75];
  const wTEr = [1.02, 0.08, 4.75], wTEm = [3.55, 0.12, 4.35], wTEt = [5.85, 0.14, 3.95];
  const bLEr = [1.02, -0.24, -4.2], bLEm = [3.55, -0.16, -0.05], bLEt = [5.85, -0.08, 2.8];
  const bTEr = [1.02, -0.24, 4.6], bTEm = [3.55, -0.16, 4.25], bTEt = [5.85, -0.08, 3.9];
  // upper surfaces
  B.poly([wLEr, wTEr, wTEm], CAMO.mid);
  B.poly([wLEr, wTEm, wLEm], CAMO.dark);
  B.poly([wLEm, wTEm, wTEt, wLEt], CAMO.light);
  B.poly([wLEm, wTEt, wLEt], CAMO.slate);
  // lower surfaces
  B.poly([bLEr, bLEm, bTEm, bTEr], CAMO.dark);
  B.poly([bLEm, bLEt, bTEt, bTEm], CAMO.slate);
  // edges
  B.poly([wLEr, wLEm, bLEm, bLEr], CAMO.dark);
  B.poly([wLEm, wLEt, bLEt, bLEm], CAMO.slate);
  B.poly([wTEr, wTEm, bTEm, bTEr], CAMO.slate);
  B.poly([wTEm, wTEt, bTEt, bTEm], CAMO.dark);
  B.poly([wLEt, wTEt, bTEt, bLEt], CAMO.dark);
  // LERX strake and wing fence
  const lerx = [[1.0, 0.10, -5.0], [1.7, 0.08, -4.0], [1.5, 0.08, -2.6], [1.0, 0.10, -2.6]];
  B.poly(lerx, CAMO.light);
  const fence = [[3.51, 0.14, 0.2], [3.57, 0.14, 0.2], [3.57, 0.52, 0.55], [3.51, 0.52, 0.55]];
  B.poly(fence, CAMO.darkGrey);
  B.poly(fence.slice().reverse(), CAMO.darkGrey);
  // chine strips
  const chine = [[0.92, 0.12, -7.0], [1.42, 0.02, -4.4], [1.35, 0.02, -2.4], [0.92, 0.12, -2.4]];
  B.poly(chine, CAMO.light);
  B.mirror([wLEr, wTEr, wTEm], CAMO.mid);
  B.mirror([wLEr, wTEm, wLEm], CAMO.dark);
  B.mirror([wLEm, wTEm, wTEt, wLEt], CAMO.light);
  B.mirror([wLEm, wTEt, wLEt], CAMO.slate);
  B.mirror([bLEr, bLEm, bTEm, bTEr], CAMO.dark);
  B.mirror([bLEm, bLEt, bTEt, bTEm], CAMO.slate);
  B.mirror([wLEr, wLEm, bLEm, bLEr], CAMO.dark);
  B.mirror([wLEm, wLEt, bLEt, bLEm], CAMO.slate);
  B.mirror([wTEr, wTEm, bTEm, bTEr], CAMO.slate);
  B.mirror([wTEm, wTEt, bTEt, bTEm], CAMO.dark);
  B.mirror([wLEt, wTEt, bTEt, bLEt], CAMO.dark);
  B.mirror(lerx, CAMO.light);
  B.mirror(chine, CAMO.light);
  B.mirror(fence, CAMO.darkGrey);
  B.mirror(fence.slice().reverse(), CAMO.darkGrey);

  // canted twin tails with red caps
  const rt = [
    [2.55, 0.75, 5.0],
    [2.95, 0.75, 7.9],
    [4.05, 3.95, 8.15],
    [3.65, 3.95, 6.15],
  ];
  function atY(p, q, y) {
    const t = (y - p[1]) / (q[1] - p[1]);
    return [p[0] + (q[0] - p[0]) * t, y, p[2] + (q[2] - p[2]) * t];
  }
  function tailSide(pts, sign) {
    const t = 0.085 * sign;
    const a = pts.map((p) => [p[0] + t, p[1], p[2]]);
    const b = pts.map((p) => [p[0] - t, p[1], p[2]]);
    if (sign > 0) {
      B.poly([a[3], a[2], a[1], a[0]], CAMO.mid);
      B.poly([b[0], b[1], b[2], b[3]], CAMO.dark);
    } else {
      B.poly([a[3], a[2], a[1], a[0]], CAMO.dark);
      B.poly([b[0], b[1], b[2], b[3]], CAMO.mid);
    }
    B.poly([a[0], a[1], b[1], b[0]], CAMO.slate);
    B.poly([a[1], a[2], b[2], b[1]], CAMO.slate);
    B.poly([a[2], a[3], b[3], b[2]], CAMO.slate);
    B.poly([a[3], a[0], b[0], b[3]], CAMO.slate);
    // red tip cap wrapping both faces, leading edge and top
    const yc = 3.28;
    const cf = atY(pts[0], pts[3], yc);
    const cr = atY(pts[1], pts[2], yc);
    const pair = (p) => [[p[0] + t, p[1], p[2]], [p[0] - t, p[1], p[2]]];
    const [cfo, cfi] = pair(cf), [cro, cri] = pair(cr);
    const [tfo, tfi] = pair(pts[3]), [tro, tri] = pair(pts[2]);
    B.poly([cfo, cro, tro, tfo], CAMO.red);
    B.poly([cfi, tfi, tri, cri], CAMO.red);
    B.poly([cfo, tfo, tfi, cfi], CAMO.red);
    B.poly([cro, cri, tri, tro], CAMO.red);
    B.poly([tfo, tro, tri, tfi], CAMO.red);
  }
  tailSide(rt, 1);
  tailSide(rt.map((p) => [-p[0], p[1], p[2]]), -1);

  // twin canted tails complete the silhouette


  // ventral fins
  const vf = [
    [1.0, -0.3, 6.4],
    [1.15, -0.3, 8.1],
    [1.5, -1.25, 8.5],
    [1.35, -1.2, 7.2],
  ];
  B.poly(vf, CAMO.dark);
  B.poly(vf.slice().reverse(), CAMO.slate);
  B.mirror(vf, CAMO.dark);
  B.mirror(vf.slice().reverse(), CAMO.slate);

  // engine nozzles
  for (const sx of [-1, 1]) {
    const cx = sx * 1.02;
    const z0 = 8.3, z1 = 9.35, r0 = 0.40, r1 = 0.34;
    const ringA = [], ringB = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ringA.push([cx + Math.cos(a) * r0, 0.1 + Math.sin(a) * r0, z0]);
      ringB.push([cx + Math.cos(a) * r1, 0.1 + Math.sin(a) * r1, z1]);
    }
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      B.poly([ringA[i], ringA[j], ringB[j], ringB[i]], i % 2 ? CAMO.metal : CAMO.nozzle);
    }
    B.poly(ringB.slice().reverse(), [0.10, 0.07, 0.06]);
  }

  // small intakes under the wing roots
  const intake = [
    [1.45, -0.42, -1.9],
    [2.0, -0.38, -1.9],
    [2.1, -0.5, 1.2],
    [1.45, -0.52, 1.2],
  ];
  B.poly(intake, CAMO.darkGrey);
  B.poly(intake.map((p) => [p[0], p[1] - 0.28, p[2]]).reverse(), CAMO.darkGrey);
  B.mirror(intake, CAMO.darkGrey);
  B.mirror(intake.map((p) => [p[0], p[1] - 0.28, p[2]]).reverse(), CAMO.darkGrey);

  // angular intake trunks along the fuselage
  const trunkTop = [[1.22, 0.30, -2.6], [1.72, 0.22, -2.35], [1.72, 0.22, 1.65], [1.22, 0.30, 1.9]];
  const trunkBot = [[1.22, -0.42, -2.6], [1.72, -0.34, -2.35], [1.72, -0.34, 1.65], [1.22, -0.42, 1.9]];
  B.poly(trunkTop, CAMO.mid);
  B.poly(trunkBot.slice().reverse(), CAMO.dark);
  B.poly([[1.22, 0.30, -2.6], [1.72, 0.22, -2.35], [1.72, -0.34, -2.35], [1.22, -0.42, -2.6]], CAMO.darkGrey);
  B.poly([[1.72, 0.22, -2.35], [1.72, 0.22, 1.65], [1.72, -0.34, 1.65], [1.72, -0.34, -2.35]], CAMO.slate);
  B.mirror(trunkTop, CAMO.mid);
  B.mirror(trunkBot.slice().reverse(), CAMO.dark);
  B.mirror([[1.22, 0.30, -2.6], [1.72, 0.22, -2.35], [1.72, -0.34, -2.35], [1.22, -0.42, -2.6]], CAMO.darkGrey);
  B.mirror([[1.72, 0.22, -2.35], [1.72, 0.22, 1.65], [1.72, -0.34, 1.65], [1.72, -0.34, -2.35]], CAMO.slate);

  // missile pylon plates
  for (const [px, pz] of [[2.95, 2.55], [4.55, 2.2]]) {
    const q = [[px - 0.07, -0.12, pz - 0.55], [px + 0.07, -0.12, pz - 0.55],
               [px + 0.07, -0.80, pz - 0.42], [px - 0.07, -0.80, pz - 0.42]];
    B.poly(q, CAMO.darkGrey);
    B.poly(q.slice().reverse(), CAMO.darkGrey);
    B.poly([[px - 0.07, -0.12, pz - 0.55], [px - 0.07, -0.80, pz - 0.42],
            [px - 0.07, -0.80, pz + 0.42], [px - 0.07, -0.12, pz + 0.55]], CAMO.slate);
    B.mirror(q, CAMO.darkGrey);
    B.mirror(q.slice().reverse(), CAMO.darkGrey);
  }

  return B.build();
}

function buildMissile() {
  const B = MeshBuilder();
  const zs = [-1.35, -0.75, 0.55, 1.0];
  const rs = [0.02, 0.13, 0.13, 0.10];
  const rings = zs.map((z, i) => {
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      pts.push([Math.cos(a) * rs[i], Math.sin(a) * rs[i], z]);
    }
    return pts;
  });
  for (let s = 0; s < rings.length - 1; s++) {
    for (let k = 0; k < 6; k++) {
      const j = (k + 1) % 6;
      const col = s === 0 ? CAMO.red : s === 1 ? CAMO.white : CAMO.metal;
      B.poly([rings[s][k], rings[s][j], rings[s + 1][j], rings[s + 1][k]], col);
    }
  }
  const back = rings[3].slice().reverse();
  B.poly(back, CAMO.darkGrey);
  // four fins
  for (let f = 0; f < 4; f++) {
    const a = (f / 4) * TAU + Math.PI / 4;
    const dx = Math.cos(a), dy = Math.sin(a);
    const p = (r, z) => [dx * r, dy * r, z];
    const fin = [p(0.1, 0.45), p(0.48, 0.95), p(0.48, 1.15), p(0.1, 1.05)];
    B.poly(fin, CAMO.dark);
    B.poly(fin.slice().reverse(), CAMO.metal);
  }
  return B.build();
}

function buildShadowMesh() {
  const B = MeshBuilder();
  const y = 0;
  // fuselage
  const fus = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const z = lerp(-9.6, 9.0, t);
    const w = Math.sin(t * Math.PI) * 1.15 + 0.15;
    fus.push([Math.cos(0) * w, y, z]);
  }
  // build a lens shape
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const z = lerp(-9.4, 9.0, t);
    const w = Math.sin(t * Math.PI) * 1.1 + 0.12;
    pts.push([w, y, z]);
  }
  for (let i = 12; i >= 0; i--) {
    const t = i / 12;
    const z = lerp(-9.4, 9.0, t);
    const w = Math.sin(t * Math.PI) * 1.1 + 0.12;
    pts.push([-w, y, z]);
  }
  B.poly(pts, [0, 0, 0]);
  // wings
  const wing = [
    [1.0, y, -4.3],
    [3.55, y, -0.1],
    [5.85, y, 2.8],
    [5.85, y, 4.0],
    [3.55, y, 4.35],
    [1.0, y, 4.7],
  ];
  B.poly([wing[0], wing[5], wing[4], wing[3], wing[2], wing[1]], [0, 0, 0]);
  B.mirror([wing[0], wing[5], wing[4], wing[3], wing[2], wing[1]], [0, 0, 0]);
  // tails
  const tl = [
    [2.55, y, 5.0],
    [2.95, y, 7.9],
    [4.05, y, 8.15],
    [3.65, y, 6.15],
  ];
  B.poly([tl[0], tl[3], tl[2], tl[1]], [0, 0, 0]);
  B.mirror([tl[0], tl[3], tl[2], tl[1]], [0, 0, 0]);
  return B.build();
}

const Meshes = {};

function initMeshes() {
  Meshes.aircraft = buildAircraft();
  Meshes.missile = buildMissile();
  Meshes.shadow = buildShadowMesh();

  // trailing wingtip lines
  GL.trailVAO = GL.gl.createVertexArray();
  GL.trailBuffer = GL.gl.createBuffer();
  GL.gl.bindVertexArray(GL.trailVAO);
  GL.gl.bindBuffer(GL.gl.ARRAY_BUFFER, GL.trailBuffer);
  GL.gl.bufferData(GL.gl.ARRAY_BUFFER, 4 * 6 * 500, GL.gl.DYNAMIC_DRAW);
  GL.gl.enableVertexAttribArray(0);
  GL.gl.vertexAttribPointer(0, 3, GL.gl.FLOAT, false, 16, 0);
  GL.gl.enableVertexAttribArray(1);
  GL.gl.vertexAttribPointer(1, 1, GL.gl.FLOAT, false, 16, 12);
  GL.gl.bindVertexArray(null);
}

function setMeshUniforms(model, opts) {
  const gl = GL.gl;
  const prog = GL.prog.mesh;
  gl.useProgram(prog.p);
  gl.uniformMatrix4fv(prog.u.uViewProj, false, GL.viewProj);
  gl.uniformMatrix4fv(prog.u.uModel, false, model);
  gl.uniformMatrix3fv(prog.u.uNormalMat, false, normalMatrixFromModel(model));
  gl.uniform3f(prog.u.uCamPos, GL.cam.pos.x, GL.cam.pos.y, GL.cam.pos.z);
  gl.uniform3f(prog.u.uSun, SUN.x, SUN.y, SUN.z);
  gl.uniform3f(prog.u.uHaze, HAZE.x, HAZE.y, HAZE.z);
  const o = opts.override || [0, 0, 0, 0];
  gl.uniform4f(prog.u.uOverride, o[0], o[1], o[2], o[3]);
  gl.uniform1f(prog.u.uAlpha, opts.alpha === undefined ? 1 : opts.alpha);
  gl.uniform1f(prog.u.uFlash, opts.flash || 0);
  gl.uniform1f(prog.u.uEmit, opts.emit || 0);
  gl.uniform1f(prog.u.uLinePush, 0);
  gl.uniform1f(prog.u.uExpand, opts.expand || 0);
  return prog;
}

function drawMesh(mesh, model, opts) {
  const gl = GL.gl;
  const o = opts || {};
  if (o.outline !== false && mesh.outline) {
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.depthMask(false);
    setMeshUniforms(model, {
      override: o.outlineColor || [0.035, 0.03, 0.045, 1],
      alpha: 1,
      expand: o.outlineWidth === undefined ? 0.12 : o.outlineWidth,
      flash: 0,
      emit: 0,
    });
    gl.bindVertexArray(mesh.outline.vao);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.outline.count);
    gl.depthMask(true);
    gl.cullFace(gl.BACK);
  }
  const prog = setMeshUniforms(model, o);
  gl.uniform1f(prog.u.uExpand, 0);
  gl.bindVertexArray(mesh.solid.vao);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.solid.count);
  gl.disable(gl.CULL_FACE);
  gl.bindVertexArray(null);
}

/* --- aircraft orientation helpers --- */
function craftBasis(q) {
  return {
    fwd: qRot(q, { x: 0, y: 0, z: -1 }),
    up: qRot(q, { x: 0, y: 1, z: 0 }),
    right: qRot(q, { x: 1, y: 0, z: 0 }),
    back: qRot(q, { x: 0, y: 0, z: 1 }),
  };
}

function localToWorld(player, p) {
  return vadd(player.pos, qRot(player.quat, p));
}

const Contrails = { L: [], R: [] };

function updateContrails(player, dt) {
  const left = localToWorld(player, { x: -6.3, y: 0.1, z: 2.4 });
  const right = localToWorld(player, { x: 6.3, y: 0.1, z: 2.4 });
  pushTrail(Contrails.L, left, dt);
  pushTrail(Contrails.R, right, dt);
}
function pushTrail(arr, p, dt) {
  for (const q of arr) q.age += dt;
  while (arr.length && arr[0].age > 1.0) arr.shift();
  arr.push({ x: p.x, y: p.y, z: p.z, age: 0 });
  if (arr.length > 48) arr.shift();
}

function drawContrails() {
  const gl = GL.gl;
  const prog = GL.prog.line;
  gl.useProgram(prog.p);
  gl.uniformMatrix4fv(prog.u.uViewProj, false, GL.viewProj);
  gl.uniformMatrix4fv(prog.u.uModel, false, m4());
  gl.uniform3f(prog.u.uCamPos, GL.cam.pos.x, GL.cam.pos.y, GL.cam.pos.z);
  gl.uniform1f(prog.u.uPush, 0.02);
  gl.uniform4f(prog.u.uColor, 0.95, 0.93, 0.90, 1);
  gl.bindVertexArray(GL.trailVAO);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  for (const trail of [Contrails.L, Contrails.R]) {
    if (trail.length < 2) continue;
    const arr = new Float32Array((trail.length - 1) * 2 * 4);
    let n = 0;
    for (let i = 0; i < trail.length - 1; i++) {
      const a = trail[i], b = trail[i + 1];
      const alpha = Math.pow(1 - a.age / 1.0, 1.7) * 0.17;
      arr[n++] = a.x; arr[n++] = a.y; arr[n++] = a.z; arr[n++] = alpha;
      arr[n++] = b.x; arr[n++] = b.y; arr[n++] = b.z; arr[n++] = alpha;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, GL.trailBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, (trail.length - 1) * 2);
  }
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}

function drawSpriteBatch(items, shape, additive) {
  if (!items.length) return;
  const gl = GL.gl;
  const prog = GL.prog.sprite;
  const arr = new Float32Array(items.length * 8);
  for (let i = 0; i < items.length; i++) {
    const s = items[i];
    arr[i * 8] = s.x; arr[i * 8 + 1] = s.y; arr[i * 8 + 2] = s.z;
    arr[i * 8 + 3] = s.size;
    arr[i * 8 + 4] = s.r; arr[i * 8 + 5] = s.g; arr[i * 8 + 6] = s.b; arr[i * 8 + 7] = s.a;
  }
  gl.useProgram(prog.p);
  gl.uniformMatrix4fv(prog.u.uViewProj, false, GL.viewProj);
  gl.uniform1f(prog.u.uPixelScale, GL.h / (2 * Math.tan(GL.cam.fov * 0.5)));
  gl.uniform1f(prog.u.uMaxPoint, 260);
  gl.uniform1i(prog.u.uShape, shape);
  gl.bindVertexArray(GL.spriteVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, GL.spriteBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
  gl.enable(gl.BLEND);
  if (additive) gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.drawArrays(gl.POINTS, 0, items.length);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
}

function drawAircraft(cam, player, view) {
  if (view === 2) return;
  const model = modelMatrix(player.pos, player.quat, 1);
  const dist = vlen(vsub(cam.pos, player.pos));
  const outline = dist < 420;
  drawMesh(Meshes.aircraft, model, {
    outline,
    outlineWidth: 0.18,
    outlineColor: [0.035, 0.03, 0.045, 1],
  });
}

function drawGroundShadow(cam, player) {
  const g = groundAt(player.pos.x, player.pos.z);
  if (player.pos.y - g > 700) return;
  const t = Math.max(0, player.pos.y - g) * 0.15;
  const sx = player.pos.x - SUN.x * t;
  const sz = player.pos.z - SUN.z * t;
  const sground = groundAt(sx, sz);
  const yaw = player.yaw;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const s = clamp(1 - (player.pos.y - g) / 900, 0.55, 1);
  const model = new Float32Array([
    c * s, 0, -sn * s, 0,
    0, 0.0001, 0, 0,
    sn * s, 0, c * s, 0,
    sx, sground + 1.4, sz, 1,
  ]);
  const gl = GL.gl;
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  drawMesh(Meshes.shadow, model, {
    outline: false,
    override: [0.05, 0.03, 0.06, 1],
    alpha: 0.42 * s,
  });
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function drawFlames(cam, player, ab) {
  const items = [];
  const q = player.quat;
  const t = GL.time;
  const inten = 0.35 + ab * 0.65;
  for (const sx of [-1, 1]) {
    const nozzle = localToWorld(player, { x: sx * 1.02, y: 0.1, z: 9.4 });
    const back = qRot(q, { x: 0, y: 0, z: 1 });
    for (let i = 0; i < 3; i++) {
      const wob = Math.sin(t * 40 + i * 2.1 + sx) * 0.15;
      const p = vadd(nozzle, vmul(back, (0.35 + i * 0.75) * (0.6 + ab * 0.9)));
      const size = (1.0 - i * 0.22) * (1.3 + ab * 2.2) * (0.9 + wob);
      items.push({
        x: p.x, y: p.y + wob * 0.2, z: p.z, size,
        r: 1.0, g: 0.55 - i * 0.12, b: 0.16, a: (0.55 - i * 0.12) * inten,
      });
    }
    const core = vadd(nozzle, vmul(back, 0.5 + ab * 0.8));
    items.push({ x: core.x, y: core.y, z: core.z, size: 0.75 + ab * 0.9, r: 1.0, g: 0.95, b: 0.82, a: 0.85 * inten });
    const glow = vadd(nozzle, vmul(back, -0.1));
    items.push({ x: glow.x, y: glow.y, z: glow.z, size: 2.2 + ab * 1.2, r: 1.0, g: 0.42, b: 0.12, a: 0.30 * inten });
  }
  drawSpriteBatch(items, 0, true);
}
