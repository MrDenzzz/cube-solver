//! wasm-bindgen boundary between the Rust solver and JavaScript.

use wasm_bindgen::prelude::wasm_bindgen;

#[wasm_bindgen(js_name = engineVersion)]
#[must_use]
pub fn engine_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

#[cfg(test)]
mod tests {
    use super::engine_version;

    #[test]
    fn reports_crate_version() {
        assert_eq!(engine_version(), env!("CARGO_PKG_VERSION"));
    }
}
