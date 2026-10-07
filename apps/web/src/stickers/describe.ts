import { isFace, type Cube4Error, type CubeError, type Face } from '@cube/core';
import type { I18n } from '../i18n/i18n.ts';

export const colourName = (face: Face, t: I18n['t']) => t(`colour.${face}`);

export const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A piece or position named by its colours on the solved cube: "white–red–green". */
function piece(name: string, t: I18n['t']): string {
  return name
    .split('')
    .filter(isFace)
    .map((face) => colourName(face, t))
    .join('–');
}

export function describeCubeError(error: CubeError, t: I18n['t']): string {
  switch (error.code) {
    case 'colour-count':
      return t('stickers.error.colour-count', {
        colour: capitalise(colourName(error.face, t)),
        count: error.count,
        expected: 9,
      });
    case 'invalid-corner':
      return t('stickers.error.invalid-corner', { position: piece(error.position, t) });
    case 'mirrored-corner':
      return t('stickers.error.mirrored-corner', { position: piece(error.position, t) });
    case 'invalid-edge':
      return t('stickers.error.invalid-edge', { position: piece(error.position, t) });
    case 'duplicate-corner':
      return t('stickers.error.duplicate-corner', { piece: piece(error.corner, t) });
    case 'duplicate-edge':
      return t('stickers.error.duplicate-edge', { piece: piece(error.edge, t) });
    case 'twisted-corner':
      return t('stickers.error.twisted-corner');
    case 'flipped-edge':
      return t('stickers.error.flipped-edge');
    case 'parity':
      return t('stickers.error.parity');
    case 'invalid-length':
    case 'duplicate-centre-colour':
    case 'unknown-colour':
    case 'malformed-cubies':
      return t('stickers.error.other');
  }
}

/** 4×4×4 errors point at stickers rather than named pieces: the editor highlights them. */
export function describeCube4Error(error: Cube4Error, t: I18n['t']): string {
  switch (error.code) {
    case 'colour-count':
      return t('stickers.error.colour-count', {
        colour: capitalise(colourName(error.face, t)),
        count: error.count,
        expected: error.expected,
      });
    case 'centre-count':
      return t('stickers.error4.centre-count', {
        colour: capitalise(colourName(error.face, t)),
        count: error.count,
      });
    case 'invalid-corner':
    case 'mirrored-corner':
    case 'duplicate-corner':
    case 'invalid-wing':
    case 'duplicate-wing':
      return t(`stickers.error4.${error.code}`);
    case 'twisted-corner':
      return t('stickers.error.twisted-corner');
    case 'invalid-length':
    case 'unknown-colour':
      return t('stickers.error.other');
  }
}
