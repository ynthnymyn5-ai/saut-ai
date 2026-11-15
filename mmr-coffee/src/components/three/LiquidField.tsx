"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { motionState } from "@/lib/scroll";
import { noise3 } from "./shaders";
import { GoldDust } from "./GoldDust";

/** Full-bleed liquid coffee: domain-warped flow with caramel streaks that bend around the pointer. */
export function LiquidField({ lite }: { lite: boolean }) {
  const { viewport } = useThree();
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() }, uAspect: { value: 1 } }),
    [],
  );
  useFrame((_, dt) => {
    uniforms.uTime.value += dt;
    uniforms.uMouse.value.lerp(new THREE.Vector2(motionState.pointer.x, motionState.pointer.y), 0.05);
    uniforms.uAspect.value = viewport.width / viewport.height;
  });
  return (
    <>
      <mesh position={[0, 0, -2]} scale={[viewport.width * 1.6, viewport.height * 1.6, 1]}>
        <planeGeometry />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`}
          fragmentShader={`
            uniform float uTime,uAspect; uniform vec2 uMouse; varying vec2 vUv;
            ${noise3}
            void main(){
              vec2 p=(vUv-.5)*vec2(uAspect,1.)*2.2;
              vec2 m=uMouse*vec2(uAspect,1.)*1.4;
              float d=length(p-m);
              p+= (p-m)*.35*exp(-d*d*1.8);
              float t=uTime*.07;
              vec2 q=vec2(fbm(vec3(p,t)),fbm(vec3(p+5.2,t)));
              vec2 r=vec2(fbm(vec3(p+3.*q+vec2(1.7,9.2),t*1.3)),fbm(vec3(p+3.*q+vec2(8.3,2.8),t*1.3)));
              float f=fbm(vec3(p+3.*r,t*.6));
              vec3 deep=vec3(.03,.018,.012), brown=vec3(.16,.085,.045), caramel=vec3(.75,.5,.3), gold=vec3(.84,.7,.48);
              vec3 col=mix(deep,brown,smoothstep(-.4,.5,f));
              col=mix(col,caramel,smoothstep(.35,.85,length(q))*.55);
              col+=gold*pow(smoothstep(.5,1.,r.x*.5+.5),6.)*.6;
              float vig=smoothstep(1.5,.2,length((vUv-.5)*vec2(1.3,1.)));
              col*=.35+.65*vig;
              gl_FragColor=vec4(col,1.);
              #include <colorspace_fragment>
            }`}
        />
      </mesh>
      <GoldDust count={lite ? 160 : 420} spread={[14, 8, 4]} size={1.1} />
    </>
  );
}
