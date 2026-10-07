//! Kociemba's coordinates with exactly the encodings of `coordinates.ts` in `@cube/solver-ts`,
//! so that both engines index their tables the same way and produce identical bytes.

pub const N_TWIST: usize = 2187;
pub const N_FLIP: usize = 2048;
pub const N_SLICE: usize = 495;
pub const N_SLICE_SORTED: usize = 11880;
pub const N_UD_EDGE_GROUP: usize = 11880;
pub const N_CORNER_PERM: usize = 40320;
pub const N_UD_EDGE_PERM: usize = 40320;
pub const N_SLICE_PERM: usize = 24;
pub const N_U_EDGES_IN_G1: usize = 1680;

const SLICE_EDGE: u8 = 8;
const U_EDGE: u8 = 0;
const D_EDGE: u8 = 4;

const fn binomials() -> [[u32; 13]; 13] {
    let mut table = [[0u32; 13]; 13];
    let mut n = 0;
    while n <= 12 {
        table[n][0] = 1;
        let mut k = 1;
        while k <= n {
            table[n][k] = table[n - 1][k - 1] + if k < n { table[n - 1][k] } else { 0 };
            k += 1;
        }
        n += 1;
    }
    table
}

const BINOMIAL: [[u32; 13]; 13] = binomials();

#[must_use]
pub fn choose(n: usize, k: usize) -> u32 {
    if k > n { 0 } else { BINOMIAL[n][k] }
}

fn small(value: usize) -> u8 {
    u8::try_from(value).expect("fits in a byte")
}

/// Lehmer-code rank of a permutation of 0..n−1; the identity has rank 0.
#[must_use]
pub fn rank_permutation(p: &[u8]) -> usize {
    let n = p.len();
    let mut rank = 0;
    for i in 0..n {
        let smaller = p[i + 1..].iter().filter(|&&x| x < p[i]).count();
        rank = rank * (n - i) + smaller;
    }
    rank
}

pub fn unrank_permutation(mut rank: usize, out: &mut [u8]) {
    let n = out.len();
    for i in (0..n).rev() {
        out[i] = small(rank % (n - i));
        rank /= n - i;
    }
    for i in (0..n.saturating_sub(1)).rev() {
        for j in i + 1..n {
            if out[j] >= out[i] {
                out[j] += 1;
            }
        }
    }
}

/// Colex rank of ascending positions: Σ C(pᵢ, i+1).
#[must_use]
pub fn rank_combination(positions: &[u8]) -> usize {
    positions
        .iter()
        .enumerate()
        .map(|(i, &p)| choose(usize::from(p), i + 1) as usize)
        .sum()
}

pub fn unrank_combination(mut rank: usize, out: &mut [u8]) {
    for i in (0..out.len()).rev() {
        let mut p = i;
        while choose(p + 1, i + 1) as usize <= rank {
            p += 1;
        }
        out[i] = small(p);
        rank -= choose(p, i + 1) as usize;
    }
}

#[must_use]
pub fn twist(co: &[u8; 8]) -> usize {
    co[..7].iter().fold(0, |t, &o| 3 * t + usize::from(o))
}

pub fn set_twist(mut value: usize, co: &mut [u8; 8]) {
    let mut total = 0;
    for i in (0..7).rev() {
        co[i] = small(value % 3);
        total += usize::from(co[i]);
        value /= 3;
    }
    co[7] = small((3 - total % 3) % 3);
}

#[must_use]
pub fn flip(eo: &[u8; 12]) -> usize {
    eo[..11].iter().fold(0, |f, &o| 2 * f + usize::from(o))
}

pub fn set_flip(mut value: usize, eo: &mut [u8; 12]) {
    let mut total = 0;
    for i in (0..11).rev() {
        eo[i] = small(value & 1);
        total += usize::from(eo[i]);
        value >>= 1;
    }
    eo[11] = small(total & 1);
}

/// Positions (colex, mirrored as 11 − p when `mirrored`) and order of edges first..first+3.
fn edge_group(ep: &[u8; 12], first: u8, mirrored: bool) -> usize {
    let mut positions = [0u8; 4];
    let mut order = [0u8; 4];
    let mut found = 0;
    for (p, &edge) in ep.iter().enumerate() {
        if edge >= first && edge < first + 4 {
            let slot = if mirrored { 3 - found } else { found };
            positions[slot] = small(if mirrored { 11 - p } else { p });
            order[found] = edge - first;
            found += 1;
        }
    }
    rank_combination(&positions) * 24 + rank_permutation(&order)
}

fn set_edge_group(value: usize, first: u8, mirrored: bool, ep: &mut [u8; 12]) {
    let mut ranked = [0u8; 4];
    unrank_combination(value / 24, &mut ranked);
    let mut positions = ranked.map(|p| if mirrored { 11 - p } else { p });
    positions.sort_unstable();
    let mut order = [0u8; 4];
    unrank_permutation(value % 24, &mut order);
    ep.fill(u8::MAX);
    for (i, &p) in positions.iter().enumerate() {
        ep[usize::from(p)] = first + order[i];
    }
    let mut other = 0u8;
    for slot in ep.iter_mut() {
        if *slot != u8::MAX {
            continue;
        }
        while other >= first && other < first + 4 {
            other += 1;
        }
        *slot = other;
        other += 1;
    }
}

#[must_use]
pub fn slice_sorted(ep: &[u8; 12]) -> usize {
    edge_group(ep, SLICE_EDGE, true)
}

pub fn set_slice_sorted(value: usize, ep: &mut [u8; 12]) {
    set_edge_group(value, SLICE_EDGE, true, ep);
}

#[must_use]
pub fn u_edges(ep: &[u8; 12]) -> usize {
    edge_group(ep, U_EDGE, false)
}

pub fn set_u_edges(value: usize, ep: &mut [u8; 12]) {
    set_edge_group(value, U_EDGE, false, ep);
}

#[must_use]
pub fn d_edges(ep: &[u8; 12]) -> usize {
    edge_group(ep, D_EDGE, false)
}

pub fn set_d_edges(value: usize, ep: &mut [u8; 12]) {
    set_edge_group(value, D_EDGE, false, ep);
}

#[must_use]
pub fn slice(ep: &[u8; 12]) -> usize {
    slice_sorted(ep) / 24
}

#[must_use]
pub fn corner_perm(cp: &[u8; 8]) -> usize {
    rank_permutation(cp)
}

pub fn set_corner_perm(value: usize, cp: &mut [u8; 8]) {
    unrank_permutation(value, cp);
}

/// Permutation of the U and D edges, which in G1 occupy positions 0..7.
#[must_use]
pub fn ud_edge_perm(ep: &[u8; 12]) -> usize {
    rank_permutation(&ep[..8])
}

pub fn set_ud_edge_perm(value: usize, ep: &mut [u8; 12]) {
    unrank_permutation(value, &mut ep[..8]);
    for (p, slot) in ep.iter_mut().enumerate().skip(8) {
        *slot = small(p);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        N_SLICE_SORTED, N_TWIST, N_UD_EDGE_GROUP, rank_combination, rank_permutation,
        set_slice_sorted, set_twist, set_u_edges, slice_sorted, twist, u_edges, unrank_combination,
        unrank_permutation,
    };

    #[test]
    fn permutations_and_combinations_round_trip() {
        for rank in 0..120 {
            let mut p = [0u8; 5];
            unrank_permutation(rank, &mut p);
            assert_eq!(rank_permutation(&p), rank);
        }
        for rank in 0..495 {
            let mut c = [0u8; 4];
            unrank_combination(rank, &mut c);
            assert_eq!(rank_combination(&c), rank);
        }
    }

    #[test]
    fn coordinates_round_trip() {
        for value in 0..N_TWIST {
            let mut co = [0u8; 8];
            set_twist(value, &mut co);
            assert_eq!(twist(&co), value);
        }
        for value in 0..N_SLICE_SORTED {
            let mut ep = [0u8; 12];
            set_slice_sorted(value, &mut ep);
            assert_eq!(slice_sorted(&ep), value);
        }
        for value in 0..N_UD_EDGE_GROUP {
            let mut ep = [0u8; 12];
            set_u_edges(value, &mut ep);
            assert_eq!(u_edges(&ep), value);
        }
    }

    #[test]
    fn the_solved_cube_is_zero() {
        let solved = crate::cubie::SOLVED;
        assert_eq!(twist(&solved.co), 0);
        assert_eq!(slice_sorted(&solved.ep), 0);
        assert_eq!(u_edges(&solved.ep), 0);
    }
}
