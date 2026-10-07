import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { rotateFace } from '../src/camera/placement.ts';
import { drawFace } from '../src/camera/synthetic.ts';

// Videos for Chrome's fake camera (--use-file-for-fake-video-capture): a cube's faces brought
// into the app's grid one after another, each sliding in, holding still and leaving. The format
// is YUV4MPEG2 with 4:2:0 chroma, which Chrome reads directly.

const WIDTH = 480;
const HEIGHT = 360;
const FPS = 10;
const SLIDE = 6;
const STILL = 14;
const AWAY = 4;

/** A face of the cube as shown to the camera: which face, turned how many quarters clockwise. */
export interface Shown {
  readonly face: number;
  readonly turns: number;
}

/** BT.601 studio-swing YUV 4:2:0 of an RGBA picture. */
function yuv420(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(WIDTH * HEIGHT * 1.5);
  const at = (x: number, y: number) => (y * WIDTH + x) * 4;
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    out[i] = 16 + (65.738 * r + 129.057 * g + 25.064 * b) / 256;
  }
  const chroma = WIDTH * HEIGHT;
  const quarter = (WIDTH / 2) * (HEIGHT / 2);
  for (let y = 0; y < HEIGHT; y += 2) {
    for (let x = 0; x < WIDTH; x += 2) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ] as const) {
        const p = at(x + dx, y + dy);
        r += (rgba[p] ?? 0) / 4;
        g += (rgba[p + 1] ?? 0) / 4;
        b += (rgba[p + 2] ?? 0) / 4;
      }
      const c = (y / 2) * (WIDTH / 2) + x / 2;
      out[chroma + c] = 128 + (-37.945 * r - 74.494 * g + 112.439 * b) / 256;
      out[chroma + quarter + c] = 128 + (112.439 * r - 94.154 * g - 18.285 * b) / 256;
    }
  }
  return out;
}

/** Writes a video of `stickers` (facelet order) with its faces shown in the given order. */
export function writeCubeVideo(
  path: string,
  stickers: string,
  size: number,
  shown: readonly Shown[],
): void {
  mkdirSync(dirname(path), { recursive: true });
  const file = openSync(path, 'w');
  writeSync(
    file,
    `YUV4MPEG2 W${String(WIDTH)} H${String(HEIGHT)} F${String(FPS)}:1 Ip A1:1 C420jpeg\n`,
  );
  // Centred, 70 % of the shorter side: where a person would hold the face.
  const side = Math.round(Math.min(WIDTH, HEIGHT) * 0.7);
  const square = { x: Math.round((WIDTH - side) / 2), y: Math.round((HEIGHT - side) / 2), side };
  let seed = 1;
  // A little sensor noise, the same in every run.
  const noise = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return (seed / 2 ** 32 - 0.5) * 6;
  };
  const frame = (letters: string | null, offset: number) => {
    const picture = drawFace(
      WIDTH,
      HEIGHT,
      letters === null
        ? null
        : { letters, size, x: square.x + offset, y: square.y, side: square.side },
      noise,
    );
    writeSync(file, 'FRAME\n');
    writeSync(file, yuv420(picture.data));
  };
  const perFace = size * size;
  for (const { face, turns } of shown) {
    const letters = rotateFace(stickers.slice(face * perFace, (face + 1) * perFace), size, turns);
    for (let i = SLIDE; i > 0; i--) frame(letters, i * 30);
    for (let i = 0; i < STILL; i++) frame(letters, 0);
    for (let i = 0; i < AWAY; i++) frame(null, 0);
  }
  closeSync(file);
}
