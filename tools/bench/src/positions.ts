/**
 * Positions with published optimal solutions, from the README of Kociemba's optimal solver
 * (https://github.com/hkociemba/RubiksCube-OptimalSolver): ten random cubes, the superflip, and
 * the hardest known position from cube20.org. `nodes` are the nodes that solver generated per
 * search depth with its 794 MB table, for the depths it completed; an implementation of the same
 * search over the same table must generate exactly as many.
 */
export interface KnownPosition {
  readonly name: string;
  readonly facelets: string;
  readonly optimal: number;
  readonly nodes: Readonly<Record<number, number>>;
}

export const KOCIEMBA_POSITIONS: readonly KnownPosition[] = [
  {
    name: 'random 1',
    facelets: 'FDDLURBFDRFRLRDFBRLDBRFFBBLURDBDLLFBUUDDLUFULFBRLBRUUU',
    optimal: 18,
    nodes: { 15: 1_290_873, 16: 17_831_301, 17: 245_464_971 },
  },
  {
    name: 'random 2',
    facelets: 'FFDFUUBBDRBFLRRLUURDBFFUBBBURDBDFFDLULURLDDLLLRRUBDFLR',
    optimal: 18,
    nodes: { 15: 1_928_430, 16: 25_418_349, 17: 334_597_977 },
  },
  {
    name: 'random 3',
    facelets: 'BLRBUDDLBUFULRUURBBDLDFBDLLLUFUDFRURRRLDLBFRFFFUBBRDFD',
    optimal: 18,
    nodes: { 15: 3_311_061, 16: 39_782_112, 17: 485_952_603 },
  },
  {
    name: 'random 4',
    facelets: 'DULDULDDLFUBDRFBBRRRDDFBURLFUURDLRBUFLBLLFBBLDFRRBFFUU',
    optimal: 17,
    nodes: { 15: 1_853_697, 16: 24_440_712 },
  },
  {
    name: 'random 5',
    facelets: 'DBDBUFURUBLFBRLFFLFDRRFUBLDDDRBDURUUBDLDLFULRLRLUBFBRF',
    optimal: 18,
    nodes: { 15: 1_335_570, 16: 18_770_952, 17: 260_113_815 },
  },
  {
    name: 'random 6',
    facelets: 'RBBRURRDLDFLLRUUFDDLBFFFRDLUBFBDUFBFBDFRLDRUBULDLBULRU',
    optimal: 18,
    nodes: { 15: 1_374_786, 16: 19_053_294, 17: 262_000_026 },
  },
  {
    name: 'random 7',
    facelets: 'UDLRURDBBDFUBRLFDRBLRBFUFLURULRDBFDUBDLFLRLUDBFRFBUFLD',
    optimal: 18,
    nodes: { 15: 1_491_219, 16: 20_304_783, 17: 276_363_516 },
  },
  {
    name: 'random 8',
    facelets: 'BRFRULFUBUFLLRBBRRULLLFBBDDDFLBDULRFRDRULDFURDFUDBFDBU',
    optimal: 18,
    nodes: { 15: 1_050_312, 16: 15_184_191, 17: 217_674_717 },
  },
  {
    name: 'random 9',
    facelets: 'FUBFUBBBDRLDFRFBDRURBBFUUDUFLRUDRFFURLLULDLRLLBDRBLFDD',
    optimal: 17,
    nodes: { 15: 1_561_818, 16: 20_984_124 },
  },
  {
    name: 'random 10',
    facelets: 'BRLLUFLDRBUUURLDUFURDDFBLLFDFLLDRRFRRUFBLFFBBBBUDBDURD',
    optimal: 18,
    nodes: { 15: 1_500_297, 16: 20_394_183, 17: 275_572_329 },
  },
  {
    name: 'superflip',
    facelets: 'UBULURUFURURFRBRDRFUFLFRFDFDFDLDRDBDLULBLFLDLBUBRBLBDB',
    optimal: 20,
    nodes: {
      14: 185_949,
      15: 2_734_515,
      16: 35_007_363,
      17: 442_849_923,
      18: 5_537_992_239,
      19: 68_794_215_435,
    },
  },
  {
    name: 'cube20.org hardest',
    facelets: 'RBFLURBFLBUUFRBBDDRUURFLRDDBFLLDRRBFFUUBLFFDDLUULBRLDD',
    optimal: 20,
    nodes: {
      14: 13_425,
      15: 277_653,
      16: 5_247_552,
      17: 91_161_960,
      18: 1_481_591_235,
      19: 23_094_251_484,
    },
  },
];
