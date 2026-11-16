"use client";
import { useEffect, useRef } from "react";

/** 0 voice orb · 1 sound wave · 2 dialect rings · 3 call-to-booking flow */
export type OrbScene = 0 | 1 | 2 | 3;

type Props = {
  scene: OrbScene;
  /** Ring to highlight in the dialects scene (0–4). */
  ring?: number;
  /** Change this number to send a pulse through the particles. */
  pulse?: number;
  className?: string;
};

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}`;

/**
 * SAUT's 3D voice orb: thousands of particles that morph between a breathing sphere,
 * a live sound wave, five dialect rings and a flowing helix. Three.js loads lazily,
 * rendering pauses when the app is in the background, and devices without WebGL get a
 * soft gradient instead.
 */
export function VoiceOrb({ scene, ring = 0, pulse = 0, className = "" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ scene, ring, pulse: 0 });

  useEffect(() => {
    state.current.scene = scene;
    state.current.ring = ring;
  }, [scene, ring]);
  useEffect(() => {
    if (pulse) state.current.pulse = 1;
  }, [pulse]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      if (disposed) return;
      const canvas = document.createElement("canvas");
      canvas.className = "block h-full w-full";
      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "high-performance" });
      } catch {
        el.classList.add("orb-fallback");
        return;
      }
      el.appendChild(canvas);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const small = Math.min(window.innerWidth, window.innerHeight) < 700;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.75 : 2));
      renderer.setClearColor(0x000000, 0);

      const scene3 = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.set(0, 0, 6);

      const N = small ? 7000 : 12000;
      const geo = new THREE.BufferGeometry();
      const aSphere = new Float32Array(N * 3), aWave = new Float32Array(N * 3), aRing = new Float32Array(N * 3), aFlow = new Float32Array(N * 3);
      const aRand = new Float32Array(N), aRingId = new Float32Array(N);
      const golden = Math.PI * (3 - Math.sqrt(5));
      const cols = Math.round(Math.sqrt(N * 1.8));
      const rows = Math.ceil(N / cols);
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = golden * i;
        aSphere.set([Math.cos(th) * r * 1.6, y * 1.6, Math.sin(th) * r * 1.6], i * 3);
        const gx = (i % cols) / (cols - 1), gz = Math.floor(i / cols) / (rows - 1);
        aWave.set([(gx - 0.5) * 9, 0, (gz - 0.5) * 5], i * 3);
        const rg = i % 5, a = Math.random() * Math.PI * 2, rr = 0.9 + rg * 0.42 + (Math.random() - 0.5) * 0.06;
        aRing.set([Math.cos(a) * rr, (Math.random() - 0.5) * 0.05, Math.sin(a) * rr], i * 3);
        aRingId[i] = rg;
        const t = i / N, ang = t * Math.PI * 10, rad = 0.5 + Math.random() * 0.25;
        aFlow.set([(t - 0.5) * 8, Math.cos(ang) * rad, Math.sin(ang) * rad], i * 3);
        aRand[i] = Math.random();
      }
      geo.setAttribute("position", new THREE.BufferAttribute(aSphere, 3));
      geo.setAttribute("aWave", new THREE.BufferAttribute(aWave, 3));
      geo.setAttribute("aRing", new THREE.BufferAttribute(aRing, 3));
      geo.setAttribute("aFlow", new THREE.BufferAttribute(aFlow, 3));
      geo.setAttribute("aRand", new THREE.BufferAttribute(aRand, 1));
      geo.setAttribute("aRingId", new THREE.BufferAttribute(aRingId, 1));

      const uniforms = {
        uTime: { value: 0 },
        uMix: { value: new THREE.Vector4(1, 0, 0, 0) },
        uMouse: { value: new THREE.Vector2() },
        uPulse: { value: 0 },
        uColA: { value: new THREE.Color("#8B5CF6") },
        uColB: { value: new THREE.Color("#38BDF8") },
        uRingFocus: { value: 0 },
        uSize: { value: small ? 0.85 : 1 },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader:
          NOISE +
          /* glsl */ `
          uniform float uTime, uPulse, uRingFocus, uSize; uniform vec4 uMix; uniform vec2 uMouse;
          attribute vec3 aWave, aRing, aFlow; attribute float aRand, aRingId;
          varying float vGlow; varying float vRand;
          mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
          void main(){
            float t=uTime;
            vec3 s=position; float n=snoise(s*.9+t*.35);
            s*=1.+n*.18+uPulse*.35*sin(length(s)*6.-t*8.);
            s.xz*=rot(t*.12+uMouse.x*.6); s.yz*=rot(uMouse.y*.4);
            vec3 w=aWave; float d=length(w.xz);
            w.y=sin(w.x*1.4-t*2.2)*.45*cos(w.z*.8+t)+snoise(vec3(w.xz*.5,t*.4))*.35+uPulse*sin(d*3.-t*10.)*.4;
            w.yz*=rot(-.5); w.y-=.4;
            vec3 r=aRing; float sp=(.25+aRingId*.12)*(mod(aRingId,2.)<.5?1.:-1.);
            r.xz*=rot(t*sp); r.y+=sin(atan(r.z,r.x)*6.+t*3.)*.05*(1.+uPulse*4.);
            float focus=1.-step(.5,abs(aRingId-uRingFocus)); r*=1.+focus*.06;
            r.yz*=rot(1.05+uMouse.y*.3); r.xy*=rot(.25+uMouse.x*.3);
            vec3 f=aFlow; f.yz*=rot(t*.6+f.x*.3); f.x=mod(f.x+t*.6+4.,8.)-4.; f.xy*=rot(.12);
            vec3 p=s*uMix.x+w*uMix.y+r*uMix.z+f*uMix.w;
            vec4 mv=modelViewMatrix*vec4(p,1.);
            gl_Position=projectionMatrix*mv;
            float ringGlow=uMix.z*focus*.8;
            vGlow=clamp(.35+n*.6+uPulse+ringGlow,0.,1.6); vRand=aRand;
            gl_PointSize=uSize*(1.6+aRand*2.2+ringGlow*2.)*(6./-mv.z);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColA,uColB; varying float vGlow; varying float vRand;
          void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard;
            float a=smoothstep(.5,0.,d); vec3 c=mix(uColB,uColA,vRand*.8+vGlow*.3);
            gl_FragColor=vec4(c*(.6+vGlow*.7),a*.8);
            #include <colorspace_fragment>
          }`,
      });
      scene3.add(new THREE.Points(geo, mat));

      const resize = () => {
        const w = el.clientWidth || 1, h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.position.z = w / h < 0.8 ? 9 : 6;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      resize();

      const mouse = new THREE.Vector2(), target = new THREE.Vector2();
      const onMove = (e: PointerEvent) => target.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
      window.addEventListener("pointermove", onMove, { passive: true });

      const mix = new THREE.Vector4(1, 0, 0, 0), mixT = new THREE.Vector4();
      let raf = 0, last = performance.now(), time = 0;
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min((now - last) / 1000, 0.05);
        last = now;
        time += reduce ? dt * 0.25 : dt;
        const s = state.current;
        mixT.set(s.scene === 0 ? 1 : 0, s.scene === 1 ? 1 : 0, s.scene === 2 ? 1 : 0, s.scene === 3 ? 1 : 0);
        mix.lerp(mixT, reduce ? 1 : 0.06);
        mouse.lerp(target, 0.05);
        s.pulse *= 0.965;
        uniforms.uTime.value = time;
        uniforms.uMix.value.copy(mix);
        uniforms.uMouse.value.copy(mouse);
        uniforms.uPulse.value = s.pulse;
        uniforms.uRingFocus.value += (s.ring - uniforms.uRingFocus.value) * 0.2;
        renderer.render(scene3, camera);
      };
      const onVisibility = () => {
        cancelAnimationFrame(raf);
        if (!document.hidden) {
          last = performance.now();
          raf = requestAnimationFrame(tick);
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      raf = requestAnimationFrame(tick);

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("visibilitychange", onVisibility);
        geo.dispose();
        mat.dispose();
        renderer.dispose();
        canvas.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <div ref={host} aria-hidden className={className} />;
}
