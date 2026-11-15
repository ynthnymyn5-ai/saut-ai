"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

/** A soft caramel glow behind the subject, so a dark object reads against a dark stage. */
export function Halo({ color = "#c08a5b", intensity = 0.55, ...rest }: { color?: string; intensity?: number } & JSX.IntrinsicElements["mesh"]) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
        fragmentShader: `uniform vec3 uColor; uniform float uI,uTime; varying vec2 vUv;
          void main(){ float d=length(vUv-.5)*2.; float a=pow(max(0.,1.-d),2.4)*uI*(.9+.1*sin(uTime*.7));
          gl_FragColor=vec4(uColor*a,a); }`,
      }),
    [color, intensity],
  );
  useFrame((_, dt) => (mat.uniforms.uTime.value += dt));
  return (
    <mesh material={mat} {...rest}>
      <planeGeometry />
    </mesh>
  );
}
