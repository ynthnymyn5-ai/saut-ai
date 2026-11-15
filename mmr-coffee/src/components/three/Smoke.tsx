"use client";
import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { noise3 } from "./shaders";

/** Rising steam: a few billboarded noise wisps, additive and soft. */
export function Smoke({ count = 3, height = 3, width = 1.4, position = [0, 0, 0] as [number, number, number], opacity = 0.35 }) {
  const mats = useMemo(
    () =>
      Array.from({ length: count }, (_, i) =>
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { uTime: { value: i * 7.3 }, uSeed: { value: i * 1.7 }, uOpacity: { value: opacity } },
          vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
          fragmentShader: `
            uniform float uTime,uSeed,uOpacity; varying vec2 vUv;
            ${noise3}
            void main(){
              vec2 uv=vUv;
              float sway=snoise(vec3(uv.y*1.4,uTime*.15,uSeed))*.22*uv.y;
              uv.x+=sway;
              float n=fbm(vec3(uv.x*2.2,uv.y*1.6-uTime*.22,uSeed+uTime*.05));
              float column=smoothstep(.5,.0,abs(uv.x-.5)*(1.6-uv.y*.9));
              float fade=smoothstep(0.,.18,uv.y)*smoothstep(1.,.45,uv.y);
              float a=clamp(column*fade*(n*.9+.35),0.,1.);
              a=pow(a,1.6)*uOpacity;
              gl_FragColor=vec4(vec3(.95,.9,.84)*a,a);
            }`,
        }),
      ),
    [count, opacity],
  );
  useFrame((_, dt) => mats.forEach((m) => (m.uniforms.uTime.value += dt)));
  return (
    <group position={position}>
      {mats.map((m, i) => (
        <Billboard key={i} position={[(i - (count - 1) / 2) * 0.18, height / 2, 0]}>
          <mesh material={m}>
            <planeGeometry args={[width, height]} />
          </mesh>
        </Billboard>
      ))}
    </group>
  );
}
