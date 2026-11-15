"use client";
import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { bottleGeometry, glassGeometry, tinGeometry } from "./geometry";
import { Crema } from "./Crema";

const DISPLAY = "/fonts/syne-700.woff";
const MONO = "/fonts/mono-400.woff";

export const glassMaterial = () =>
  new THREE.MeshPhysicalMaterial({
    color: "#fff6ea",
    roughness: 0.03,
    metalness: 0.1,
    transparent: true,
    opacity: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 3,
  });

/**
 * Transparent glass that fills as `fill` (0..1) rises: espresso layer over milk,
 * a pour stream from above while filling, and a moving crema surface.
 */
export function PourGlass({ fill, layered = true, ...rest }: { fill: { current: number }; layered?: boolean } & JSX.IntrinsicElements["group"]) {
  const H = 2.6, R = 0.8;
  const geo = useMemo(() => glassGeometry(H, R), []);
  const glass = useMemo(glassMaterial, []);
  const milk = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#e9dcc7", roughness: 0.35, sheen: 1, sheenColor: new THREE.Color("#fff4e0") }), []);
  const coffee = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#4a2410", roughness: 0.2, clearcoat: 1, sheen: 0.6, sheenColor: new THREE.Color("#c08a5b") }), []);
  const stream = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#3a1b0b", roughness: 0.05, clearcoat: 1 }), []);
  const liquid = useRef<THREE.Group>(null);
  const coffeeLayer = useRef<THREE.Mesh>(null);
  const milkLayer = useRef<THREE.Mesh>(null);
  const top = useRef<THREE.Group>(null);
  const pour = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const f = THREE.MathUtils.clamp(fill.current, 0, 1);
    const t = state.clock.elapsedTime;
    const level = 0.2 + f * (H - 0.55);
    const milkH = layered ? Math.min(level - 0.2, 1.05) : 0;
    if (milkLayer.current) {
      milkLayer.current.visible = layered && milkH > 0.01;
      milkLayer.current.scale.y = Math.max(0.001, milkH);
      milkLayer.current.position.y = 0.2 + milkH / 2;
    }
    const cH = Math.max(0.001, level - 0.2 - milkH);
    if (coffeeLayer.current) {
      coffeeLayer.current.visible = cH > 0.01;
      coffeeLayer.current.scale.y = cH;
      coffeeLayer.current.position.y = 0.2 + milkH + cH / 2;
    }
    if (top.current) {
      top.current.position.y = level;
      top.current.visible = f > 0.02;
      const r = R * 0.92 + (R - R * 0.92) * (level / H) - 0.04;
      top.current.scale.setScalar(r / 0.75);
    }
    if (pour.current) {
      const active = f > 0.01 && f < 0.98;
      pour.current.visible = active;
      const len = 3.6 - level;
      pour.current.scale.set(1 + Math.sin(t * 12) * 0.08, len, 1);
      pour.current.position.y = level + len / 2;
    }
    if (liquid.current) liquid.current.rotation.y = Math.sin(t * 0.8) * 0.05;
  });

  return (
    <group {...rest}>
      <group ref={liquid}>
        <mesh ref={milkLayer} material={milk}>
          <cylinderGeometry args={[R * 0.86, R * 0.84, 1, 48]} />
        </mesh>
        <mesh ref={coffeeLayer} material={coffee}>
          <cylinderGeometry args={[R * 0.88, R * 0.86, 1, 48]} />
        </mesh>
        <group ref={top}>
          <Crema radius={0.75} y={0} foam="#b9804c" speed={1.6} />
        </group>
      </group>
      <mesh ref={pour} material={stream}>
        <cylinderGeometry args={[0.05, 0.04, 1, 16]} />
      </mesh>
      <mesh geometry={geo} material={glass} renderOrder={2} />
    </group>
  );
}

export function ColdBrewBottle(props: JSX.IntrinsicElements["group"]) {
  const geo = useMemo(bottleGeometry, []);
  const glass = useMemo(() => {
    const m = glassMaterial();
    m.color = new THREE.Color("#5a2c12");
    m.opacity = 0.82;
    m.depthWrite = true;
    m.side = THREE.FrontSide;
    return m;
  }, []);
  const label = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0d0b0a", roughness: 0.8 }), []);
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d6b37a", metalness: 1, roughness: 0.25 }), []);
  return (
    <group {...props}>
      <mesh geometry={geo} material={glass} />
      <mesh position={[0, 1.15, 0]} material={label}>
        <cylinderGeometry args={[0.695, 0.695, 1.05, 72, 1, true]} />
      </mesh>
      <mesh position={[0, 0.66, 0]} material={gold}>
        <cylinderGeometry args={[0.7, 0.7, 0.03, 72, 1, true]} />
      </mesh>
      <mesh position={[0, 1.64, 0]} material={gold}>
        <cylinderGeometry args={[0.7, 0.7, 0.03, 72, 1, true]} />
      </mesh>
      <Text font={DISPLAY} position={[0, 1.25, 0.71]} fontSize={0.26} letterSpacing={0.3} color="#d6b37a" anchorX="center" anchorY="middle">
        MMR
      </Text>
      <Text font={MONO} position={[0, 0.95, 0.71]} fontSize={0.07} letterSpacing={0.4} color="#efe6d8" anchorX="center" anchorY="middle">
        COLD BREW · 18H
      </Text>
      <mesh position={[0, 3.29, 0]} material={gold}>
        <cylinderGeometry args={[0.3, 0.3, 0.12, 48]} />
      </mesh>
    </group>
  );
}

export function ReserveTin(props: JSX.IntrinsicElements["group"]) {
  const geo = useMemo(tinGeometry, []);
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: "#cfa968", metalness: 1, roughness: 0.18 }), []);
  const matte = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0d0b0a", metalness: 0.4, roughness: 0.5 }), []);
  return (
    <group {...props}>
      <mesh geometry={geo} material={gold} />
      <mesh position={[0, 1.0, 0]} material={matte}>
        <cylinderGeometry args={[0.865, 0.865, 1.1, 96, 1, true]} />
      </mesh>
      <mesh position={[0, 2.1, 0]} material={gold}>
        <cylinderGeometry args={[0.88, 0.88, 0.18, 96]} />
      </mesh>
      <Text font={DISPLAY} position={[0, 1.12, 0.875]} fontSize={0.3} letterSpacing={0.3} color="#d6b37a" anchorX="center" anchorY="middle">
        MMR
      </Text>
      <Text font={MONO} position={[0, 0.82, 0.875]} fontSize={0.07} letterSpacing={0.5} color="#efe6d8" anchorX="center" anchorY="middle">
        GOLD RESERVE · LOT 07
      </Text>
    </group>
  );
}

/** Slowly spinning ice cubes for cold drinks */
export function Ice({ count = 4, radius = 0.4, y = 1.5 }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => {
    const m = glassMaterial();
    m.roughness = 0.15;
    return m;
  }, []);
  useFrame((s) => {
    if (ref.current) ref.current.children.forEach((c, i) => (c.rotation.set(s.clock.elapsedTime * 0.2 + i, i * 1.3, s.clock.elapsedTime * 0.1)));
  });
  return (
    <group ref={ref}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i} material={mat} position={[Math.cos(i * 2.1) * radius, y + i * 0.35, Math.sin(i * 2.1) * radius]}>
          <boxGeometry args={[0.38, 0.38, 0.38]} />
        </mesh>
      ))}
    </group>
  );
}
