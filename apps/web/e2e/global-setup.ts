import { CAMERA_VIDEOS, CUBES } from './cubes.ts';
import { writeCubeVideo } from './fake-camera.ts';

/** Renders the fake camera's videos before any browser starts. */
export default function globalSetup(): void {
  // The 3×3×3 faces in a mixed order and rotation: D, B, L, U, F, R.
  writeCubeVideo(CAMERA_VIDEOS[3], CUBES[3], 3, [
    { face: 3, turns: 1 },
    { face: 5, turns: 2 },
    { face: 4, turns: 0 },
    { face: 0, turns: 3 },
    { face: 2, turns: 1 },
    { face: 1, turns: 0 },
  ]);
  // The 4×4×4 front first and upright, so the scan keeps the cube's orientation; then the rest.
  writeCubeVideo(CAMERA_VIDEOS[4], CUBES[4], 4, [
    { face: 2, turns: 0 },
    { face: 0, turns: 1 },
    { face: 4, turns: 2 },
    { face: 3, turns: 0 },
    { face: 1, turns: 3 },
    { face: 5, turns: 1 },
  ]);
}
