import { Canvas, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CubeModel, type TurnAnimation } from './CubeModel.tsx';

/** three.js's own orbit controls; drawing a frame only when the camera actually moves. */
function CameraControls() {
  const camera = useThree((state) => state.camera);
  const element = useThree((state) => state.gl.domElement);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const controls = new OrbitControls(camera, element);
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 14;
    const redraw = () => {
      invalidate();
    };
    controls.addEventListener('change', redraw);
    return () => {
      controls.removeEventListener('change', redraw);
      controls.dispose();
    };
  }, [camera, element, invalidate]);
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
  label,
}: {
  readonly size: number;
  readonly facelets: string;
  readonly animation: TurnAnimation | null;
  readonly label: string;
}) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [4.4, 3.8, 5.6], fov: 36 }}
      aria-label={label}
      role="img"
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[5, 8, 6]} intensity={1.6} />
      <directionalLight position={[-6, -4, -5]} intensity={0.45} />
      <CubeModel size={size} facelets={facelets} animation={animation} />
      <CameraControls />
    </Canvas>
  );
}
