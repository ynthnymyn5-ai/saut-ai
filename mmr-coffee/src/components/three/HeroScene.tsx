"use client";
import { ContactShadows, Float } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { motionState } from "@/lib/scroll";
import { Beans } from "./Beans";
import { Cup } from "./Cup";
import { GoldDust } from "./GoldDust";
import { LiquidRibbon } from "./LiquidRibbon";
import { Smoke } from "./Smoke";
import { Studio } from "./Studio";
import { Halo } from "./Halo";

const easeOutExpo = (x: number) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

/** Hero: a monumental floating cup, orbiting beans, a slow-motion coffee ribbon, steam and gold dust. */
export function HeroScene({ started, lite, reduced }: { started: boolean; lite: boolean; reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const cup = useRef<THREE.Group>(null);
  const intro = useRef(reduced ? 1 : 0);
  const { camera, size } = useThree();
  const look = useMemo(() => new THREE.Vector3(), []);
  const narrow = size.width < 700;

  useFrame((_, dt) => {
    if (started && intro.current < 1) intro.current = Math.min(1, intro.current + dt / 4.2);
    const k = easeOutExpo(intro.current);
    const scroll = Math.min(1.5, window.scrollY / window.innerHeight);
    const { x: px, y: py } = motionState.pointer;

    // Cinematic dolly: from high above, swinging down and around to eye level.
    const ang = (1 - k) * 1.4;
    const dist = THREE.MathUtils.lerp(19, narrow ? 11.5 : 8.6, k) + scroll * 2;
    const height = THREE.MathUtils.lerp(11, 2.5, k) - scroll * 1.2;
    camera.position.set(Math.sin(ang) * dist + px * 0.35, height + py * 0.25, Math.cos(ang) * dist);
    look.set(0, THREE.MathUtils.lerp(-1.5, narrow ? 0.7 : 0.15, k) - scroll * 1.6, 0);
    camera.lookAt(look);

    if (group.current) {
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, px * 0.25, 0.04);
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, -py * 0.12, 0.04);
      group.current.position.y = -scroll * 1.4;
    }
    if (cup.current) cup.current.rotation.y += dt * (reduced ? 0.02 : 0.12);
  });

  return (
    <>
      <color attach="background" args={["#070605"]} />
      <fog attach="fog" args={["#070605", 10, 26]} />
      <Studio />
      <Halo position={[0, 0.2, -3.5]} scale={9} />
      <group ref={group}>
        <Float speed={reduced ? 0 : 1.2} rotationIntensity={0.15} floatIntensity={0.5}>
          <group ref={cup} position={[0, -0.75, 0]} scale={1.25}>
            <Cup rotation={[0.06, 0, 0]} />
            {!lite && <LiquidRibbon y={0.7} speed={reduced ? 0.2 : 1} droplets={lite ? 10 : 26} />}
            <Smoke position={[0, 1.35, 0]} count={lite ? 2 : 3} height={2.8} opacity={0.32} />
          </group>
        </Float>
        <Beans count={lite ? 26 : 64} radius={narrow ? 2.6 : 3.4} />
        <GoldDust count={lite ? 220 : 650} spread={[16, 10, 10]} />
      </group>
      <ContactShadows position={[0, -2.25, 0]} opacity={0.65} scale={10} blur={2.6} far={4} color="#000000" frames={lite ? 1 : Infinity} />
    </>
  );
}
