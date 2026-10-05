import { faceNormal, isFace, type Face, type FaceTurn } from '@cube/core';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildCubies, easeInOutCubic, layerMembers, turnAngle, type CubieModel } from './model.ts';

/** World units per grid unit: cubie centres are two grid units apart, so cubies are 1 unit wide. */
const SPACING = 0.5;

// Standard colour scheme: white opposite yellow, green opposite blue, red opposite orange.
const COLOURS: Readonly<Record<Face, string>> = {
  U: '#f4f4f2',
  R: '#c8102e',
  F: '#009b48',
  D: '#ffd500',
  L: '#ff5800',
  B: '#0046ad',
};

const bodyGeometry = new RoundedBoxGeometry(0.96, 0.96, 0.96, 4, 0.1);
const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#17181c', roughness: 0.6 });

const stickerGeometry = (() => {
  const half = 0.41;
  const radius = 0.09;
  const shape = new THREE.Shape();
  shape.moveTo(-half + radius, -half);
  shape.lineTo(half - radius, -half);
  shape.quadraticCurveTo(half, -half, half, -half + radius);
  shape.lineTo(half, half - radius);
  shape.quadraticCurveTo(half, half, half - radius, half);
  shape.lineTo(-half + radius, half);
  shape.quadraticCurveTo(-half, half, -half, half - radius);
  shape.lineTo(-half, -half + radius);
  shape.quadraticCurveTo(-half, -half, -half + radius, -half);
  return new THREE.ShapeGeometry(shape, 6);
})();

const stickerMaterials = Object.fromEntries(
  Object.entries(COLOURS).map(([face, colour]) => [
    face,
    new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35 }),
  ]),
) as Record<Face, THREE.MeshStandardMaterial>;

const Z = new THREE.Vector3(0, 0, 1);

export interface TurnAnimation {
  /** Stays the same for one move; a new key starts a new turn, so speed changes wait for it. */
  readonly key: object;
  readonly turn: FaceTurn;
  readonly durationMs: number;
  readonly onDone: () => void;
}

interface PlacedCubie {
  readonly key: string;
  readonly home: THREE.Vector3;
  readonly stickers: readonly {
    readonly facelet: number;
    readonly position: THREE.Vector3;
    readonly quaternion: THREE.Quaternion;
  }[];
}

/** World transforms of a cubie at rest and of its stickers, which face outwards just above it. */
function place(cubie: CubieModel): PlacedCubie {
  return {
    key: cubie.position.join(','),
    home: new THREE.Vector3(...cubie.position).multiplyScalar(SPACING),
    stickers: cubie.stickers.map(({ facelet, normal }) => {
      const outward = new THREE.Vector3(...normal);
      return {
        facelet,
        position: outward.clone().multiplyScalar(0.482),
        quaternion: new THREE.Quaternion().setFromUnitVectors(Z, outward),
      };
    }),
  };
}

interface Running {
  readonly key: object;
  readonly members: readonly number[];
  readonly axis: THREE.Vector3;
  readonly angle: number;
  readonly start: number;
  readonly durationMs: number;
  readonly onDone: () => void;
}

/**
 * Draws the cube from a facelet string. A turn rotates the cubies of its layer for the duration;
 * when it ends, the parent passes the new facelets and every cubie snaps back to its rest pose
 * with the new colours, which looks identical to the rotated pose.
 */
export function CubeModel({
  size,
  facelets,
  animation,
}: {
  readonly size: number;
  readonly facelets: string;
  readonly animation: TurnAnimation | null;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const cubies = useMemo(() => buildCubies(size), [size]);
  const placed = useMemo(() => cubies.map(place), [cubies]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const running = useRef<Running | null>(null);
  const rotation = useMemo(() => new THREE.Quaternion(), []);

  const resetPoses = useCallback(() => {
    groups.current.forEach((group, i) => {
      const home = placed[i]?.home;
      if (group == null || home === undefined) return;
      group.position.copy(home);
      group.quaternion.identity();
    });
    invalidate();
  }, [placed, invalidate]);

  useLayoutEffect(() => {
    resetPoses();
  }, [facelets, resetPoses]);

  useEffect(() => {
    if (animation === null) {
      // Withdrawn mid-turn (a seek to the same position): no new facelets will reset the layer.
      if (running.current !== null) {
        running.current = null;
        resetPoses();
      }
      return;
    }
    if (running.current?.key === animation.key) return;
    const { key, turn, durationMs, onDone } = animation;
    running.current = {
      key,
      members: layerMembers(cubies, size, turn.face),
      axis: new THREE.Vector3(...faceNormal(turn.face)),
      angle: turnAngle(turn.turns),
      start: performance.now(),
      durationMs: turn.turns === 2 ? durationMs * 1.5 : durationMs,
      onDone,
    };
    invalidate();
  }, [animation, cubies, size, invalidate, resetPoses]);

  useFrame(() => {
    const run = running.current;
    if (run === null) return;
    const t = Math.min(1, (performance.now() - run.start) / run.durationMs);
    rotation.setFromAxisAngle(run.axis, run.angle * easeInOutCubic(t));
    for (const i of run.members) {
      const group = groups.current[i];
      const home = placed[i]?.home;
      if (group == null || home === undefined) continue;
      group.position.copy(home).applyQuaternion(rotation);
      group.quaternion.copy(rotation);
    }
    if (t < 1) {
      invalidate();
    } else {
      running.current = null;
      run.onDone();
    }
  });

  return (
    <group>
      {placed.map((cubie, i) => (
        <group
          key={cubie.key}
          ref={(group) => {
            groups.current[i] = group;
          }}
          position={cubie.home}
        >
          <mesh geometry={bodyGeometry} material={bodyMaterial} />
          {cubie.stickers.map(({ facelet, position, quaternion }) => {
            const face = facelets.charAt(facelet);
            return (
              <mesh
                key={facelet}
                geometry={stickerGeometry}
                material={isFace(face) ? stickerMaterials[face] : bodyMaterial}
                position={position}
                quaternion={quaternion}
              />
            );
          })}
        </group>
      ))}
    </group>
  );
}
