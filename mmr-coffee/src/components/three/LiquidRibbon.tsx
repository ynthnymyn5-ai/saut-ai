"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** A slow-motion ribbon of coffee wrapping around the cup, tapered at both ends, with glossy wobble. */
export function LiquidRibbon({ radius = 1.75, turns = 1.15, thickness = 0.085, color = "#3a1b0b", y = 0.6, speed = 1, droplets = 26 }) {
  const ref = useRef<THREE.Group>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uR: { value: thickness } }), [thickness]);

  const { tube, mat, curve } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = t * Math.PI * 2 * turns;
      const r = radius * (0.85 + 0.25 * Math.sin(t * Math.PI));
      pts.push(new THREE.Vector3(Math.cos(a) * r, y + Math.sin(t * Math.PI * 1.4) * 0.9 - t * 0.4, Math.sin(a) * r));
    }
    const c = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(c, 260, thickness, 20, false);
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.08, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.4, sheenColor: new THREE.Color("#c08a5b") });
    m.onBeforeCompile = (s) => {
      s.uniforms.uTime = uniforms.uTime;
      s.uniforms.uR = uniforms.uR;
      s.vertexShader = s.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime; uniform float uR;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           float u=uv.x;
           float taper=pow(sin(u*3.14159),.7)*(1.+.35*sin(u*18.-uTime*1.4));
           float wob=sin(u*40.-uTime*2.)*.25+sin(u*13.+uTime)*.35;
           transformed+=normal*uR*(taper-1.+wob*.25);`,
        );
    };
    return { tube: g, mat: m, curve: c };
  }, [radius, turns, thickness, color, y, uniforms]);

  const drops = useMemo(
    () =>
      Array.from({ length: droplets }, () => ({
        t: Math.random(),
        off: new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5),
        s: 0.02 + Math.random() * 0.05,
        sp: 0.01 + Math.random() * 0.02,
      })),
    [droplets],
  );
  const inst = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    uniforms.uTime.value += dt * speed;
    if (ref.current) ref.current.rotation.y += dt * 0.05 * speed;
    if (!inst.current) return;
    drops.forEach((d, i) => {
      d.t = (d.t + dt * d.sp * speed) % 1;
      curve.getPointAt(d.t, tmp);
      const drift = Math.sin(d.t * Math.PI) * 1.4;
      dummy.position.set(tmp.x + d.off.x * drift, tmp.y + d.off.y * drift, tmp.z + d.off.z * drift);
      const sc = d.s * Math.sin(d.t * Math.PI);
      dummy.scale.set(sc, sc * 1.25, sc);
      dummy.updateMatrix();
      inst.current!.setMatrixAt(i, dummy.matrix);
    });
    inst.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={ref}>
      <mesh geometry={tube} material={mat} />
      <instancedMesh ref={inst} args={[undefined, undefined, droplets]} material={mat}>
        <sphereGeometry args={[1, 16, 12]} />
      </instancedMesh>
    </group>
  );
}
