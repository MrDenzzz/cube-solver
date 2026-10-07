//! wasm-bindgen boundary between the Rust solvers and JavaScript. `src/index.ts` wraps it into the
//! engine-neutral `SolverEngine` of `@cube/solver-contracts`.

use cube::cubie::CubieCube;
use solver::Hooks;
use solver::optimal::Optimal;
use solver::optimal_tables::{OptimalTables, Tier};
use solver::tables::{TWO_PHASE_TABLE_COUNT, TwoPhaseTables};
use solver::two_phase::{StopReason, TwoPhase, TwoPhaseOptions};
use wasm_bindgen::prelude::{JsValue, wasm_bindgen};

#[wasm_bindgen(js_name = engineVersion)]
#[must_use]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

#[wasm_bindgen(typescript_custom_section)]
const CALLBACKS: &str = r"
/** How a search reports to JavaScript and learns that it should stop. */
export interface SearchCallbacks {
  now(): number;
  shouldStop(): boolean;
  /** `best` is -1 while no solution is known. */
  onProgress(depth: number, best: number, nodes: number): void;
  onImprovement(moves: Uint8Array): void;
}
/** Progress of a table build; returning false stops it. */
export interface BuildCallbacks {
  onProgress(done: number, total: number): boolean;
}
";

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "SearchCallbacks")]
    pub type SearchCallbacks;
    #[wasm_bindgen(method)]
    fn now(this: &SearchCallbacks) -> f64;
    #[wasm_bindgen(method, js_name = shouldStop)]
    fn should_stop(this: &SearchCallbacks) -> bool;
    #[wasm_bindgen(method, js_name = onProgress)]
    fn on_progress(this: &SearchCallbacks, depth: u32, best: i32, nodes: f64);
    #[wasm_bindgen(method, js_name = onImprovement)]
    fn on_improvement(this: &SearchCallbacks, moves: &[u8]);

    #[wasm_bindgen(typescript_type = "BuildCallbacks")]
    pub type BuildCallbacks;
    #[wasm_bindgen(method, js_name = onProgress)]
    fn on_build_progress(this: &BuildCallbacks, done: f64, total: f64) -> bool;
}

/// Calls back into JavaScript for time, progress and cancellation.
struct JsHooks<'h> {
    callbacks: &'h SearchCallbacks,
    /// The optimal search reports its solution only through the result.
    improvements: bool,
}

impl Hooks for JsHooks<'_> {
    fn now_ms(&self) -> f64 {
        self.callbacks.now()
    }

    fn should_stop(&mut self) -> bool {
        self.callbacks.should_stop()
    }

    #[allow(clippy::cast_precision_loss)]
    fn on_progress(&mut self, depth: usize, best_length: Option<usize>, nodes: u64) {
        let best = best_length.map_or(-1, |b| i32::try_from(b).unwrap_or(-1));
        // Node counts stay far below 2^53, where f64 stops being exact.
        self.callbacks
            .on_progress(u32::try_from(depth).unwrap_or(0), best, nodes as f64);
    }

    fn on_improvement(&mut self, moves: &[u8]) {
        if self.improvements {
            self.callbacks.on_improvement(moves);
        }
    }
}

/// The outcome of a solve, read by JavaScript through getters.
#[wasm_bindgen]
pub struct Outcome {
    moves: Option<Vec<u8>>,
    stopped_by: String,
    nodes: f64,
}

#[wasm_bindgen]
impl Outcome {
    /// Face turn indices, or undefined when cancelled before any solution.
    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn moves(&self) -> Option<Vec<u8>> {
        self.moves.clone()
    }

    #[wasm_bindgen(getter, js_name = stoppedBy)]
    #[must_use]
    pub fn stopped_by(&self) -> String {
        self.stopped_by.clone()
    }

    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn nodes(&self) -> f64 {
        self.nodes
    }
}

fn cube_from(bytes: &[u8]) -> Result<CubieCube, JsValue> {
    let invalid = || JsValue::from_str("A cube is 40 bytes: cp, co, ep, eo");
    if bytes.len() != 40 {
        return Err(invalid());
    }
    Ok(CubieCube {
        cp: bytes[0..8].try_into().map_err(|_| invalid())?,
        co: bytes[8..16].try_into().map_err(|_| invalid())?,
        ep: bytes[16..28].try_into().map_err(|_| invalid())?,
        eo: bytes[28..40].try_into().map_err(|_| invalid())?,
    })
}

fn reason(stop: StopReason) -> &'static str {
    match stop {
        StopReason::Target => "target",
        StopReason::Time => "time",
        StopReason::Cancelled => "cancelled",
        StopReason::Exhausted => "exhausted",
    }
}

fn not_ready(what: &str) -> JsValue {
    JsValue::from_str(what)
}

#[wasm_bindgen]
#[derive(Default)]
pub struct Engine {
    moves: Option<TwoPhaseTables>,
    optimal: Option<OptimalTables>,
    /// A saved table file being read in by JavaScript, and its size in bytes.
    staged: Option<(Vec<u32>, usize)>,
}

#[wasm_bindgen]
impl Engine {
    #[wasm_bindgen(constructor)]
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Builds the fast mode's tables, reporting each one done; returns their size in bytes.
    #[allow(clippy::cast_precision_loss)]
    pub fn init(&mut self, callbacks: &BuildCallbacks) -> f64 {
        let mut done = 0.0;
        let total = TWO_PHASE_TABLE_COUNT as f64;
        let tables = TwoPhaseTables::build(|_| {
            done += 1.0;
            callbacks.on_build_progress(done, total);
        });
        let bytes = tables.bytes() as f64;
        self.moves = Some(tables);
        bytes
    }

    /// Reserves memory for a saved table file and returns its address, where JavaScript writes
    /// the file without an intermediate copy.
    #[wasm_bindgen(js_name = allocateTableFile)]
    pub fn allocate_table_file(&mut self, bytes: usize) -> usize {
        let words = vec![0u32; bytes.div_ceil(4)];
        let address = words.as_ptr() as usize;
        self.staged = Some((words, bytes));
        address
    }

    /// Prepares the optimal tables, adopting the staged file when it is valid. Returns the
    /// tables' size in bytes, or -1 when the callbacks stopped the build.
    ///
    /// # Errors
    /// Before `init`.
    #[wasm_bindgen(js_name = prepareOptimal)]
    #[allow(clippy::cast_precision_loss)]
    pub fn prepare_optimal(
        &mut self,
        huge: bool,
        use_staged: bool,
        callbacks: &BuildCallbacks,
    ) -> Result<f64, JsValue> {
        let moves = self
            .moves
            .as_ref()
            .ok_or_else(|| not_ready("Call init() first"))?;
        let tier = if huge { Tier::Huge } else { Tier::Standard };
        let staged = self.staged.take().filter(|_| use_staged);
        let saved = staged.and_then(|(words, bytes)| (bytes % 4 == 0).then_some(words));
        // Free the previous tier first: two huge tables would not fit in 4 GiB.
        self.optimal = None;
        let mut report =
            |done: usize, total: usize| callbacks.on_build_progress(done as f64, total as f64);
        let tables = OptimalTables::build(tier, moves, saved, &mut report);
        let bytes = tables.as_ref().map_or(-1.0, |t| t.bytes() as f64);
        self.optimal = tables;
        Ok(bytes)
    }

    /// Whether the prepared tables came from the staged file.
    #[wasm_bindgen(getter)]
    #[must_use]
    pub fn restored(&self) -> bool {
        self.optimal.as_ref().is_some_and(|t| t.restored)
    }

    /// Address of the prepared table file in memory, for JavaScript to store it.
    #[wasm_bindgen(js_name = tableFileAddress)]
    #[must_use]
    pub fn table_file_address(&self) -> usize {
        self.optimal
            .as_ref()
            .map_or(0, |t| t.file.as_ptr() as usize)
    }

    #[wasm_bindgen(js_name = tableFileBytes)]
    #[must_use]
    pub fn table_file_bytes(&self) -> usize {
        self.optimal.as_ref().map_or(0, |t| t.file.len() * 4)
    }

    /// Two-phase solve of a cube given as 40 bytes (cp, co, ep, eo).
    ///
    /// # Errors
    /// Before `init`, or for a cube of the wrong size.
    #[wasm_bindgen(js_name = solveFast)]
    #[allow(clippy::cast_precision_loss)]
    pub fn solve_fast(
        &self,
        cube: &[u8],
        max_length: usize,
        time_limit_ms: f64,
        callbacks: &SearchCallbacks,
    ) -> Result<Outcome, JsValue> {
        let moves = self
            .moves
            .as_ref()
            .ok_or_else(|| not_ready("Call init() first"))?;
        let cube = cube_from(cube)?;
        let mut hooks = JsHooks {
            callbacks,
            improvements: true,
        };
        let options = TwoPhaseOptions {
            max_length,
            time_limit_ms,
        };
        let result = TwoPhase::new(moves).solve(&cube, &options, &mut hooks);
        Ok(Outcome {
            moves: result.moves,
            stopped_by: reason(result.stopped_by).to_owned(),
            nodes: result.nodes as f64,
        })
    }

    /// Optimal solve; `upper_bound` is a known solution or empty.
    ///
    /// # Errors
    /// Before the tables are prepared, or for a cube of the wrong size.
    #[wasm_bindgen(js_name = solveOptimal)]
    #[allow(clippy::cast_precision_loss)]
    pub fn solve_optimal(
        &self,
        cube: &[u8],
        upper_bound: &[u8],
        callbacks: &SearchCallbacks,
    ) -> Result<Outcome, JsValue> {
        let moves = self
            .moves
            .as_ref()
            .ok_or_else(|| not_ready("Call init() first"))?;
        let tables = self
            .optimal
            .as_ref()
            .ok_or_else(|| not_ready("Prepare the optimal tables first"))?;
        let cube = cube_from(cube)?;
        let mut hooks = JsHooks {
            callbacks,
            improvements: false,
        };
        let bound = (!upper_bound.is_empty()).then_some(upper_bound);
        let result = Optimal::new(tables, moves).solve(&cube, bound, &mut hooks);
        Ok(Outcome {
            moves: result.moves,
            stopped_by: (if result.cancelled {
                "cancelled"
            } else {
                "proven"
            })
            .to_owned(),
            nodes: result.nodes as f64,
        })
    }

    /// Exact distances along the three axes, for cross-checking engines.
    ///
    /// # Errors
    /// Before the tables are prepared, or for a cube of the wrong size.
    #[wasm_bindgen(js_name = axisDistances)]
    pub fn axis_distances(&self, cube: &[u8]) -> Result<Vec<u8>, JsValue> {
        Ok(self.optimal()?.axis_distances(&cube_from(cube)?).to_vec())
    }
}

impl Engine {
    fn optimal(&self) -> Result<Optimal<'_>, JsValue> {
        let moves = self
            .moves
            .as_ref()
            .ok_or_else(|| not_ready("Call init() first"))?;
        let tables = self
            .optimal
            .as_ref()
            .ok_or_else(|| not_ready("Prepare the optimal tables first"))?;
        Ok(Optimal::new(tables, moves))
    }
}

#[wasm_bindgen]
impl Engine {
    /// No solution of the cube is shorter than this.
    ///
    /// # Errors
    /// Before the tables are prepared, or for a cube of the wrong size.
    #[wasm_bindgen(js_name = lowerBound)]
    pub fn lower_bound(&self, cube: &[u8]) -> Result<usize, JsValue> {
        Ok(self.optimal()?.lower_bound(&cube_from(cube)?))
    }
}

#[cfg(test)]
mod tests {
    use super::engine_version;

    #[test]
    fn reports_crate_version() {
        assert_eq!(engine_version(), env!("CARGO_PKG_VERSION"));
    }
}
