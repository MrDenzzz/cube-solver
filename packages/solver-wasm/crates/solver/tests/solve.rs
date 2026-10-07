use cube::cubie::{CubieCube, MOVE_CUBES, SOLVED};
use solver::Hooks;
use solver::optimal::Optimal;
use solver::optimal_tables::{OptimalTables, Tier};
use solver::tables::TwoPhaseTables;
use solver::two_phase::{StopReason, TwoPhase, TwoPhaseOptions};
use std::sync::LazyLock;
use std::time::Instant;

struct Clock(Instant);

impl Hooks for Clock {
    fn now_ms(&self) -> f64 {
        self.0.elapsed().as_secs_f64() * 1000.0
    }
    fn should_stop(&mut self) -> bool {
        false
    }
    fn on_progress(&mut self, _: usize, _: Option<usize>, _: u64) {}
    fn on_improvement(&mut self, _: &[u8]) {}
}

static MOVES: LazyLock<TwoPhaseTables> = LazyLock::new(|| TwoPhaseTables::build(|_| {}));
static STANDARD: LazyLock<OptimalTables> = LazyLock::new(|| {
    OptimalTables::build(Tier::Standard, &MOVES, None, &mut |_, _| true).expect("built")
});

fn apply(cube: &CubieCube, moves: &[u8]) -> CubieCube {
    moves
        .iter()
        .fold(*cube, |c, &m| c.multiply(&MOVE_CUBES[usize::from(m)]))
}

/// A pseudo-random sequence of moves, deterministic so failures reproduce.
fn scramble(seed: u64, length: usize) -> Vec<u8> {
    let mut state = seed;
    (0..length)
        .map(|_| {
            state = state
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            u8::try_from((state >> 33) % 18).expect("small")
        })
        .collect()
}

fn brute_force(cube: &CubieCube, limit: usize) -> usize {
    fn search(c: &CubieCube, togo: usize, last: i32) -> bool {
        if togo == 0 {
            return *c == SOLVED;
        }
        (0..18u8).any(|m| {
            let face = i32::from(m / 3);
            let diff = last - face;
            diff != 0
                && diff != 3
                && search(&c.multiply(&MOVE_CUBES[usize::from(m)]), togo - 1, face)
        })
    }
    (0..=limit)
        .find(|&d| search(cube, d, -1))
        .unwrap_or(usize::MAX)
}

#[test]
fn two_phase_solves_deep_scrambles() {
    let solver = TwoPhase::new(&MOVES);
    for seed in 0..10 {
        let cube = apply(&SOLVED, &scramble(seed, 30));
        let result = solver.solve(
            &cube,
            &TwoPhaseOptions {
                max_length: 21,
                time_limit_ms: 10_000.0,
            },
            &mut Clock(Instant::now()),
        );
        let moves = result.moves.expect("a solution");
        assert_eq!(result.stopped_by, StopReason::Target);
        assert!(moves.len() <= 21);
        assert_eq!(apply(&cube, &moves), SOLVED);
    }
}

#[test]
fn optimal_agrees_with_brute_force_on_short_scrambles() {
    let solver = Optimal::new(&STANDARD, &MOVES);
    for seed in 0..20 {
        let length = 1 + usize::try_from(seed % 5).expect("small");
        let cube = apply(&SOLVED, &scramble(seed + 100, length));
        let result = solver.solve(&cube, None, &mut Clock(Instant::now()));
        let moves = result.moves.expect("a solution");
        assert_eq!(apply(&cube, &moves), SOLVED);
        assert_eq!(moves.len(), brute_force(&cube, length));
    }
}

#[test]
fn optimal_proves_a_known_solution_without_the_last_search() {
    let solver = Optimal::new(&STANDARD, &MOVES);
    let cube = apply(&SOLVED, &scramble(7, 9));
    let found = solver.solve(&cube, None, &mut Clock(Instant::now()));
    let known = found.moves.expect("a solution");
    let proved = solver.solve(&cube, Some(&known), &mut Clock(Instant::now()));
    assert!(proved.proved_bound);
    assert!(proved.nodes < found.nodes);
}
