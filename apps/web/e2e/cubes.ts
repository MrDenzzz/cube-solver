import { join } from 'node:path';

/** Stickers in facelet order: R U R' U' F2 D L2 B' R2 U F', and a 4×4×4 scramble. */
export const CUBES = {
  3: 'DDUDUBRUDBUFDRLURLDRLFFLLBRBLBUDFFRDRFFDLUULURBBFBRFBL',
  4: 'FUDUULBDRLBFRFRRUDLLLLUFDDDDRRBDBLBBBLFFUBBRURBULFUFLUUULRFRLLRRDLUDDFRDFFRBBBBBFRFLUDULBRDDFFUD',
} as const;

const VIDEOS = join(import.meta.dirname, '.videos');

export const CAMERA_VIDEOS = {
  3: join(VIDEOS, 'cube3.y4m'),
  4: join(VIDEOS, 'cube4.y4m'),
} as const;
