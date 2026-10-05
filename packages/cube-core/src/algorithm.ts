import type { CubieCube } from './cubie.ts';
import { FACES, faceNormal, faceWithNormal, OPPOSITE, rotateTurns, type Face } from './geometry.ts';
import { applyFaceTurns, inverseTurns, type FaceTurn, type Turns } from './moves.ts';
import {
  formatMove,
  parseAlgorithm,
  type Move,
  type NotationError,
  type NotationMode,
  type ParsedMove,
} from './notation.ts';
import { err, ok, type Result } from './util.ts';

/** Layers `from`..`to` of `face` (1 = outer layer), turned clockwise as seen from `face`. */
export interface LayerTurn {
  readonly face: Face;
  readonly from: number;
  readonly to: number;
  readonly turns: Turns;
}

/** Resolves a move to concrete layers of an N×N×N cube, or undefined if the cube lacks them. */
export function toLayerTurn(move: Move, size: number): LayerTurn | undefined {
  const { face, turns } = move;
  switch (move.kind) {
    case 'block':
      // WCA 12a2: an outer block move turns n layers with 1 < n < N.
      return move.depth === 1 || move.depth < size
        ? { face, from: 1, to: move.depth, turns }
        : undefined;
    case 'slice':
      return move.layer < size ? { face, from: move.layer, to: move.layer, turns } : undefined;
    case 'middle': {
      if (size % 2 === 0) return undefined;
      const middle = (size + 1) / 2;
      return { face, from: middle, to: middle, turns };
    }
    case 'rotation':
      return { face, from: 1, to: size, turns };
  }
}

/** Which reference face (centre) is currently at each spatial face position. */
type Frame = Readonly<Record<Face, Face>>;

const IDENTITY_FRAME: Frame = { U: 'U', R: 'R', F: 'F', D: 'D', L: 'L', B: 'B' };

function rotateFrame(frame: Frame, axis: Face, turns: Turns): Frame {
  const next: Record<Face, Face> = { ...frame };
  for (const position of FACES) {
    const target = faceWithNormal(rotateTurns(faceNormal(axis), faceNormal(position), turns));
    next[target] = frame[position];
  }
  return next;
}

/**
 * Rewrites a 3×3×3 layer turn as turns of reference faces. The state is kept relative to the
 * centres, so a turn that moves the middle layer becomes a whole-cube rotation (tracked in the
 * frame) plus the opposite turn of the layers it leaves out: Rw = L·x, M = L′·R·x′.
 */
function expandLayerTurn(turn: LayerTurn, frame: Frame): { turns: FaceTurn[]; frame: Frame } {
  const { face, from, to, turns } = turn;
  const covers = (layer: number) => from <= layer && layer <= to;
  const near = frame[face];
  const far = frame[OPPOSITE[face]];
  const out: FaceTurn[] = [];
  if (!covers(2)) {
    if (covers(1)) out.push({ face: near, turns });
    if (covers(3)) out.push({ face: far, turns: inverseTurns(turns) });
    return { turns: out, frame };
  }
  if (!covers(1)) out.push({ face: near, turns: inverseTurns(turns) });
  if (!covers(3)) out.push({ face: far, turns });
  return { turns: out, frame: rotateFrame(frame, face, turns) };
}

/** Face turns, relative to the centres, equivalent to an algorithm on a 3×3×3. */
export function expandTo3x3(moves: readonly ParsedMove[]): Result<FaceTurn[], NotationError> {
  const errors: NotationError[] = [];
  const faceTurns: FaceTurn[] = [];
  let frame = IDENTITY_FRAME;
  for (const { move, start, end } of moves) {
    const layerTurn = toLayerTurn(move, 3);
    if (layerTurn === undefined) {
      errors.push({ code: 'layer-out-of-range', start, end, token: formatMove(move), size: 3 });
      continue;
    }
    const expanded = expandLayerTurn(layerTurn, frame);
    faceTurns.push(...expanded.turns);
    frame = expanded.frame;
  }
  return errors.length > 0 ? err(errors) : ok(faceTurns);
}

/** Parses an algorithm and applies it to a 3×3×3 state. */
export function applyAlgorithm(
  cube: CubieCube,
  text: string,
  mode: NotationMode = 'extended',
): Result<CubieCube, NotationError> {
  const parsed = parseAlgorithm(text, mode);
  if (!parsed.ok) return parsed;
  const expanded = expandTo3x3(parsed.value);
  if (!expanded.ok) return expanded;
  return ok(applyFaceTurns(cube, expanded.value));
}
