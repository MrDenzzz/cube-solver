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

/**
 * The same colours as a camera reads them off real plastic, exposure evened out: orange and red
 * both lean to orange, yellow to green and blue is lighter than on screen. Measured on a webcam
 * and a phone, on a stickered and two stickerless cubes. The scan names stickers by these, not
 * by the display colours, which a camera never shows: next to them a camera's red is nearer the
 * display orange.
 */
export const CAMERA_COLOURS: Readonly<Record<Face, string>> = {
  U: '#d2cdc3',
  R: '#c82820',
  F: '#3c9e23',
  D: '#d4c805',
  L: '#e16900',
  B: '#0a5fa5',
};

/** A sticker whose colour has not been entered yet. */
export const UNKNOWN = '.';
