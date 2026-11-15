"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

/** Drifting champagne-gold particles that twinkle and rise slowly. */
export function GoldDust({ count = 600, spread = [12, 8, 8] as [number, number, number], size = 1, color = "#e9cf9c" }) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread[0];
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread[1];
      pos[i * 3 + 2] = (Math.random() - 0.5) * spread[2];
      rnd[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: size }, uH: { value: spread[1] }, uColor: { value: new THREE.Color(color) }, uDpr: { value: 1 } },
      vertexShader: `
        uniform float uTime,uSize,uH,uDpr; attribute float aRnd; varying float vTw;
        void main(){
          vec3 p=position;
          p.y=mod(p.y+uTime*(.08+aRnd*.12)+uH*.5,uH)-uH*.5;
          p.x+=sin(uTime*.3+aRnd*30.)*.15;
          vec4 mv=modelViewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*mv;
          vTw=.4+.6*pow(sin(uTime*(1.+aRnd*2.)+aRnd*40.)*.5+.5,3.);
          gl_PointSize=uSize*uDpr*(1.+aRnd*3.)*(10./-mv.z);
        }`,
      fragmentShader: `
        uniform vec3 uColor; varying float vTw;
        void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard;
          float a=pow(1.-d*2.,2.)*vTw; gl_FragColor=vec4(uColor*a,a); }`,
    });
    return { geo: g, mat: m };
  }, [count, spread, size, color]);
  useFrame((state, dt) => {
    mat.uniforms.uTime.value += dt;
    mat.uniforms.uDpr.value = state.viewport.dpr;
  });
  return <points geometry={geo} material={mat} />;
}
