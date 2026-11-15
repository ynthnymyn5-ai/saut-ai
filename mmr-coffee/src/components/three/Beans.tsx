"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { beanGeometry } from "./geometry";

export type BeanMode = (state: { t: number; i: number; seed: BeanSeed; out: THREE.Object3D; color: THREE.Color }) => void;
export type BeanSeed = { r: number; a: number; y: number; sp: number; spin: THREE.Vector3; s: number; rnd: number };

const ROASTED = new THREE.Color("#3b1f12");

/** Instanced coffee beans. Pass `mode` to drive per-bean placement and colour every frame. */
export function Beans({ count = 60, mode, radius = 3, color = ROASTED, glossy = true }: { count?: number; mode?: BeanMode; radius?: number; color?: THREE.Color; glossy?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const geo = useMemo(() => beanGeometry(), []);
  const mat = useMemo(
    () => new THREE.MeshPhysicalMaterial({ roughness: glossy ? 0.32 : 0.6, clearcoat: glossy ? 0.7 : 0.1, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new THREE.Color("#a0683f") }),
    [glossy],
  );
  const seeds = useMemo<BeanSeed[]>(
    () =>
      Array.from({ length: count }, () => ({
        r: radius * (0.65 + Math.random() * 0.7),
        a: Math.random() * Math.PI * 2,
        y: (Math.random() - 0.5) * 3,
        sp: (0.08 + Math.random() * 0.12) * (Math.random() > 0.15 ? 1 : -1),
        spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(),
        s: 0.16 + Math.random() * 0.1,
        rnd: Math.random(),
      })),
    [count, radius],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < count; i++) ref.current.setColorAt(i, color);
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [count, color]);

  useFrame((state) => {
    const m = ref.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const sd = seeds[i];
      c.copy(color);
      if (mode) mode({ t, i, seed: sd, out: dummy, color: c });
      else {
        const a = sd.a + t * sd.sp;
        dummy.position.set(Math.cos(a) * sd.r, sd.y + Math.sin(t * 0.6 + sd.rnd * 9) * 0.25, Math.sin(a) * sd.r);
        dummy.rotation.set(t * sd.spin.x * 0.6 + sd.rnd * 6, t * sd.spin.y * 0.5, t * sd.spin.z * 0.4);
        dummy.scale.setScalar(sd.s);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (mode) m.setColorAt(i, c);
    }
    m.instanceMatrix.needsUpdate = true;
    if (mode && m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return <instancedMesh ref={ref} args={[geo, mat, count]} castShadow frustumCulled={false} />;
}

/** One hero bean (used for the footer emblem and story sculpture). */
export function Bean({ material, ...rest }: { material: THREE.Material } & JSX.IntrinsicElements["mesh"]) {
  const geo = useMemo(() => beanGeometry(64), []);
  return <mesh geometry={geo} material={material} {...rest} />;
}
