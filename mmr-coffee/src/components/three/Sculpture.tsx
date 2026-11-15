"use client";
import { Float } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { motionState } from "@/lib/scroll";
import { Bean } from "./Beans";
import { GoldDust } from "./GoldDust";
import { Studio } from "./Studio";

/** A monumental pair of beans, gold and espresso, orbited by a hairline ring. */
export function Sculpture({ drag }: { drag: { current: number } }) {
  const g = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const mats = useMemo(
    () => ({
      gold: new THREE.MeshStandardMaterial({ color: "#d6b37a", metalness: 1, roughness: 0.2 }),
      roast: new THREE.MeshPhysicalMaterial({ color: "#2e180c", roughness: 0.35, clearcoat: 0.8, sheen: 0.5, sheenColor: new THREE.Color("#a0683f") }),
      line: new THREE.MeshBasicMaterial({ color: "#d6b37a", transparent: true, opacity: 0.6 }),
    }),
    [],
  );
  useFrame((_, dt) => {
    if (g.current) {
      g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, drag.current + motionState.pointer.x * 0.4, 4, dt);
      g.current.rotation.x = THREE.MathUtils.damp(g.current.rotation.x, -motionState.pointer.y * 0.25, 4, dt);
    }
    if (ring.current) ring.current.rotation.z += dt * 0.1;
  });
  return (
    <>
      <color attach="background" args={["#0e0907"]} />
      <Studio intensity={1.1} />
      <group ref={g}>
        <Float speed={1} floatIntensity={0.6} rotationIntensity={0.3}>
          <Bean material={mats.gold} scale={1.55} position={[-0.75, 0.2, 0]} rotation={[0.3, 0.6, 0.5]} />
          <Bean material={mats.roast} scale={1.4} position={[0.85, -0.25, -0.4]} rotation={[-0.4, -2.4, -0.3]} />
        </Float>
        <mesh ref={ring} rotation={[1.2, 0.2, 0]} material={mats.line}>
          <torusGeometry args={[2.5, 0.006, 6, 220]} />
        </mesh>
      </group>
      <GoldDust count={200} spread={[8, 6, 6]} size={0.9} />
    </>
  );
}

export function FooterBean() {
  const ref = useRef<THREE.Group>(null);
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d6b37a", metalness: 1, roughness: 0.18 }), []);
  useFrame((s) => {
    if (!ref.current) return;
    ref.current.rotation.y = s.clock.elapsedTime * 0.6;
    ref.current.rotation.z = Math.sin(s.clock.elapsedTime * 0.7) * 0.3;
    ref.current.position.y = Math.sin(s.clock.elapsedTime * 1.1) * 0.08;
  });
  return (
    <>
      <Studio intensity={1.2} />
      <group ref={ref}>
        <Bean material={gold} scale={1.2} rotation={[0.4, 0, 0.3]} />
      </group>
    </>
  );
}
