"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { motionState } from "@/lib/scroll";
import { Beans } from "./Beans";
import { Cup } from "./Cup";
import { GoldDust } from "./GoldDust";
import { Smoke } from "./Smoke";
import { Studio } from "./Studio";
import { Halo } from "./Halo";
import { ColdBrewBottle, ReserveTin } from "./Vessels";
import { products } from "@/lib/data";

const GOLD_BEAN = new THREE.Color("#c9a062");

/** One product on stage at a time, lit like a fragrance campaign; drag to rotate. */
export function CollectionScene({ active, drag, lite }: { active: number; drag: { current: number }; lite: boolean }) {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const presence = useRef<number[]>(products.map((_, i) => (i === active ? 1 : 0)));
  const spin = useRef(0);
  const keyLight = useRef<THREE.SpotLight>(null);
  const colors = useMemo(() => products.map((p) => new THREE.Color(p.hue)), []);

  useFrame((state, dt) => {
    spin.current += dt * 0.25;
    refs.current.forEach((g, i) => {
      if (!g) return;
      const target = i === active ? 1 : 0;
      presence.current[i] = THREE.MathUtils.damp(presence.current[i], target, 3.2, dt);
      const pr = presence.current[i];
      g.visible = pr > 0.002;
      const out = 1 - pr;
      g.scale.setScalar(0.0001 + pr);
      g.position.y = -out * 2.5 + Math.sin(state.clock.elapsedTime * 0.8) * 0.06;
      g.rotation.y = spin.current + drag.current + out * Math.PI * 1.5 * (i % 2 ? 1 : -1);
      g.rotation.x = -motionState.pointer.y * 0.12;
      g.rotation.z = motionState.pointer.x * -0.05;
    });
    if (keyLight.current) keyLight.current.color.lerp(colors[active], 0.04);
  });

  const set = (i: number) => (el: THREE.Group | null) => {
    refs.current[i] = el;
  };
  return (
    <>
      <Studio intensity={0.9} />
      <spotLight ref={keyLight} position={[0, 5, -4]} angle={0.7} penumbra={1} intensity={120} />
      <group position={[0, -0.75, 0]}>
        <group ref={set(0)}>
          <Cup scale={0.95} />
          <Smoke position={[0, 1.3, 0]} count={2} height={2.2} opacity={0.25} />
        </group>
        <group ref={set(1)}>
          <Cup scale={0.95} body="#ebe2d4" roughness={0.3} art foam="#c9935f" />
          <Smoke position={[0, 1.3, 0]} count={2} height={2.2} opacity={0.22} />
        </group>
        <group ref={set(2)}>
          <ReserveTin position={[0, 0, 0]} scale={0.95} />
          <group position={[0, 1.2, 0]}>
            <Beans count={lite ? 10 : 18} radius={1.7} color={GOLD_BEAN} />
          </group>
        </group>
        <group ref={set(3)}>
          <ColdBrewBottle scale={0.78} />
        </group>
      </group>
      <Halo position={[0, -0.76, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={3.6} color="#000000" intensity={0.85} shadow />
      <GoldDust count={lite ? 120 : 300} spread={[10, 6, 6]} size={0.8} />
    </>
  );
}
