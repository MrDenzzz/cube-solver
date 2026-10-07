//! Search algorithms and pruning tables: the Rust counterparts of `@cube/solver-ts`, built to
//! produce byte-identical tables and the same solutions.

pub mod optimal;
pub mod optimal_tables;
pub mod sym_coordinates;
pub mod symmetry;
pub mod tables;
pub mod two_phase;

/// What a search needs from its host. `wasm32-unknown-unknown` has no clock, so time comes from
/// here too.
pub trait Hooks {
    fn now_ms(&self) -> f64;
    /// Polled during the search; returning true abandons it.
    fn should_stop(&mut self) -> bool;
    fn on_progress(&mut self, depth: usize, best_length: Option<usize>, nodes: u64);
    fn on_improvement(&mut self, moves: &[u8]);
}
