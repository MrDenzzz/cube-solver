//! Move tables and the two-phase pruning tables, built exactly as `tables.ts` builds them so that
//! the bytes match.

use cube::coordinates::{
    N_CORNER_PERM, N_FLIP, N_SLICE, N_SLICE_PERM, N_SLICE_SORTED, N_TWIST, N_U_EDGES_IN_G1,
    N_UD_EDGE_GROUP, N_UD_EDGE_PERM, corner_perm, d_edges, flip, set_corner_perm, set_d_edges,
    set_flip, set_slice_sorted, set_twist, set_u_edges, set_ud_edge_perm, slice_sorted, twist,
    u_edges, ud_edge_perm, unrank_permutation,
};
use cube::cubie::MOVE_CUBES;

pub const N_MOVES: usize = 18;

/// Moves of G1 = <U, D, R2, L2, F2, B2> as indices into the 18 face turns.
pub const PHASE2_MOVES: [usize; 10] = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16];

const UNVISITED: u8 = 255;

fn small(value: usize) -> u16 {
    u16::try_from(value).expect("coordinates fit in 16 bits")
}

/// table[c · 18 + m]: coordinate c after move m; moves outside `moves` stay 0.
fn corner_table(
    size: usize,
    set: impl Fn(usize, &mut [u8; 8], &mut [u8; 8]),
    get: impl Fn(&[u8; 8], &[u8; 8]) -> usize,
) -> Vec<u16> {
    let mut table = vec![0u16; size * N_MOVES];
    for c in 0..size {
        let mut cp = [0, 1, 2, 3, 4, 5, 6, 7];
        let mut co = [0u8; 8];
        set(c, &mut cp, &mut co);
        for (m, mv) in MOVE_CUBES.iter().enumerate() {
            let mut next_cp = [0u8; 8];
            let mut next_co = [0u8; 8];
            for i in 0..8 {
                let from = usize::from(mv.cp[i]);
                next_cp[i] = cp[from];
                next_co[i] = (co[from] + mv.co[i]) % 3;
            }
            table[c * N_MOVES + m] = small(get(&next_cp, &next_co));
        }
    }
    table
}

fn edge_table(
    size: usize,
    moves: &[usize],
    set: impl Fn(usize, &mut [u8; 12], &mut [u8; 12]),
    get: impl Fn(&[u8; 12], &[u8; 12]) -> usize,
) -> Vec<u16> {
    let mut table = vec![0u16; size * N_MOVES];
    for c in 0..size {
        let mut ep = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        let mut eo = [0u8; 12];
        set(c, &mut ep, &mut eo);
        for &m in moves {
            let mv = &MOVE_CUBES[m];
            let mut next_ep = [0u8; 12];
            let mut next_eo = [0u8; 12];
            for i in 0..12 {
                let from = usize::from(mv.ep[i]);
                next_ep[i] = ep[from];
                next_eo[i] = (eo[from] + mv.eo[i]) % 2;
            }
            table[c * N_MOVES + m] = small(get(&next_ep, &next_eo));
        }
    }
    table
}

/// Exact distances in the product of two coordinates, by breadth-first search from (0, 0), level
/// by level, switching to a backward search once more than half the entries are known.
fn pruning_table(
    size_a: usize,
    move_a: &[u16],
    size_b: usize,
    move_b: &[u16],
    moves: &[usize],
) -> Vec<u8> {
    let total = size_a * size_b;
    let mut depth = vec![UNVISITED; total];
    depth[0] = 0;
    let mut visited = 1;
    let mut level = 0u8;
    while visited < total {
        let backward = visited > total / 2;
        let next = level + 1;
        let mut found = 0;
        for a in 0..size_a {
            let row_a = a * N_MOVES;
            for b in 0..size_b {
                let index = a * size_b + b;
                let row_b = b * N_MOVES;
                if backward {
                    if depth[index] != UNVISITED {
                        continue;
                    }
                    for &m in moves {
                        let target = usize::from(move_a[row_a + m]) * size_b
                            + usize::from(move_b[row_b + m]);
                        if depth[target] == level {
                            depth[index] = next;
                            found += 1;
                            break;
                        }
                    }
                } else {
                    if depth[index] != level {
                        continue;
                    }
                    for &m in moves {
                        let target = usize::from(move_a[row_a + m]) * size_b
                            + usize::from(move_b[row_b + m]);
                        if depth[target] == UNVISITED {
                            depth[target] = next;
                            found += 1;
                        }
                    }
                }
            }
        }
        assert!(found > 0, "pruning table stuck at {visited} of {total}");
        visited += found;
        level = next;
    }
    depth
}

pub struct TwoPhaseTables {
    pub twist_move: Vec<u16>,
    pub flip_move: Vec<u16>,
    pub slice_move: Vec<u16>,
    pub slice_sorted_move: Vec<u16>,
    pub u_edges_move: Vec<u16>,
    pub d_edges_move: Vec<u16>,
    pub corner_perm_move: Vec<u16>,
    pub ud_edge_perm_move: Vec<u16>,
    pub ud_edges_from_groups: Vec<u16>,
    pub slice_twist_prune: Vec<u8>,
    pub slice_flip_prune: Vec<u8>,
    pub twist_flip_prune: Vec<u8>,
    pub corner_slice_prune: Vec<u8>,
    pub ud_edge_slice_prune: Vec<u8>,
}

pub const TWO_PHASE_TABLE_COUNT: usize = 14;

impl TwoPhaseTables {
    /// Builds all tables, calling `on_step` with the bytes of each as it is done.
    // One statement per table; splitting the list would not make it clearer.
    #[allow(clippy::too_many_lines)]
    pub fn build(mut on_step: impl FnMut(usize)) -> Self {
        let all: Vec<usize> = (0..N_MOVES).collect();
        let mut step16 = |table: Vec<u16>| {
            on_step(table.len() * 2);
            table
        };
        let twist_move = step16(corner_table(
            N_TWIST,
            |v, _, co| set_twist(v, co),
            |_, co| twist(co),
        ));
        let flip_move = step16(edge_table(
            N_FLIP,
            &all,
            |v, _, eo| set_flip(v, eo),
            |_, eo| flip(eo),
        ));
        let slice_sorted_move = step16(edge_table(
            N_SLICE_SORTED,
            &all,
            |v, ep, _| set_slice_sorted(v, ep),
            |ep, _| slice_sorted(ep),
        ));
        let slice_move = step16(
            (0..N_SLICE * N_MOVES)
                .map(|i| {
                    let (c, m) = (i / N_MOVES, i % N_MOVES);
                    slice_sorted_move[c * 24 * N_MOVES + m] / 24
                })
                .collect(),
        );
        let u_edges_move = step16(edge_table(
            N_UD_EDGE_GROUP,
            &all,
            |v, ep, _| set_u_edges(v, ep),
            |ep, _| u_edges(ep),
        ));
        let d_edges_move = step16(edge_table(
            N_UD_EDGE_GROUP,
            &all,
            |v, ep, _| set_d_edges(v, ep),
            |ep, _| d_edges(ep),
        ));
        let corner_perm_move = step16(corner_table(
            N_CORNER_PERM,
            |v, cp, _| set_corner_perm(v, cp),
            |cp, _| corner_perm(cp),
        ));
        let ud_edge_perm_move = step16(edge_table(
            N_UD_EDGE_PERM,
            &PHASE2_MOVES,
            |v, ep, _| set_ud_edge_perm(v, ep),
            |ep, _| ud_edge_perm(ep),
        ));
        // In G1 the U edges sit in positions 0..7 and the D edges fill the other four, so the
        // U-edge coordinate and the order of the D edges determine the 8-edge permutation.
        let ud_edges_from_groups = step16(
            (0..N_U_EDGES_IN_G1 * 24)
                .map(|i| {
                    let (u, d) = (i / 24, i % 24);
                    let mut ep = [0u8; 12];
                    set_u_edges(u, &mut ep);
                    let mut d_order = [0u8; 4];
                    unrank_permutation(d, &mut d_order);
                    let mut k = 0;
                    for slot in &mut ep[..8] {
                        if *slot >= 4 {
                            *slot = 4 + d_order[k];
                            k += 1;
                        }
                    }
                    small(ud_edge_perm(&ep))
                })
                .collect(),
        );
        let mut step8 = |table: Vec<u8>| {
            on_step(table.len());
            table
        };
        let slice_twist_prune = step8(pruning_table(
            N_SLICE,
            &slice_move,
            N_TWIST,
            &twist_move,
            &all,
        ));
        let slice_flip_prune = step8(pruning_table(
            N_SLICE,
            &slice_move,
            N_FLIP,
            &flip_move,
            &all,
        ));
        let twist_flip_prune = step8(pruning_table(
            N_TWIST,
            &twist_move,
            N_FLIP,
            &flip_move,
            &all,
        ));
        let corner_slice_prune = step8(pruning_table(
            N_CORNER_PERM,
            &corner_perm_move,
            N_SLICE_PERM,
            &slice_sorted_move,
            &PHASE2_MOVES,
        ));
        let ud_edge_slice_prune = step8(pruning_table(
            N_UD_EDGE_PERM,
            &ud_edge_perm_move,
            N_SLICE_PERM,
            &slice_sorted_move,
            &PHASE2_MOVES,
        ));
        Self {
            twist_move,
            flip_move,
            slice_move,
            slice_sorted_move,
            u_edges_move,
            d_edges_move,
            corner_perm_move,
            ud_edge_perm_move,
            ud_edges_from_groups,
            slice_twist_prune,
            slice_flip_prune,
            twist_flip_prune,
            corner_slice_prune,
            ud_edge_slice_prune,
        }
    }

    #[must_use]
    pub fn bytes(&self) -> usize {
        let wide = [
            &self.twist_move,
            &self.flip_move,
            &self.slice_move,
            &self.slice_sorted_move,
            &self.u_edges_move,
            &self.d_edges_move,
            &self.corner_perm_move,
            &self.ud_edge_perm_move,
            &self.ud_edges_from_groups,
        ];
        let narrow = [
            &self.slice_twist_prune,
            &self.slice_flip_prune,
            &self.twist_flip_prune,
            &self.corner_slice_prune,
            &self.ud_edge_slice_prune,
        ];
        wide.iter().map(|t| t.len() * 2).sum::<usize>()
            + narrow.iter().map(|t| t.len()).sum::<usize>()
    }
}
