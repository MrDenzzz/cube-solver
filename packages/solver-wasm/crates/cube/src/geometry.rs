//! Stickers of an N×N×N cube as points with normals, and layer turns as rotations of them.
//! The same construction as `geometry.ts` in `@cube/core`, so both engines derive identical moves.

/// Faces in Kociemba's order, which is also the facelet string order.
pub const U: usize = 0;
pub const R: usize = 1;
pub const F: usize = 2;
pub const D: usize = 3;
pub const L: usize = 4;
pub const B: usize = 5;
pub const FACE_COUNT: usize = 6;

pub type Vec3 = [i32; 3];

struct Frame {
    normal: Vec3,
    right: Vec3,
    down: Vec3,
}

// x points to R, y to U, z to F. `right` and `down` give the reading order of each face in the
// facelet string, as seen from outside.
const FRAMES: [Frame; FACE_COUNT] = [
    Frame {
        normal: [0, 1, 0],
        right: [1, 0, 0],
        down: [0, 0, 1],
    },
    Frame {
        normal: [1, 0, 0],
        right: [0, 0, -1],
        down: [0, -1, 0],
    },
    Frame {
        normal: [0, 0, 1],
        right: [1, 0, 0],
        down: [0, -1, 0],
    },
    Frame {
        normal: [0, -1, 0],
        right: [1, 0, 0],
        down: [0, 0, -1],
    },
    Frame {
        normal: [-1, 0, 0],
        right: [0, 0, 1],
        down: [0, -1, 0],
    },
    Frame {
        normal: [0, 0, -1],
        right: [-1, 0, 0],
        down: [0, -1, 0],
    },
];

#[must_use]
pub fn normal(face: usize) -> Vec3 {
    FRAMES[face].normal
}

/// The face whose outward normal is `n`.
///
/// # Panics
/// If `n` is not a face normal.
#[must_use]
pub fn face_with_normal(n: Vec3) -> usize {
    FRAMES
        .iter()
        .position(|frame| frame.normal == n)
        .expect("not a face normal")
}

#[must_use]
pub fn dot(a: Vec3, b: Vec3) -> i32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn cross(a: Vec3, b: Vec3) -> Vec3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn add(a: Vec3, b: Vec3) -> Vec3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

fn scale(v: Vec3, k: i32) -> Vec3 {
    [v[0] * k, v[1] * k, v[2] * k]
}

/// Quarter turn clockwise as seen from outside the face whose normal is `axis`:
/// Rodrigues' formula for −90°, v' = a(a·v) − a×v.
#[must_use]
pub fn rotate_clockwise(axis: Vec3, v: Vec3) -> Vec3 {
    add(scale(axis, dot(axis, v)), scale(cross(axis, v), -1))
}

#[must_use]
pub fn rotate_turns(axis: Vec3, v: Vec3, turns: u8) -> Vec3 {
    (0..turns).fold(v, |w, _| rotate_clockwise(axis, w))
}

#[must_use]
pub fn sticker_count(size: usize) -> usize {
    6 * size * size
}

fn signed(value: usize) -> i32 {
    i32::try_from(value).expect("cube sizes are small")
}

/// Position and normal of a sticker. Cubie centres use odd coordinates in −(N−1)..N−1.
#[must_use]
pub fn sticker_at(size: usize, facelet: usize) -> (Vec3, Vec3) {
    let per_face = size * size;
    let frame = &FRAMES[facelet / per_face];
    let row = signed((facelet % per_face) / size);
    let column = signed(facelet % size);
    let n = signed(size);
    let position = add(
        add(
            scale(frame.normal, n - 1),
            scale(frame.right, 2 * column - (n - 1)),
        ),
        scale(frame.down, 2 * row - (n - 1)),
    );
    (position, frame.normal)
}

/// The facelet index of the sticker at `position` facing `normal`.
///
/// # Panics
/// If the point is not a sticker of this cube.
#[must_use]
pub fn facelet_at(size: usize, position: Vec3, normal: Vec3) -> usize {
    let face = face_with_normal(normal);
    let frame = &FRAMES[face];
    let n = signed(size);
    let column = usize::try_from((dot(position, frame.right) + n - 1) / 2).expect("on the cube");
    let row = usize::try_from((dot(position, frame.down) + n - 1) / 2).expect("on the cube");
    face * size * size + row * size + column
}

/// Facelet of the sticker on `face` of the cubie that touches all of `faces`.
#[must_use]
pub fn facelet_of_cubie(size: usize, face: usize, faces: &[usize]) -> usize {
    let n = signed(size);
    let position = faces
        .iter()
        .fold([0, 0, 0], |p, &f| add(p, scale(normal(f), n - 1)));
    facelet_at(size, position, normal(face))
}

/// Facelet permutation of turning `layer` (1 = outer) of `face` by `turns` clockwise quarter
/// turns. Maps each destination to its source.
#[must_use]
pub fn layer_turn_permutation(size: usize, face: usize, layer: usize, turns: u8) -> Vec<usize> {
    let axis = normal(face);
    let depth = signed(size) - 1 - 2 * (signed(layer) - 1);
    let mut permutation: Vec<usize> = (0..sticker_count(size)).collect();
    for source in 0..sticker_count(size) {
        let (position, sticker_normal) = sticker_at(size, source);
        if dot(position, axis) != depth {
            continue;
        }
        let target = facelet_at(
            size,
            rotate_turns(axis, position, turns),
            rotate_turns(axis, sticker_normal, turns),
        );
        permutation[target] = source;
    }
    permutation
}

#[must_use]
pub fn permute<T: Copy>(items: &[T], permutation: &[usize]) -> Vec<T> {
    permutation.iter().map(|&source| items[source]).collect()
}

/// The face that `face` moves to under a whole-cube rotation like turning `axis`.
#[must_use]
pub fn rotate_face(face: usize, axis: usize, turns: u8) -> usize {
    face_with_normal(rotate_turns(normal(axis), normal(face), turns))
}

#[cfg(test)]
mod tests {
    use super::{
        F, R, U, facelet_at, layer_turn_permutation, rotate_face, sticker_at, sticker_count,
    };

    #[test]
    fn stickers_round_trip_for_any_size() {
        for size in 2..=5 {
            for facelet in 0..sticker_count(size) {
                let (position, normal) = sticker_at(size, facelet);
                assert_eq!(facelet_at(size, position, normal), facelet);
            }
        }
    }

    #[test]
    fn four_quarter_turns_are_the_identity() {
        let mut stickers: Vec<usize> = (0..54).collect();
        let quarter = layer_turn_permutation(3, R, 1, 1);
        for _ in 0..4 {
            stickers = super::permute(&stickers, &quarter);
        }
        assert_eq!(stickers, (0..54).collect::<Vec<_>>());
    }

    #[test]
    fn rotations_move_faces_like_x_y_z() {
        assert_eq!(rotate_face(F, R, 1), U);
        assert_eq!(rotate_face(R, U, 1), F);
        assert_eq!(rotate_face(U, F, 1), R);
    }
}
