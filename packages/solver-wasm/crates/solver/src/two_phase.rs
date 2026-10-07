//! Kociemba's two-phase search, the same algorithm and limits as `two-phase.ts`
//! (<https://kociemba.org/math/imptwophase.htm>, `solver.py` of RubiksCube-TwophaseSolver).

use crate::Hooks;
use crate::tables::{N_MOVES, PHASE2_MOVES, TwoPhaseTables};
use cube::coordinates::{
    N_FLIP, N_SLICE_PERM, N_TWIST, corner_perm, d_edges, flip, slice, slice_sorted, twist, u_edges,
};
use cube::cubie::CubieCube;
use cube::geometry::{R, U, rotate_face};

const PHASE1_DEPTH_LIMIT: usize = 20;
const PHASE2_MOVE_LIMIT: usize = 10;
const CHECK_INTERVAL: u64 = 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StopReason {
    Target,
    Time,
    Cancelled,
    Exhausted,
}

pub struct TwoPhaseResult {
    /// Face turn indices, or `None` if cancelled before the first solution.
    pub moves: Option<Vec<u8>>,
    pub stopped_by: StopReason,
    pub nodes: u64,
}

/// A direction: the cube rotated 0, 1 or 2 times by x then y (120° about the URF–DBL diagonal),
/// possibly inverted.
#[derive(Clone, Copy)]
struct Direction {
    rotations: u8,
    inverted: bool,
}

const DIRECTIONS: [Direction; 6] = [
    Direction {
        rotations: 0,
        inverted: false,
    },
    Direction {
        rotations: 0,
        inverted: true,
    },
    Direction {
        rotations: 1,
        inverted: false,
    },
    Direction {
        rotations: 1,
        inverted: true,
    },
    Direction {
        rotations: 2,
        inverted: false,
    },
    Direction {
        rotations: 2,
        inverted: true,
    },
];

const DIAGONAL: [(usize, u8); 2] = [(R, 1), (U, 1)];

#[derive(Clone, Copy)]
struct Start {
    direction: Direction,
    twist: usize,
    flip: usize,
    slice: usize,
    h: u8,
    slice_sorted: usize,
    corners: usize,
    u_edges: usize,
    d_edges: usize,
}

/// Turns a solution of a direction's cube into one of the original cube.
fn to_original(path: &[u8], direction: Direction) -> Vec<u8> {
    let mut moves: Vec<u8> = path.to_vec();
    if direction.inverted {
        moves = moves
            .iter()
            .rev()
            .map(|&m| m / 3 * 3 + (2 - m % 3))
            .collect();
    }
    moves
        .iter()
        .map(|&m| {
            let mut face = usize::from(m / 3);
            for _ in 0..direction.rotations {
                for &(axis, turns) in DIAGONAL.iter().rev() {
                    face = rotate_face(face, axis, 4 - turns);
                }
            }
            u8::try_from(face * 3).expect("small") + m % 3
        })
        .collect()
}

pub struct TwoPhase<'t> {
    tables: &'t TwoPhaseTables,
}

pub struct TwoPhaseOptions {
    pub max_length: usize,
    pub time_limit_ms: f64,
}

struct Search<'s, 't, H: Hooks> {
    tables: &'t TwoPhaseTables,
    hooks: &'s mut H,
    options: &'s TwoPhaseOptions,
    begin: f64,
    path: [u8; PHASE1_DEPTH_LIMIT + PHASE2_MOVE_LIMIT],
    best: Option<(Vec<u8>, Direction)>,
    best_length: usize,
    stopped_by: Option<StopReason>,
    phase1_nodes: u64,
    phase2_nodes: u64,
    current: Start,
    current_depth: usize,
}

fn is_phase2_move(m: usize) -> bool {
    PHASE2_MOVES.contains(&m)
}

impl<H: Hooks> Search<'_, '_, H> {
    fn phase1_heuristic(&self, twist: usize, flip: usize, slice: usize) -> u8 {
        let t = self.tables;
        t.slice_twist_prune[slice * N_TWIST + twist]
            .max(t.slice_flip_prune[slice * N_FLIP + flip])
            .max(t.twist_flip_prune[twist * N_FLIP + flip])
    }

    fn check_stop(&mut self) {
        let elapsed = self.hooks.now_ms() - self.begin;
        let best = self.best.as_ref().map(|_| self.best_length);
        let nodes = self.phase1_nodes + self.phase2_nodes;
        self.hooks.on_progress(self.current_depth, best, nodes);
        if self.hooks.should_stop() {
            self.stopped_by = Some(StopReason::Cancelled);
        } else if self.best.is_some() && elapsed > self.options.time_limit_ms {
            self.stopped_by = Some(StopReason::Time);
        }
    }

    fn phase2(
        &mut self,
        corners: usize,
        ud_edges: usize,
        slice: usize,
        togo: usize,
        last_face: i32,
        depth: usize,
    ) -> bool {
        if togo == 0 {
            return true;
        }
        let t = self.tables;
        for &m in &PHASE2_MOVES {
            let face = i32::try_from(m / 3).expect("small");
            let diff = last_face - face;
            if diff == 0 || diff == 3 {
                continue;
            }
            self.phase2_nodes += 1;
            let c = usize::from(t.corner_perm_move[corners * N_MOVES + m]);
            let u = usize::from(t.ud_edge_perm_move[ud_edges * N_MOVES + m]);
            let s = usize::from(t.slice_sorted_move[slice * N_MOVES + m]);
            let hc = t.corner_slice_prune[c * N_SLICE_PERM + s];
            let hu = t.ud_edge_slice_prune[u * N_SLICE_PERM + s];
            if usize::from(hc.max(hu)) >= togo {
                continue;
            }
            self.path[depth] = u8::try_from(m).expect("small");
            if self.phase2(c, u, s, togo - 1, face, depth + 1) {
                return true;
            }
        }
        false
    }

    fn phase1_solved(&mut self, length: usize, last_face: i32) {
        let t = self.tables;
        let mut corners = self.current.corners;
        let mut slice = self.current.slice_sorted;
        let mut u = self.current.u_edges;
        let mut d = self.current.d_edges;
        for i in 0..length {
            let m = usize::from(self.path[i]);
            corners = usize::from(t.corner_perm_move[corners * N_MOVES + m]);
            slice = usize::from(t.slice_sorted_move[slice * N_MOVES + m]);
            u = usize::from(t.u_edges_move[u * N_MOVES + m]);
            d = usize::from(t.d_edges_move[d * N_MOVES + m]);
        }
        let limit = (self.best_length.saturating_sub(length)).min(PHASE2_MOVE_LIMIT + 1);
        let hc = usize::from(t.corner_slice_prune[corners * N_SLICE_PERM + slice]);
        if hc >= limit {
            return;
        }
        let ud_edges = usize::from(t.ud_edges_from_groups[u * 24 + d % 24]);
        let hu = usize::from(t.ud_edge_slice_prune[ud_edges * N_SLICE_PERM + slice]);
        for togo in hc.max(hu)..limit {
            if self.phase2(corners, ud_edges, slice, togo, last_face, length) {
                self.best_length = length + togo;
                let path = self.path[..self.best_length].to_vec();
                self.hooks
                    .on_improvement(&to_original(&path, self.current.direction));
                self.best = Some((path, self.current.direction));
                if self.best_length <= self.options.max_length {
                    self.stopped_by = Some(StopReason::Target);
                }
                return;
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn phase1(
        &mut self,
        twist: usize,
        flip: usize,
        slice: usize,
        h: u8,
        togo: usize,
        last_face: i32,
        depth: usize,
    ) {
        if togo == 0 {
            self.phase1_solved(depth, last_face);
            if self.stopped_by.is_none() {
                self.check_stop();
            }
            return;
        }
        self.phase1_nodes += 1;
        if self.phase1_nodes.is_multiple_of(CHECK_INTERVAL) {
            self.check_stop();
        }
        let t = self.tables;
        for m in 0..N_MOVES {
            let face = i32::try_from(m / 3).expect("small");
            let diff = last_face - face;
            if diff == 0 || diff == 3 {
                continue;
            }
            // Already in G1 with few moves left: the rest is phase 2's job (Kociemba, solver.py).
            if h == 0 && togo < 5 && is_phase2_move(m) {
                continue;
            }
            let tw = usize::from(t.twist_move[twist * N_MOVES + m]);
            let fl = usize::from(t.flip_move[flip * N_MOVES + m]);
            let sl = usize::from(t.slice_move[slice * N_MOVES + m]);
            let next = self.phase1_heuristic(tw, fl, sl);
            if usize::from(next) >= togo {
                continue;
            }
            self.path[depth] = u8::try_from(m).expect("small");
            self.phase1(tw, fl, sl, next, togo - 1, face, depth + 1);
            if self.stopped_by.is_some() {
                return;
            }
        }
    }
}

impl<'t> TwoPhase<'t> {
    #[must_use]
    pub fn new(tables: &'t TwoPhaseTables) -> Self {
        Self { tables }
    }

    fn start(&self, cube: &CubieCube, direction: Direction) -> Start {
        let mut c = *cube;
        for _ in 0..direction.rotations {
            for &(axis, turns) in &DIAGONAL {
                c = cube::cubie::rotate_cube(&c, axis, turns);
            }
        }
        if direction.inverted {
            c = c.inverse();
        }
        let (tw, fl, sl) = (twist(&c.co), flip(&c.eo), slice(&c.ep));
        let t = self.tables;
        let h = t.slice_twist_prune[sl * N_TWIST + tw]
            .max(t.slice_flip_prune[sl * N_FLIP + fl])
            .max(t.twist_flip_prune[tw * N_FLIP + fl]);
        Start {
            direction,
            twist: tw,
            flip: fl,
            slice: sl,
            h,
            slice_sorted: slice_sorted(&c.ep),
            corners: corner_perm(&c.cp),
            u_edges: u_edges(&c.ep),
            d_edges: d_edges(&c.ep),
        }
    }

    pub fn solve<H: Hooks>(
        &self,
        cube: &CubieCube,
        options: &TwoPhaseOptions,
        hooks: &mut H,
    ) -> TwoPhaseResult {
        let starts: Vec<Start> = DIRECTIONS.iter().map(|&d| self.start(cube, d)).collect();
        let begin = hooks.now_ms();
        let mut search = Search {
            tables: self.tables,
            hooks,
            options,
            begin,
            path: [0; PHASE1_DEPTH_LIMIT + PHASE2_MOVE_LIMIT],
            best: None,
            best_length: usize::MAX,
            stopped_by: None,
            phase1_nodes: 0,
            phase2_nodes: 0,
            current: starts[0],
            current_depth: 0,
        };
        // Every direction gets depth d before any gets d + 1, so the first short phase 1 found in
        // any direction bounds all the others.
        let min_depth = starts.iter().map(|s| usize::from(s.h)).min().unwrap_or(0);
        'search: for depth in min_depth..PHASE1_DEPTH_LIMIT {
            for start in &starts {
                if depth >= search.best_length {
                    break 'search;
                }
                if usize::from(start.h) > depth {
                    continue;
                }
                search.current = *start;
                search.current_depth = depth;
                search.phase1(start.twist, start.flip, start.slice, start.h, depth, -1, 0);
                if search.stopped_by.is_some() {
                    break 'search;
                }
            }
        }
        TwoPhaseResult {
            moves: search
                .best
                .as_ref()
                .map(|(path, direction)| to_original(path, *direction)),
            stopped_by: search.stopped_by.unwrap_or(StopReason::Exhausted),
            nodes: search.phase1_nodes + search.phase2_nodes,
        }
    }
}
