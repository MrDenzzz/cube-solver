import type { CornerName, EdgeName } from './cubie.ts';
import type { Face } from './geometry.ts';

/**
 * Why a cube state cannot be accepted. Codes are stable identifiers for the UI to translate;
 * `facelets` lists the stickers to highlight.
 */
export type CubeError =
  | { readonly code: 'invalid-length'; readonly expected: number; readonly actual: number }
  | {
      readonly code: 'duplicate-centre-colour';
      readonly colour: string;
      readonly facelets: readonly number[];
    }
  | {
      readonly code: 'unknown-colour';
      readonly colour: string;
      readonly facelets: readonly number[];
    }
  | {
      readonly code: 'colour-count';
      readonly face: Face;
      readonly count: number;
      readonly expected: number;
    }
  | {
      readonly code: 'invalid-corner';
      readonly position: CornerName;
      readonly facelets: readonly number[];
    }
  | {
      readonly code: 'mirrored-corner';
      readonly position: CornerName;
      readonly corner: CornerName;
      readonly facelets: readonly number[];
    }
  | {
      readonly code: 'invalid-edge';
      readonly position: EdgeName;
      readonly facelets: readonly number[];
    }
  | {
      readonly code: 'duplicate-corner';
      readonly corner: CornerName;
      readonly positions: readonly CornerName[];
    }
  | {
      readonly code: 'duplicate-edge';
      readonly edge: EdgeName;
      readonly positions: readonly EdgeName[];
    }
  | { readonly code: 'twisted-corner'; readonly twist: 1 | 2 }
  | { readonly code: 'flipped-edge' }
  | { readonly code: 'parity' }
  | { readonly code: 'malformed-cubies'; readonly detail: string };

export type CubeErrorCode = CubeError['code'];
