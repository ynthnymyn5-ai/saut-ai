import * as THREE from "three";

let beanCache: THREE.BufferGeometry | null = null;

/** A coffee bean: an elongated ellipsoid, one face flattened, with an S-shaped centre crease. */
export function beanGeometry(detail = 40): THREE.BufferGeometry {
  if (beanCache) return beanCache;
  const g = new THREE.SphereGeometry(1, detail, Math.round(detail * 0.75));
  const p = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let x = v.x * 0.64;
    const y = v.y * 0.86;
    let z = v.z * 0.46;
    if (z > 0) z *= 0.55; // flat side
    // S-curve crease along the flat side
    const cx = 0.1 * Math.sin(y * 3.2);
    const d = x - cx;
    const groove = Math.exp(-(d * d) / 0.0045) * (1 - Math.pow(Math.abs(v.y), 6));
    if (v.z > 0) z -= 0.2 * groove;
    // slight asymmetry so beans don't look machined
    x *= 1 + 0.04 * Math.sin(y * 5.0);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  beanCache = g;
  return g;
}

const lathe = (pts: [number, number][], seg = 96) =>
  new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

/** Tulip-shaped espresso/cappuccino cup, with wall thickness. */
export function cupGeometry() {
  return lathe([
    [0, 0.0], [0.5, 0.0], [0.58, 0.03], [0.62, 0.1],
    [0.72, 0.45], [0.86, 0.9], [0.96, 1.22], [1.0, 1.33],
    [0.99, 1.37], [0.95, 1.36],
    [0.92, 1.26], [0.83, 0.94], [0.69, 0.5], [0.57, 0.2], [0, 0.16],
  ]);
}
/** Coffee level inside the cup and its radius at that height */
export const CUP_COFFEE_Y = 1.17;
export const CUP_COFFEE_R = 0.885;

export function saucerGeometry() {
  return lathe([
    [0, 0.0], [1.2, 0.0], [1.5, 0.05], [1.66, 0.14], [1.68, 0.18],
    [1.62, 0.17], [1.45, 0.11], [0.75, 0.07], [0.68, 0.1], [0.62, 0.11], [0, 0.11],
  ]);
}

export function handleGeometry() {
  const g = new THREE.TorusGeometry(0.3, 0.065, 24, 64, Math.PI * 1.3);
  g.rotateZ(-Math.PI * 0.65);
  return g;
}

/** Highball glass, open top, thin walls. */
export function glassGeometry(h = 2.6, r = 0.8) {
  return lathe([
    [0, 0], [r * 0.92, 0], [r * 0.95, 0.12], [r, h], [r - 0.04, h], [r * 0.9, 0.2], [0, 0.18],
  ], 72);
}

/** Cold brew bottle silhouette */
export function bottleGeometry() {
  return lathe([
    [0, 0], [0.62, 0], [0.66, 0.06], [0.68, 0.2], [0.68, 1.9], [0.6, 2.25], [0.36, 2.6],
    [0.26, 2.9], [0.26, 3.2], [0.29, 3.24], [0.29, 3.34], [0, 3.34],
  ], 72);
}

/** Reserve tin */
export function tinGeometry() {
  return lathe([
    [0, 0], [0.82, 0], [0.86, 0.04], [0.86, 2.0], [0.84, 2.04], [0, 2.04],
  ], 96);
}
