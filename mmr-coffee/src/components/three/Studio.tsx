"use client";
import { Environment, Lightformer } from "@react-three/drei";

/** Cinematic studio lighting with procedural reflections (no external HDR download). */
export function Studio({ intensity = 1, warm = "#ffd8a8", rim = "#d6b37a" }) {
  return (
    <>
      <ambientLight intensity={0.12 * intensity} />
      <spotLight position={[-4, 7, 4]} angle={0.45} penumbra={1} intensity={90 * intensity} color={warm} decay={2} />
      <spotLight position={[5, 2, -5]} angle={0.6} penumbra={1} intensity={60 * intensity} color={rim} decay={2} />
      <pointLight position={[0, -2, 4]} intensity={4 * intensity} color="#8a5a3a" />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#050403"]} />
        <Lightformer form="rect" intensity={3} color={warm} position={[-5, 4, 2]} scale={[4, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={2} color={rim} position={[5, 1, -2]} scale={[2, 8, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={1.2} color="#ffffff" position={[0, 6, 0]} scale={3} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.6} color="#5a3a26" position={[0, -4, 3]} scale={[10, 2, 1]} target={[0, 0, 0]} />
      </Environment>
    </>
  );
}
