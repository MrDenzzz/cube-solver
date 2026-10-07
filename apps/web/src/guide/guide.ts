import { formatMove, isFace, rotateFace, toMove, type Face, type LayerTurn } from '@cube/core';

/** What a person needs to make a move on a cube in their hands. */
export interface MoveGuide {
  readonly notation: string;
  readonly face: Face;
  /** Outer layers turned together: 1 for a face turn, 2 for a wide turn. */
  readonly depth: number;
  readonly half: boolean;
  readonly clockwise: boolean;
  /** A side whose stickers make the direction obvious, and where they go. */
  readonly reference: 'F' | 'U';
  readonly towards: Face;
}

/**
 * Describes a turn by where the front (or, for F and B turns, the top) of the turning layer goes.
 * "Clockwise" alone is ambiguous for D, L and B, which are clockwise as seen from behind the cube;
 * "the front goes up" is not. The direction comes from the same geometry as the moves themselves.
 */
export function describeMove(turn: LayerTurn, size: number): MoveGuide {
  const reference = turn.face === 'F' || turn.face === 'B' ? 'U' : 'F';
  return {
    notation: formatMove(toMove(turn, size)),
    face: turn.face,
    depth: turn.to - turn.from + 1,
    half: turn.turns === 2,
    clockwise: turn.turns === 1,
    reference,
    towards: rotateFace(reference, turn.face, turn.turns),
  };
}

/**
 * The colours of the corner at the top front right of an N×N×N in facelet order: a hold anyone
 * can find on a cube without fixed centres. The corner is the last sticker of U, the first of R
 * and the last of F's first row.
 */
export function holdCorner(
  stickers: string,
  size: number,
): { readonly top: Face; readonly front: Face; readonly right: Face } | null {
  const perFace = size * size;
  const top = stickers.charAt(perFace - 1);
  const right = stickers.charAt(perFace);
  const front = stickers.charAt(2 * perFace + size - 1);
  return isFace(top) && isFace(right) && isFace(front) ? { top, front, right } : null;
}
