"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { Crema } from "./Crema";
import { cupGeometry, handleGeometry, saucerGeometry, CUP_COFFEE_R, CUP_COFFEE_Y } from "./geometry";

type Props = {
  body?: string;
  roughness?: number;
  art?: boolean;
  foam?: string;
  saucer?: boolean;
  goldRim?: boolean;
} & JSX.IntrinsicElements["group"];

/** Ceramic cup + saucer with a champagne-gold rim and a living crema surface. */
export function Cup({ body = "#0d0b0a", roughness = 0.38, art = false, foam = "#c38a55", saucer = true, goldRim = true, ...rest }: Props) {
  const geos = useMemo(() => ({ cup: cupGeometry(), saucer: saucerGeometry(), handle: handleGeometry() }), []);
  const ceramic = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: body, roughness, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide }),
    [body, roughness],
  );
  const gold = useMemo(() => new THREE.MeshStandardMaterial({ color: "#d6b37a", metalness: 1, roughness: 0.22 }), []);
  return (
    <group {...rest}>
      <mesh geometry={geos.cup} material={ceramic} castShadow />
      {goldRim && (
        <mesh position={[0, 1.365, 0]} rotation={[Math.PI / 2, 0, 0]} material={gold}>
          <torusGeometry args={[0.975, 0.018, 12, 128]} />
        </mesh>
      )}
      <mesh geometry={geos.handle} material={ceramic} position={[0.93, 0.78, 0]} castShadow />
      <Crema radius={CUP_COFFEE_R} y={CUP_COFFEE_Y} art={art ? 1 : 0} foam={foam} />
      {saucer && (
        <group position={[0, -0.1, 0]}>
          <mesh geometry={geos.saucer} material={ceramic} receiveShadow />
          {goldRim && (
            <mesh position={[0, 0.175, 0]} rotation={[Math.PI / 2, 0, 0]} material={gold}>
              <torusGeometry args={[1.655, 0.014, 10, 160]} />
            </mesh>
          )}
        </group>
      )}
    </group>
  );
}
