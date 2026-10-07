import type { Face } from '@cube/core';

/**
 * The Western colour scheme of practically every speed cube: white opposite yellow, green opposite
 * blue, red opposite orange. The reference orientation holds white on top and green in front, and
 * a colour is identified by the face it belongs to on the solved cube.
 */
export const FACE_COLOURS: Readonly<Record<Face, string>> = {
  U: '#f4f4f2',
  R: '#c8102e',
  F: '#009b48',
  D: '#ffd500',
  L: '#ff5800',
  B: '#0046ad',
};

/** A sticker whose colour has not been entered yet. */
export const UNKNOWN = '.';
