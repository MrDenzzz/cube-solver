import type { LayerTurn } from '@cube/core';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { SPACING, turnArrows } from './model.ts';

interface ArrowSize {
  readonly length: number;
  readonly shaft: number;
  readonly headLength: number;
  readonly headWidth: number;
}

/** A flat arrow along +x, centred on the origin; a two-way arrow has a head at each end. */
function arrowShape({ length, shaft, headLength, headWidth }: ArrowSize, twoWay: boolean) {
  const tip = length / 2;
  const neck = tip - headLength;
  const s = shaft / 2;
  const w = headWidth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(tip, 0);
  shape.lineTo(neck, w);
  shape.lineTo(neck, s);
  if (twoWay) {
    shape.lineTo(-neck, s);
    shape.lineTo(-neck, w);
    shape.lineTo(-tip, 0);
    shape.lineTo(-neck, -w);
    shape.lineTo(-neck, -s);
  } else {
    shape.lineTo(-tip, s);
    shape.lineTo(-tip, -s);
  }
  shape.lineTo(neck, -s);
  shape.lineTo(neck, -w);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

function grow(size: ArrowSize, margin: number): ArrowSize {
  return {
    length: size.length + 2 * margin,
    shaft: size.shaft + 2 * margin,
    headLength: size.headLength + margin,
    headWidth: size.headWidth + 3 * margin,
  };
}

// Dark with a light rim, so the arrow stands out on white and yellow stickers alike.
const fillMaterial = new THREE.MeshBasicMaterial({ color: '#15171c' });
const rimMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });

/** Above the stickers, which sit just under the outer surface of the cube. */
const LIFT = 0.03;

/** Arrows on the four faces around the next turn's layers, pointing the way they move. */
export function TurnArrows({ size, turn }: { readonly size: number; readonly turn: LayerTurn }) {
  const twoWay = turn.turns === 2;
  const geometry = useMemo(() => {
    const arrow: ArrowSize = { length: size * 0.8, shaft: 0.16, headLength: 0.4, headWidth: 0.5 };
    return { fill: arrowShape(arrow, twoWay), rim: arrowShape(grow(arrow, 0.05), twoWay) };
  }, [size, twoWay]);
  useEffect(
    () => () => {
      geometry.fill.dispose();
      geometry.rim.dispose();
    },
    [geometry],
  );
  const poses = useMemo(
    () =>
      turnArrows(size, turn).map(({ face, centre, direction, normal }) => {
        const z = new THREE.Vector3(...normal);
        const x = new THREE.Vector3(...direction);
        const y = new THREE.Vector3().crossVectors(z, x);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(x, y, z),
        );
        const position = new THREE.Vector3(...centre).multiplyScalar(SPACING);
        return {
          face,
          quaternion,
          rim: position.clone().addScaledVector(z, LIFT),
          fill: position.clone().addScaledVector(z, LIFT + 0.01),
        };
      }),
    [size, turn],
  );

  return (
    <group>
      {poses.map(({ face, quaternion, rim, fill }) => (
        <group key={face}>
          <mesh
            geometry={geometry.rim}
            material={rimMaterial}
            position={rim}
            quaternion={quaternion}
          />
          <mesh
            geometry={geometry.fill}
            material={fillMaterial}
            position={fill}
            quaternion={quaternion}
          />
        </group>
      ))}
    </group>
  );
}
