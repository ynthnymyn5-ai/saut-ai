"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { noise3 } from "./shaders";

type Props = { radius: number; y: number; art?: number; base?: string; foam?: string; speed?: number };

/** Animated coffee surface: swirling crema, tiger-striping, slow ripples and a soft specular sheen. */
export function Crema({ radius, y, art = 0, base = "#2b1408", foam = "#c38a55", speed = 1 }: Props) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uArt: { value: art },
      uBase: { value: new THREE.Color(base) },
      uFoam: { value: new THREE.Color(foam) },
    }),
    [art, base, foam],
  );
  useFrame((_, dt) => (uniforms.uTime.value += dt * speed));
  return (
    <mesh position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 96]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={/* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`}
        fragmentShader={/* glsl */ `
          uniform float uTime, uArt; uniform vec3 uBase, uFoam; varying vec2 vUv;
          ${noise3}
          mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
          void main(){
            vec2 p=(vUv-.5)*2.; float r=length(p);
            vec2 q=rot(uTime*.08+r*1.6)*p;
            float n=fbm(vec3(q*2.4,uTime*.06));
            float tiger=smoothstep(.1,.6,fbm(vec3(q*6.,uTime*.04+3.)));
            float ripple=sin(r*38.-uTime*2.2)*.5+.5; ripple*=smoothstep(.95,.2,r)*.06;
            vec3 col=mix(uFoam*.72,uFoam,n*.5+.5);
            col=mix(col,uFoam*1.18,tiger*.35);
            // latte art: heart-like rosette when uArt > 0
            if(uArt>.5){
              vec2 h=p*vec2(1.,1.15)+vec2(0.,.05);
              float heart=pow(abs(h.x),.66)*1.2+h.y;
              float shape=smoothstep(.62,.55,length(vec2(h.x*1.25,heart-0.12)));
              float rings=smoothstep(.3,.7,sin(length(h-vec2(0.,.3))*28.-uTime*.4))*.4;
              col=mix(col,vec3(.96,.92,.85),clamp(shape*(.85+rings),0.,1.));
            }
            col=mix(col,uBase,smoothstep(.72,1.,r)*.85);
            col+=ripple;
            float sheen=pow(max(0.,1.-length(p-vec2(-.35,.4))*1.4),3.)*.35;
            col+=sheen*vec3(1.,.9,.75);
            gl_FragColor=vec4(col,1.);
            #include <colorspace_fragment>
          }`}
      />
    </mesh>
  );
}
