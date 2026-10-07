import type { LayerTurn } from '@cube/core';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CubeModel, type TurnAnimation } from './CubeModel.tsx';
import { TurnArrows } from './TurnArrows.tsx';

/**
 * Looking at the front from above and to the right, so the top, front and right faces show,
 * with the front turned most towards the viewer: the cube as it is held in the instructions.
 */
const HOME: readonly [number, number, number] = [4.4, 3.8, 5.6];

const home = (size: number) => HOME.map((v) => (v * size) / 3) as [number, number, number];

/**
 * three.js's own orbit controls; a frame is drawn only when the camera actually moves. A new
 * `viewKey` puts the camera back where it started.
 */
function CameraControls({ size, viewKey }: { readonly size: number; readonly viewKey: number }) {
  const camera = useThree((state) => state.camera);
  const element = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  const controls = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const orbit = new OrbitControls(camera, element);
    orbit.enablePan = false;
    const redraw = () => {
      invalidate();
    };
    orbit.addEventListener('change', redraw);
    controls.current = orbit;
    return () => {
      orbit.removeEventListener('change', redraw);
      orbit.dispose();
      controls.current = null;
    };
  }, [camera, element, invalidate]);

  useEffect(() => {
    const orbit = controls.current;
    if (orbit === null) return;
    orbit.minDistance = (5 * size) / 3;
    orbit.maxDistance = (14 * size) / 3;
    camera.position.set(...home(size));
    orbit.target.set(0, 0, 0);
    orbit.update();
    invalidate();
  }, [camera, invalidate, size, viewKey]);

  return null;
}

/**
 * Renders on demand only: a frame is drawn while a turn animates or the camera moves, so an idle
 * cube costs nothing. Default export so the page can load three.js lazily.
 */
export default function CubeView({
  size,
  facelets,
  animation,
  hint,
  viewKey,
  label,
}: {
  readonly size: number;
  readonly facelets: string;
  readonly animation: TurnAnimation | null;
  /** The next move to make, drawn as arrows; null to draw none. */
  readonly hint: LayerTurn | null;
  readonly viewKey: number;
  readonly label: string;
}) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: home(size), fov: 36 }}
      aria-label={label}
      role="img"
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 8, 6]} intensity={1.6} />
      <directionalLight position={[-6, -4, -5]} intensity={0.45} />
      <CubeModel size={size} facelets={facelets} animation={animation} />
      {hint !== null && <TurnArrows size={size} turn={hint} />}
      <CameraControls size={size} viewKey={viewKey} />
    </Canvas>
  );
}
