//! The 3×3×3 at cubie level, Kociemba's piece order and the "is replaced by" convention, as in
//! `cubie.ts` of `@cube/core`. Moves and rotations are derived from sticker geometry.

use crate::geometry::{
    B, D, F, FACE_COUNT, L, R, U, facelet_of_cubie, layer_turn_permutation, permute,
};
use std::sync::LazyLock;

/// Sticker faces of each corner (URF, UFL, ULB, UBR, DFR, DLF, DBL, DRB): the U/D sticker first,
/// then clockwise.
pub const CORNER_FACES: [[usize; 3]; 8] = [
    [U, R, F],
    [U, F, L],
    [U, L, B],
    [U, B, R],
    [D, F, R],
    [D, L, F],
    [D, B, L],
    [D, R, B],
];

/// Sticker faces of each edge (UR, UF, UL, UB, DR, DF, DL, DB, FR, FL, BL, BR).
pub const EDGE_FACES: [[usize; 2]; 12] = [
    [U, R],
    [U, F],
    [U, L],
    [U, B],
    [D, R],
    [D, F],
    [D, L],
    [D, B],
    [F, R],
    [F, L],
    [B, L],
    [B, R],
];

pub const STICKERS: usize = 54;

/// Facelet indices of each corner position, in the corner's reference order.
pub static CORNER_FACELETS: LazyLock<[[usize; 3]; 8]> =
    LazyLock::new(|| CORNER_FACES.map(|faces| faces.map(|face| facelet_of_cubie(3, face, &faces))));

/// Facelet indices of each edge position, in the edge's reference order.
pub static EDGE_FACELETS: LazyLock<[[usize; 2]; 12]> =
    LazyLock::new(|| EDGE_FACES.map(|faces| faces.map(|face| facelet_of_cubie(3, face, &faces))));

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct CubieCube {
    pub cp: [u8; 8],
    pub co: [u8; 8],
    pub ep: [u8; 12],
    pub eo: [u8; 12],
}

pub const SOLVED: CubieCube = CubieCube {
    cp: [0, 1, 2, 3, 4, 5, 6, 7],
    co: [0; 8],
    ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    eo: [0; 12],
};

fn index(value: usize) -> u8 {
    u8::try_from(value).expect("piece indices are small")
}

impl CubieCube {
    /// The state reached by applying `self` and then `other`.
    #[must_use]
    pub fn multiply(&self, other: &Self) -> Self {
        let mut out = SOLVED;
        for i in 0..8 {
            let from = usize::from(other.cp[i]);
            out.cp[i] = self.cp[from];
            out.co[i] = (self.co[from] + other.co[i]) % 3;
        }
        for i in 0..12 {
            let from = usize::from(other.ep[i]);
            out.ep[i] = self.ep[from];
            out.eo[i] = (self.eo[from] + other.eo[i]) % 2;
        }
        out
    }

    #[must_use]
    pub fn inverse(&self) -> Self {
        let mut out = SOLVED;
        for (position, &corner) in self.cp.iter().enumerate() {
            out.cp[usize::from(corner)] = index(position);
            out.co[usize::from(corner)] = (3 - self.co[position]) % 3;
        }
        for (position, &edge) in self.ep.iter().enumerate() {
            out.ep[usize::from(edge)] = index(position);
            out.eo[usize::from(edge)] = self.eo[position];
        }
        out
    }

    /// Face index shown by each of the 54 stickers.
    #[must_use]
    pub fn to_facelets(&self) -> [u8; STICKERS] {
        let mut facelets = [0u8; STICKERS];
        for (i, value) in facelets.iter_mut().enumerate() {
            *value = index(i / 9);
        }
        for position in 0..8 {
            let corner = usize::from(self.cp[position]);
            let twist = usize::from(self.co[position]);
            for k in 0..3 {
                facelets[CORNER_FACELETS[position][(k + twist) % 3]] =
                    index(CORNER_FACES[corner][k]);
            }
        }
        for position in 0..12 {
            let edge = usize::from(self.ep[position]);
            let flip = usize::from(self.eo[position]);
            for k in 0..2 {
                facelets[EDGE_FACELETS[position][(k + flip) % 2]] = index(EDGE_FACES[edge][k]);
            }
        }
        facelets
    }

    /// Reads the pieces back from stickers whose colours are face indices. Only for stickers that
    /// come from valid states: there is no validation beyond finding each piece.
    #[must_use]
    pub fn from_facelets(facelets: &[u8; STICKERS]) -> Option<Self> {
        let mut cube = SOLVED;
        for position in 0..8 {
            let shown = CORNER_FACELETS[position].map(|f| usize::from(facelets[f]));
            let twist = shown.iter().position(|&face| face == U || face == D)?;
            let corner = CORNER_FACES
                .iter()
                .position(|faces| faces.iter().all(|face| shown.contains(face)))?;
            cube.cp[position] = index(corner);
            cube.co[position] = index(twist);
        }
        for position in 0..12 {
            let shown = EDGE_FACELETS[position].map(|f| usize::from(facelets[f]));
            let edge = EDGE_FACES
                .iter()
                .position(|faces| faces.iter().all(|face| shown.contains(face)))?;
            cube.ep[position] = index(edge);
            cube.eo[position] = u8::from(shown[0] != EDGE_FACES[edge][0]);
        }
        Some(cube)
    }
}

fn solved_facelets() -> [u8; STICKERS] {
    SOLVED.to_facelets()
}

fn quarter_turn(face: usize) -> CubieCube {
    let turned = permute(&solved_facelets(), &layer_turn_permutation(3, face, 1, 1));
    CubieCube::from_facelets(&turned.try_into().expect("54 stickers")).expect("a valid move")
}

/// The 18 face turns in Kociemba's order: U, U2, U', R, …, B'.
pub static MOVE_CUBES: LazyLock<[CubieCube; 18]> = LazyLock::new(|| {
    let mut moves = [SOLVED; 18];
    for face in 0..FACE_COUNT {
        let quarter = quarter_turn(face);
        let mut power = SOLVED;
        for turns in 0..3 {
            power = power.multiply(&quarter);
            moves[face * 3 + turns] = power;
        }
    }
    moves
});

/// The same physical cube after a whole-cube rotation like turning `axis`, described relative
/// to its centres again: conjugation by the rotation.
///
/// # Panics
/// Never for a valid state: a rotation keeps it valid.
#[must_use]
pub fn rotate_cube(cube: &CubieCube, axis: usize, turns: u8) -> CubieCube {
    let mut stickers = cube.to_facelets().to_vec();
    for layer in 1..=3 {
        stickers = permute(&stickers, &layer_turn_permutation(3, axis, layer, turns));
    }
    // Each centre now names the face it sits on.
    let mut face_of = [0u8; FACE_COUNT];
    for face in 0..FACE_COUNT {
        face_of[usize::from(stickers[face * 9 + 4])] = index(face);
    }
    let relabelled: [u8; STICKERS] = stickers
        .iter()
        .map(|&c| face_of[usize::from(c)])
        .collect::<Vec<_>>()
        .try_into()
        .expect("54");
    CubieCube::from_facelets(&relabelled).expect("a rotation keeps the state valid")
}

#[cfg(test)]
mod tests {
    use super::{MOVE_CUBES, SOLVED, rotate_cube};
    use crate::geometry::{R, U};

    #[test]
    fn a_quarter_turn_has_order_four_and_its_cube_matches_the_published_one() {
        let r = MOVE_CUBES[3];
        assert_eq!(r.multiply(&r).multiply(&r).multiply(&r), SOLVED);
        // Kociemba's cubie-level R move (cubie.py of RubiksCube-TwophaseSolver).
        assert_eq!(r.cp, [4, 1, 2, 0, 7, 5, 6, 3]);
        assert_eq!(r.co, [2, 0, 0, 1, 1, 0, 0, 2]);
        assert_eq!(r.ep, [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0]);
        assert_eq!(r.eo, [0; 12]);
    }

    #[test]
    fn facelets_round_trip_and_inverse_undoes() {
        let cube = MOVE_CUBES[0]
            .multiply(&MOVE_CUBES[5])
            .multiply(&MOVE_CUBES[16]);
        assert_eq!(
            super::CubieCube::from_facelets(&cube.to_facelets()),
            Some(cube)
        );
        assert_eq!(cube.multiply(&cube.inverse()), SOLVED);
    }

    #[test]
    fn whole_cube_rotations_have_order_four() {
        let cube = MOVE_CUBES[3].multiply(&MOVE_CUBES[1]);
        let mut rotated = cube;
        for _ in 0..4 {
            rotated = rotate_cube(&rotated, R, 1);
        }
        assert_eq!(rotated, cube);
        assert_eq!(rotate_cube(&SOLVED, U, 1), SOLVED);
    }
}
