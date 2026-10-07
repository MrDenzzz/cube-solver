//! D4h, the 16 symmetries that keep the U/D axis, acting on stickers; see `symmetry.ts`.

use cube::coordinates::{N_TWIST, set_twist, twist};
use cube::cubie::{CORNER_FACELETS, CORNER_FACES, EDGE_FACELETS, EDGE_FACES, STICKERS};
use cube::geometry::{D, FACE_COUNT, U, face_with_normal, facelet_at, normal, sticker_at};
use std::sync::LazyLock;

pub const N_SYM: usize = 16;

type Matrix = [i32; 9];

const IDENTITY: Matrix = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// A quarter turn about U/D like U, a half turn about F/B, and the mirror image swapping R and L.
const GENERATORS: [Matrix; 3] = [
    [0, 0, -1, 0, 1, 0, 1, 0, 0],
    [-1, 0, 0, 0, -1, 0, 0, 0, 1],
    [-1, 0, 0, 0, 1, 0, 0, 0, 1],
];

fn apply(m: &Matrix, v: [i32; 3]) -> [i32; 3] {
    [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
    ]
}

fn compose(a: &Matrix, b: &Matrix) -> Matrix {
    let mut out = [0; 9];
    for r in 0..3 {
        for c in 0..3 {
            out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
        }
    }
    out
}

/// Breadth-first closure in the same order as `symmetry.ts`, so the indices agree.
fn closure() -> Vec<Matrix> {
    let mut group = vec![IDENTITY];
    let mut i = 0;
    while i < group.len() {
        for g in &GENERATORS {
            let product = compose(g, &group[i]);
            if !group.contains(&product) {
                group.push(product);
            }
        }
        i += 1;
    }
    group
}

pub struct Symmetry {
    pub sticker_to: [u8; STICKERS],
    pub face_to: [u8; FACE_COUNT],
    pub ep: [u8; 12],
    pub eo: [u8; 12],
    pub inverse_ep: [u8; 12],
    pub inverse_eo: [u8; 12],
}

fn small(value: usize) -> u8 {
    u8::try_from(value).expect("small")
}

fn symmetry(matrix: &Matrix) -> Symmetry {
    let mut sticker_to = [0u8; STICKERS];
    for (p, slot) in sticker_to.iter_mut().enumerate() {
        let (position, n) = sticker_at(3, p);
        *slot = small(facelet_at(3, apply(matrix, position), apply(matrix, n)));
    }
    let face_to = std::array::from_fn(|f| small(face_with_normal(apply(matrix, normal(f)))));
    let mut moved = [0u8; STICKERS];
    for p in 0..STICKERS {
        moved[usize::from(sticker_to[p])] = small(p / 9);
    }
    let mut ep = [0u8; 12];
    let mut eo = [0u8; 12];
    for (position, slots) in EDGE_FACELETS.iter().enumerate() {
        let shown = slots.map(|s| usize::from(moved[s]));
        let edge = EDGE_FACES
            .iter()
            .position(|faces| faces.iter().all(|f| shown.contains(f)))
            .expect("a symmetry maps edges to edges");
        ep[position] = small(edge);
        eo[position] = u8::from(shown[0] != EDGE_FACES[edge][0]);
    }
    let mut inverse_ep = [0u8; 12];
    let mut inverse_eo = [0u8; 12];
    for i in 0..12 {
        inverse_ep[usize::from(ep[i])] = small(i);
        inverse_eo[usize::from(ep[i])] = eo[i];
    }
    Symmetry {
        sticker_to,
        face_to,
        ep,
        eo,
        inverse_ep,
        inverse_eo,
    }
}

struct Group {
    symmetries: Vec<Symmetry>,
    inverse: [u8; N_SYM],
}

static GROUP: LazyLock<Group> = LazyLock::new(|| {
    let matrices = closure();
    assert_eq!(matrices.len(), N_SYM, "D4h has 16 elements");
    let inverse = std::array::from_fn(|s| {
        let m = &matrices[s];
        let transpose = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
        small(
            matrices
                .iter()
                .position(|other| *other == transpose)
                .expect("a group"),
        )
    });
    Group {
        symmetries: matrices.iter().map(symmetry).collect(),
        inverse,
    }
});

#[must_use]
pub fn inverse_sym(s: usize) -> u8 {
    GROUP.inverse[s]
}

/// Conjugates edges: `R⁻¹ · X · R` in the cubie multiplication.
pub fn conjugate_edges(
    s: usize,
    ep: &[u8; 12],
    eo: &[u8; 12],
    out_ep: &mut [u8; 12],
    out_eo: &mut [u8; 12],
) {
    let sym = &GROUP.symmetries[s];
    for i in 0..12 {
        let j = usize::from(sym.ep[i]);
        let edge = usize::from(ep[j]);
        out_ep[i] = sym.inverse_ep[edge];
        out_eo[i] = sym.inverse_eo[edge] ^ eo[j] ^ sym.eo[i];
    }
}

/// `twist_conj[twist · 16 + s]`, read off the conjugated stickers.
///
/// # Panics
/// Never: every conjugated corner shows one U or D sticker.
#[must_use]
pub fn build_twist_conjugation() -> Vec<u16> {
    let mut table = vec![0u16; N_TWIST * N_SYM];
    let mut co = [0u8; 8];
    let mut faces = [0u8; STICKERS];
    for t in 0..N_TWIST {
        set_twist(t, &mut co);
        for i in 0..8 {
            for k in 0..3 {
                faces[CORNER_FACELETS[i][(k + usize::from(co[i])) % 3]] = small(CORNER_FACES[i][k]);
            }
        }
        for s in 0..N_SYM {
            let sym = &GROUP.symmetries[s];
            let mut conjugated = [0u8; STICKERS];
            for p in 0..STICKERS {
                conjugated[usize::from(sym.sticker_to[p])] = sym.face_to[usize::from(faces[p])];
            }
            let mut twisted = [0u8; 8];
            for i in 0..8 {
                let slots = CORNER_FACELETS[i];
                let k = slots
                    .iter()
                    .position(|&slot| {
                        let face = usize::from(conjugated[slot]);
                        face == U || face == D
                    })
                    .expect("one U or D sticker per corner");
                twisted[i] = small(k);
            }
            table[t * N_SYM + s] = u16::try_from(twist(&twisted)).expect("small");
        }
    }
    table
}
