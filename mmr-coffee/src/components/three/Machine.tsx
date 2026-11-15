"use client";
import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/** A sculptural single-group espresso machine. `flow` (0..1) drives the twin espresso streams. */
export function Machine({ flow, ...rest }: { flow: { current: number } } & JSX.IntrinsicElements["group"]) {
  const mats = useMemo(
    () => ({
      body: new THREE.MeshPhysicalMaterial({ color: "#0b0a09", roughness: 0.42, metalness: 0.3, clearcoat: 0.5 }),
      chrome: new THREE.MeshStandardMaterial({ color: "#e8e2d8", metalness: 1, roughness: 0.12 }),
      gold: new THREE.MeshStandardMaterial({ color: "#d6b37a", metalness: 1, roughness: 0.25 }),
      wood: new THREE.MeshStandardMaterial({ color: "#3a2416", roughness: 0.55 }),
      stream: new THREE.MeshPhysicalMaterial({ color: "#2c1408", roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.95 }),
      glow: new THREE.MeshBasicMaterial({ color: "#f2c98a" }),
    }),
    [],
  );
  const s1 = useRef<THREE.Mesh>(null);
  const s2 = useRef<THREE.Mesh>(null);
  const gauge = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const f = flow.current;
    const t = state.clock.elapsedTime;
    [s1, s2].forEach((r, i) => {
      if (!r.current) return;
      r.current.visible = f > 0.02;
      r.current.scale.set(0.6 + 0.4 * Math.sin(t * 9 + i), Math.max(0.001, f), 0.6 + 0.4 * Math.cos(t * 7 + i));
    });
    if (gauge.current) gauge.current.rotation.z = -0.6 - f * 1.6 + Math.sin(t * 6) * 0.03 * f;
  });
  return (
    <group {...rest}>
      {/* base + drip tray */}
      <RoundedBox args={[3.2, 0.35, 2.2]} radius={0.12} position={[0, 0.175, 0]} material={mats.body} castShadow receiveShadow />
      <mesh position={[0, 0.37, 0.25]} material={mats.chrome}>
        <boxGeometry args={[1.6, 0.04, 1.1]} />
      </mesh>
      {/* tower */}
      <RoundedBox args={[3.2, 2.6, 1.3]} radius={0.18} position={[0, 2.25, -0.45]} material={mats.body} castShadow />
      {/* top plate */}
      <RoundedBox args={[3.3, 0.12, 2.2]} radius={0.05} position={[0, 3.6, 0]} material={mats.chrome} />
      {/* gold signature band */}
      <mesh position={[0, 3.25, 0.21]} material={mats.gold}>
        <boxGeometry args={[3.0, 0.05, 0.02]} />
      </mesh>
      {/* group head */}
      <mesh position={[0, 2.15, 0.45]} material={mats.chrome} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.42, 0.48, 0.5, 48]} />
      </mesh>
      {/* portafilter */}
      <group position={[0, 1.8, 0.5]}>
        <mesh material={mats.chrome}>
          <cylinderGeometry args={[0.45, 0.38, 0.28, 48]} />
        </mesh>
        <mesh position={[0, -0.05, 0.95]} rotation={[Math.PI / 2 - 0.1, 0, 0]} material={mats.wood}>
          <cylinderGeometry args={[0.08, 0.1, 1.3, 24]} />
        </mesh>
        <mesh position={[0, -0.22, 0]} material={mats.chrome}>
          <cylinderGeometry args={[0.1, 0.06, 0.18, 24]} />
        </mesh>
      </group>
      {/* streams */}
      <mesh ref={s1} position={[-0.06, 1.57, 0.5]} material={mats.stream}>
        <cylinderGeometry args={[0.022, 0.016, 1.1, 12]} />
      </mesh>
      <mesh ref={s2} position={[0.06, 1.57, 0.5]} material={mats.stream}>
        <cylinderGeometry args={[0.022, 0.016, 1.1, 12]} />
      </mesh>
      {/* pressure gauge */}
      <group position={[-1.05, 2.75, 0.21]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.chrome}>
          <cylinderGeometry args={[0.28, 0.28, 0.06, 48]} />
        </mesh>
        <mesh position={[0, 0, 0.035]} material={new THREE.MeshStandardMaterial({ color: "#efe6d8", roughness: 0.6 })}>
          <circleGeometry args={[0.24, 48]} />
        </mesh>
        <mesh ref={gauge} position={[0, 0, 0.04]} material={mats.gold}>
          <boxGeometry args={[0.02, 0.2, 0.01]} />
        </mesh>
      </group>
      {/* steam wand */}
      <mesh position={[1.25, 2.0, 0.35]} rotation={[0.25, 0, 0.15]} material={mats.chrome}>
        <cylinderGeometry args={[0.04, 0.04, 1.6, 16]} />
      </mesh>
      {/* status light */}
      <mesh position={[1.05, 2.75, 0.22]} material={mats.glow}>
        <circleGeometry args={[0.05, 24]} />
      </mesh>
      {/* espresso cup on tray */}
      <group position={[0, 0.4, 0.5]} scale={0.32}>
        <mesh material={mats.body}>
          <cylinderGeometry args={[0.95, 0.65, 1.2, 48, 1, true]} />
        </mesh>
        <mesh position={[0, -0.6, 0]} rotation={[-Math.PI / 2, 0, 0]} material={mats.body}>
          <circleGeometry args={[0.65, 48]} />
        </mesh>
        <mesh position={[0, 0.6, 0]} rotation={[Math.PI / 2, 0, 0]} material={mats.gold}>
          <torusGeometry args={[0.95, 0.03, 10, 64]} />
        </mesh>
      </group>
    </group>
  );
}
