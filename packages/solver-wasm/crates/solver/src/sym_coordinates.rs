//! Symmetry classes of flip × slice (`FlipUDSlice`) and flip × sorted slice (`FlipUDSliceSorted`);
//! see `sym-coordinates.ts`.

use crate::symmetry::{N_SYM, conjugate_edges, inverse_sym};
use cube::coordinates::{
    N_FLIP, N_SLICE, N_SLICE_SORTED, flip, set_flip, set_slice_sorted, slice_sorted,
};

pub const N_FLIPSLICE_CLASS: usize = 64_430;
pub const N_FLIPSLICESORTED_CLASS: usize = 1_523_864;

const UNASSIGNED: u32 = u32::MAX;

pub struct FlipSliceClasses {
    pub sorted: bool,
    pub count: usize,
    /// For each raw value: class << 4 | a symmetry taking it to the representative.
    pub class_of: Vec<u32>,
    pub representative: Vec<u32>,
    pub stabilizer: Vec<u16>,
}

#[must_use]
pub fn flip_slice_size(sorted: bool) -> usize {
    (if sorted { N_SLICE_SORTED } else { N_SLICE }) * N_FLIP
}

fn word(value: usize) -> u32 {
    u32::try_from(value).expect("fits in 32 bits")
}

/// # Panics
/// If the class count differs from Kociemba's published one, which would mean a bug.
#[must_use]
pub fn build_flip_slice_classes(sorted: bool) -> FlipSliceClasses {
    let size = flip_slice_size(sorted);
    let expected = if sorted {
        N_FLIPSLICESORTED_CLASS
    } else {
        N_FLIPSLICE_CLASS
    };
    let mut class_of = vec![UNASSIGNED; size];
    let mut representative = Vec::with_capacity(expected);
    let mut stabilizer = Vec::with_capacity(expected);
    let mut ep = [0u8; 12];
    let mut eo = [0u8; 12];
    let mut conj_ep = [0u8; 12];
    let mut conj_eo = [0u8; 12];
    for raw in 0..size {
        if class_of[raw] != UNASSIGNED {
            continue;
        }
        let class = representative.len();
        let slice = raw / N_FLIP;
        set_slice_sorted(if sorted { slice } else { slice * 24 }, &mut ep);
        set_flip(raw % N_FLIP, &mut eo);
        let mut stable = 0u16;
        for s in 0..N_SYM {
            conjugate_edges(s, &ep, &eo, &mut conj_ep, &mut conj_eo);
            let ss = slice_sorted(&conj_ep);
            let image = (if sorted { ss } else { ss / 24 }) * N_FLIP + flip(&conj_eo);
            if image == raw {
                stable |= 1 << s;
            }
            if class_of[image] == UNASSIGNED {
                class_of[image] = (word(class) << 4) | u32::from(inverse_sym(s));
            }
        }
        representative.push(word(raw));
        stabilizer.push(stable);
    }
    assert_eq!(representative.len(), expected, "flip-slice class count");
    FlipSliceClasses {
        sorted,
        count: expected,
        class_of,
        representative,
        stabilizer,
    }
}
