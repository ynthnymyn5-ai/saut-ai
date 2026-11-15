"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { motionState } from "@/lib/scroll";
import { Beans, type BeanMode } from "./Beans";
import { GoldDust } from "./GoldDust";
import { Machine } from "./Machine";
import { Studio } from "./Studio";
import { PourGlass } from "./Vessels";

const ss = (a: number, b: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const GREEN = new THREE.Color("#9c9a6b");
const ROAST = new THREE.Color("#3a1e11");
const EMBER = new THREE.Color("#ff8a3d");

const camKeys = [
  { p: [0, 0, 10], l: [0, 0, 0] },
  { p: [2.6, 1.4, 7.2], l: [0, 0.2, 0] },
  { p: [0, 0.9, 8.6], l: [0, 0, 0] },
  { p: [0.9, -0.45, 3.0], l: [0, -0.85, 0.45] },
  { p: [0, 1.9, 7.4], l: [0, 0.0, 1.5] },
].map((k) => ({ p: new THREE.Vector3(...k.p), l: new THREE.Vector3(...k.l) }));
const camStops = [0, 0.24, 0.46, 0.68, 0.9];

/** Five chapters driven by scroll progress: raw beans → roasting vortex → machine → pour → signature. */
export function JourneyScene({ progress, lite }: { progress: { current: number }; lite: boolean }) {
  const { camera, size } = useThree();
  const p = useRef(0);
  const flow = useRef(0);
  const fill = useRef(0);
  const machine = useRef<THREE.Group>(null);
  const glassRig = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const ember = useRef<THREE.PointLight>(null);
  const finale = useRef<THREE.SpotLight>(null);
  const look = useMemo(() => new THREE.Vector3(), []);
  const camPos = useMemo(() => new THREE.Vector3(), []);
  const tmpA = useMemo(() => new THREE.Vector3(), []);
  const tmpB = useMemo(() => new THREE.Vector3(), []);
  const hopper = useMemo(() => new THREE.Vector3(0, 1.7, -0.35), []);
  const haloMat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#d6b37a", transparent: true, opacity: 0 }), []);
  const narrow = size.width < 700;

  const mode: BeanMode = ({ t, seed, out, color }) => {
    const x = p.current;
    const k2 = ss(0.14, 0.3, x), k3 = ss(0.34, 0.5, x), k5 = ss(0.8, 0.93, x);
    // ch1: drifting in the dark
    const a1 = seed.a + t * seed.sp * 0.3;
    tmpA.set(Math.cos(a1) * seed.r * 1.7, seed.y * 1.4 + Math.sin(t * 0.4 + seed.rnd * 10) * 0.3, Math.sin(a1) * seed.r - 1.5);
    // ch2: roasting vortex
    const a2 = seed.a + t * (0.9 + seed.rnd * 0.6);
    const vy = ((seed.rnd * 3.6 + t * 0.35) % 3.6) - 1.8;
    const vr = 0.5 + (vy + 1.8) * 0.55;
    tmpB.set(Math.cos(a2) * vr, vy, Math.sin(a2) * vr);
    out.position.lerpVectors(tmpA, tmpB, k2);
    // ch3: funnel into the machine hopper, staggered
    const kk = THREE.MathUtils.clamp(k3 * 1.7 - seed.rnd * 0.7, 0, 1);
    out.position.lerp(hopper, kk * kk);
    let scale = seed.s * (1 - kk);
    // ch5: re-emerge as a halo of beans around the signature glass
    if (k5 > 0) {
      const a5 = seed.a + t * 0.25;
      const rr = 2.1 + seed.rnd * 0.5;
      tmpA.set(Math.cos(a5) * rr, 0.1 + Math.sin(a5 * 3 + t) * 0.25 + (seed.rnd - 0.5) * 0.6, 1.5 + Math.sin(a5) * rr * 0.6);
      out.position.lerp(tmpA, k5);
      scale = THREE.MathUtils.lerp(scale, seed.s * 0.8, k5);
    }
    out.scale.setScalar(Math.max(0.0001, scale));
    out.rotation.set(t * seed.spin.x * (0.5 + k2 * 2) + seed.rnd * 6, t * seed.spin.y * 0.6, t * seed.spin.z * 0.4);
    color.copy(GREEN).lerp(ROAST, k2);
    const glow = k2 * (1 - k3) * Math.max(0, Math.sin(t * 3 + seed.rnd * 20)) * 0.6;
    color.lerp(EMBER, glow * seed.rnd);
  };

  useFrame((state, dt) => {
    p.current = THREE.MathUtils.damp(p.current, progress.current, 4, dt);
    const x = p.current;
    const k3 = ss(0.34, 0.5, x), k5 = ss(0.8, 0.93, x);
    flow.current = ss(0.48, 0.55, x) * (1 - ss(0.74, 0.8, x));
    fill.current = ss(0.53, 0.76, x);

    // camera along keyed path
    let i = 0;
    while (i < camStops.length - 2 && x > camStops[i + 1]) i++;
    const local = ss(camStops[i], camStops[i + 1], x);
    camPos.lerpVectors(camKeys[i].p, camKeys[i + 1].p, local);
    look.lerpVectors(camKeys[i].l, camKeys[i + 1].l, local);
    if (narrow) camPos.z += 2.2;
    camPos.x += motionState.pointer.x * 0.3;
    camPos.y += motionState.pointer.y * 0.2;
    camera.position.copy(camPos);
    camera.lookAt(look);
    // On wide screens shift the frame so the subject sits right of the chapter text.
    const persp = camera as THREE.PerspectiveCamera;
    const w = size.width, h = size.height;
    if (!narrow) persp.setViewOffset(w, h, -w * 0.17, 0, w, h);
    else if (persp.view) persp.clearViewOffset();

    if (machine.current) {
      machine.current.visible = k3 > 0.001 && k5 < 0.999;
      machine.current.position.y = -1.6 - (1 - k3) * 5 - k5 * 6;
      machine.current.rotation.y = (1 - k3) * -0.8 + Math.sin(state.clock.elapsedTime * 0.2) * 0.04;
    }
    if (glassRig.current) {
      glassRig.current.visible = k3 > 0.6;
      glassRig.current.position.set(0, THREE.MathUtils.lerp(-1.25, -1.35, k5), THREE.MathUtils.lerp(0.45, 1.5, k5));
      glassRig.current.scale.setScalar(THREE.MathUtils.lerp(0.33, 0.62, k5));
      glassRig.current.rotation.y = k5 * state.clock.elapsedTime * 0.3;
    }
    if (halo.current) {
      haloMat.opacity = k5 * 0.9;
      halo.current.visible = k5 > 0.01;
      halo.current.rotation.z += dt * 0.15;
    }
    if (ember.current) ember.current.intensity = ss(0.14, 0.3, x) * (1 - k3) * (18 + Math.sin(state.clock.elapsedTime * 11) * 4);
    if (finale.current) finale.current.intensity = 40 + k5 * 220;
  });

  return (
    <>
      <color attach="background" args={["#070605"]} />
      <fog attach="fog" args={["#070605", 8, 22]} />
      <Studio intensity={0.8} />
      <pointLight ref={ember} position={[0, -1.5, 1]} color="#ff7a2e" intensity={0} distance={8} />
      <spotLight ref={finale} position={[0, 6, 4]} angle={0.35} penumbra={0.9} color="#ffe2b0" intensity={40} target-position={[0, 0, 1.5]} />
      <Beans count={lite ? 50 : 110} mode={mode} radius={3} />
      <group ref={machine} scale={0.9}>
        <Machine flow={flow} />
      </group>
      <group ref={glassRig}>
        <PourGlass fill={fill} />
      </group>
      <mesh ref={halo} position={[0, 0.25, 0.2]} material={haloMat}>
        <torusGeometry args={[2.0, 0.008, 8, 200]} />
      </mesh>
      <GoldDust count={lite ? 180 : 500} spread={[14, 9, 10]} size={0.9} />
    </>
  );
}
