//! IDA* with Reid's three-axis bound, as `optimal.ts` and Kociemba's optimal solver do it.

use crate::Hooks;
use crate::optimal_tables::OptimalTables;
use crate::symmetry::N_SYM;
use crate::tables::{N_MOVES, TwoPhaseTables};
use cube::coordinates::{N_FLIP, N_TWIST, corner_perm, flip, slice_sorted, twist};
use cube::cubie::{CubieCube, rotate_cube};
use cube::geometry::{R, U, rotate_face};

const MAX_DEPTH: usize = 24;
const CHECK_INTERVAL: u64 = 1 << 20;

/// x then y, applied 0, 1 or 2 times: the cube seen along U/D, R/L and F/B.
const DIAGONAL: [(usize, u8); 2] = [(R, 1), (U, 1)];

#[derive(Clone, Copy, Default)]
struct Frame {
    twist: [u16; 3],
    flip: [u16; 3],
    slice: [u16; 3],
    distance: [u8; 3],
    corners: u16,
}

pub struct OptimalResult {
    pub moves: Option<Vec<u8>>,
    pub cancelled: bool,
    pub proved_bound: bool,
    pub nodes: u64,
}

pub struct Optimal<'t> {
    tables: &'t OptimalTables,
    moves: &'t TwoPhaseTables,
    move_on_axis: [[u8; N_MOVES]; 3],
    /// Exact distance after a move from the distance before and the stored value mod 3.
    next_distance: [[u8; 3]; MAX_DEPTH + 2],
}

fn small(value: usize) -> u16 {
    u16::try_from(value).expect("coordinates fit in 16 bits")
}

impl<'t> Optimal<'t> {
    /// # Panics
    /// Never: the conversions only see small numbers.
    #[must_use]
    pub fn new(tables: &'t OptimalTables, moves: &'t TwoPhaseTables) -> Self {
        let move_on_axis = std::array::from_fn(|axis| {
            std::array::from_fn(|m| {
                let mut face = m / 3;
                for _ in 0..axis {
                    for &(a, turns) in &DIAGONAL {
                        face = rotate_face(face, a, turns);
                    }
                }
                u8::try_from(face * 3 + m % 3).expect("small")
            })
        });
        let next_distance = std::array::from_fn(|before| {
            std::array::from_fn(|mod3| {
                let step =
                    i32::try_from(mod3).expect("small") - i32::try_from(before % 3).expect("small");
                let delta = match step {
                    2 => -1,
                    -2 => 1,
                    other => other,
                };
                u8::try_from((i32::try_from(before).expect("small") + delta).max(0)).expect("small")
            })
        });
        Self {
            tables,
            moves,
            move_on_axis,
            next_distance,
        }
    }

    #[inline]
    fn entry(&self, twist: usize, flip: usize, slice_sorted: usize) -> usize {
        let classes = &self.tables.classes;
        let slice = if classes.sorted {
            slice_sorted
        } else {
            slice_sorted / 24
        };
        let packed = classes.class_of[slice * N_FLIP + flip] as usize;
        (packed >> 4) * N_TWIST + usize::from(self.tables.twist_conj[twist * N_SYM + (packed & 15)])
    }

    #[inline]
    fn stored(&self, index: usize) -> u8 {
        u8::try_from((self.tables.prune()[index >> 4] >> ((index & 15) << 1)) & 3).expect("2 bits")
    }

    fn in_target(&self, twist: usize, flip: usize, slice_sorted: usize) -> bool {
        let slice = if self.tables.classes.sorted {
            slice_sorted
        } else {
            slice_sorted / 24
        };
        twist == 0 && flip == 0 && slice == 0
    }

    fn exact_distance(&self, mut twist: usize, mut flip: usize, mut slice_sorted: usize) -> u8 {
        let m = self.moves;
        let mut distance = 0;
        while !self.in_target(twist, flip, slice_sorted) {
            let closer = (self.stored(self.entry(twist, flip, slice_sorted)) + 2) % 3;
            let step = (0..N_MOVES)
                .map(|mv| {
                    (
                        usize::from(m.twist_move[twist * N_MOVES + mv]),
                        usize::from(m.flip_move[flip * N_MOVES + mv]),
                        usize::from(m.slice_sorted_move[slice_sorted * N_MOVES + mv]),
                    )
                })
                .find(|&(t, f, s)| self.stored(self.entry(t, f, s)) == closer)
                .expect("the optimal prune table is consistent");
            (twist, flip, slice_sorted) = step;
            distance += 1;
        }
        distance
    }

    fn root(&self, cube: &CubieCube) -> (Frame, usize) {
        let mut frame = Frame::default();
        for axis in 0..3 {
            let mut c = *cube;
            for _ in 0..axis {
                for &(a, turns) in &DIAGONAL {
                    c = rotate_cube(&c, a, turns);
                }
            }
            let (t, f, s) = (twist(&c.co), flip(&c.eo), slice_sorted(&c.ep));
            frame.twist[axis] = small(t);
            frame.flip[axis] = small(f);
            frame.slice[axis] = small(s);
            frame.distance[axis] = self.exact_distance(t, f, s);
        }
        frame.corners = small(corner_perm(&cube.cp));
        let [ud, rl, fb] = frame.distance;
        let all_equal = ud != 0 && ud == rl && ud == fb;
        let bound = usize::from((ud + u8::from(all_equal)).max(rl).max(fb)).max(usize::from(
            self.tables.corner_depth[usize::from(frame.corners)],
        ));
        (frame, bound)
    }

    /// Exact distances along the three axes, for tests.
    #[must_use]
    pub fn axis_distances(&self, cube: &CubieCube) -> [u8; 3] {
        self.root(cube).0.distance
    }

    /// No solution is shorter than this: the search's first bound.
    #[must_use]
    pub fn lower_bound(&self, cube: &CubieCube) -> usize {
        self.root(cube).1
    }

    #[inline]
    fn descend(&self, from: &Frame, togo: usize, m: usize, to: &mut Frame) -> bool {
        let mv = self.moves;
        let corners = mv.corner_perm_move[usize::from(from.corners) * N_MOVES + m];
        if usize::from(self.tables.corner_depth[usize::from(corners)]) >= togo {
            return false;
        }
        for axis in 0..3 {
            let ma = usize::from(self.move_on_axis[axis][m]);
            let t = mv.twist_move[usize::from(from.twist[axis]) * N_MOVES + ma];
            let f = mv.flip_move[usize::from(from.flip[axis]) * N_MOVES + ma];
            let s = mv.slice_sorted_move[usize::from(from.slice[axis]) * N_MOVES + ma];
            let index = self.entry(usize::from(t), usize::from(f), usize::from(s));
            let distance = self.next_distance[usize::from(from.distance[axis])]
                [usize::from(self.stored(index))];
            if usize::from(distance) >= togo {
                return false;
            }
            to.twist[axis] = t;
            to.flip[axis] = f;
            to.slice[axis] = s;
            to.distance[axis] = distance;
        }
        // Equal non-zero distances on all three axes mean at least one more move; see optimal.ts.
        let d = to.distance[0];
        if d != 0 && d == to.distance[1] && d == to.distance[2] && usize::from(d) + 1 >= togo {
            return false;
        }
        to.corners = corners;
        true
    }

    pub fn solve<H: Hooks>(
        &self,
        cube: &CubieCube,
        upper_bound: Option<&[u8]>,
        hooks: &mut H,
    ) -> OptimalResult {
        let (root, first) = self.root(cube);
        let mut run = Run {
            optimal: self,
            hooks,
            frames: [Frame::default(); MAX_DEPTH + 1],
            path: [0; MAX_DEPTH],
            nodes: 0,
            cancelled: false,
            bound: first,
        };
        run.frames[0] = root;
        for bound in first..=MAX_DEPTH {
            run.bound = bound;
            if let Some(known) = upper_bound.filter(|known| bound >= known.len()) {
                return OptimalResult {
                    moves: Some(known.to_vec()),
                    cancelled: false,
                    proved_bound: true,
                    nodes: run.nodes,
                };
            }
            if run.check() {
                break;
            }
            match run.search(0, bound, -1) {
                Outcome::Found => {
                    return OptimalResult {
                        moves: Some(run.path[..bound].to_vec()),
                        cancelled: false,
                        proved_bound: false,
                        nodes: run.nodes,
                    };
                }
                Outcome::Stopped => break,
                Outcome::None => {}
            }
        }
        OptimalResult {
            moves: None,
            cancelled: true,
            proved_bound: false,
            nodes: run.nodes,
        }
    }
}

#[derive(PartialEq, Eq)]
enum Outcome {
    Found,
    None,
    Stopped,
}

struct Run<'r, 't, H: Hooks> {
    optimal: &'r Optimal<'t>,
    hooks: &'r mut H,
    frames: [Frame; MAX_DEPTH + 1],
    path: [u8; MAX_DEPTH],
    nodes: u64,
    cancelled: bool,
    bound: usize,
}

impl<H: Hooks> Run<'_, '_, H> {
    fn check(&mut self) -> bool {
        self.hooks.on_progress(self.bound, None, self.nodes);
        if self.hooks.should_stop() {
            self.cancelled = true;
        }
        self.cancelled
    }

    fn search(&mut self, depth: usize, togo: usize, last_face: i32) -> Outcome {
        if togo == 0 {
            let f = &self.frames[depth];
            let solved = f.corners == 0 && f.slice == [0, 0, 0];
            return if solved {
                Outcome::Found
            } else {
                Outcome::None
            };
        }
        for m in 0..N_MOVES {
            let face = i32::try_from(m / 3).expect("small");
            let diff = last_face - face;
            if diff == 0 || diff == 3 {
                continue;
            }
            self.nodes += 1;
            if self.nodes.is_multiple_of(CHECK_INTERVAL) && self.check() {
                return Outcome::Stopped;
            }
            let (head, tail) = self.frames.split_at_mut(depth + 1);
            if !self.optimal.descend(&head[depth], togo, m, &mut tail[0]) {
                continue;
            }
            self.path[depth] = u8::try_from(m).expect("small");
            let outcome = self.search(depth + 1, togo - 1, face);
            if outcome != Outcome::None {
                return outcome;
            }
        }
        Outcome::None
    }
}
