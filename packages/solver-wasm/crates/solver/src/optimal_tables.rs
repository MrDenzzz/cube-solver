//! The optimal solver's prune table: distance mod 3 per (class, twist), 2 bits, 16 per word, in
//! the file layout of `optimal-tables.ts`, so either engine can load what the other saved.

use crate::sym_coordinates::{FlipSliceClasses, build_flip_slice_classes};
use crate::symmetry::{N_SYM, build_twist_conjugation};
use crate::tables::{N_MOVES, TwoPhaseTables};
use cube::coordinates::{N_CORNER_PERM, N_FLIP, N_TWIST};

const MAGIC: u32 = 0x3154_504f; // "OPT1"
const FORMAT_VERSION: u32 = 1;
pub const HEADER_WORDS: usize = 8;
const EMPTY: u32 = u32::MAX;
const PROGRESS_EVERY: usize = 4096;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tier {
    Standard,
    Huge,
}

pub struct OptimalTables {
    pub tier: Tier,
    pub classes: FlipSliceClasses,
    pub twist_conj: Vec<u16>,
    /// Header followed by the table words.
    pub file: Vec<u32>,
    pub restored: bool,
    pub corner_depth: Vec<u8>,
}

#[must_use]
pub fn prune_entries(classes: usize) -> usize {
    classes * N_TWIST
}

/// Words a file of this tier takes, header included.
#[must_use]
pub fn file_words(classes: usize) -> usize {
    HEADER_WORDS + prune_entries(classes).div_ceil(16)
}

fn checksum(words: &[u32]) -> u32 {
    words.iter().fold(0x811c_9dc5u32, |hash, &w| {
        (hash ^ w).wrapping_mul(0x0100_0193)
    })
}

fn word(value: usize) -> u32 {
    u32::try_from(value).expect("fits in 32 bits")
}

fn header(tier: Tier, classes: usize, table: &[u32]) -> [u32; HEADER_WORDS] {
    [
        MAGIC,
        FORMAT_VERSION,
        u32::from(tier == Tier::Huge),
        word(classes),
        word(prune_entries(classes)),
        checksum(table),
        0,
        0,
    ]
}

fn valid(file: &[u32], tier: Tier, classes: usize) -> bool {
    file.len() == file_words(classes)
        && file[..HEADER_WORDS] == header(tier, classes, &file[HEADER_WORDS..])
}

fn build_corner_depth(corner_perm_move: &[u16]) -> Vec<u8> {
    let mut depth = vec![u8::MAX; N_CORNER_PERM];
    depth[0] = 0;
    let mut done = 1;
    let mut level = 0u8;
    while done < N_CORNER_PERM {
        for c in 0..N_CORNER_PERM {
            if depth[c] != level {
                continue;
            }
            for m in 0..N_MOVES {
                let next = usize::from(corner_perm_move[c * N_MOVES + m]);
                if depth[next] == u8::MAX {
                    depth[next] = level + 1;
                    done += 1;
                }
            }
        }
        level += 1;
    }
    depth
}

#[inline]
fn get(table: &[u32], index: usize) -> u32 {
    (table[index >> 4] >> ((index & 15) << 1)) & 3
}

#[inline]
fn set(table: &mut [u32], index: usize, value: u32) {
    let shift = (index & 15) << 1;
    table[index >> 4] = (table[index >> 4] & !(3 << shift)) | (value << shift);
}

/// Breadth-first search over (class, twist); see `fillPruneTable` in `optimal-tables.ts`.
fn fill(
    table: &mut [u32],
    classes: &FlipSliceClasses,
    twist_conj: &[u16],
    moves: &TwoPhaseTables,
    progress: &mut dyn FnMut(usize, usize) -> bool,
) -> bool {
    let slice_moves = if classes.sorted {
        &moves.slice_sorted_move
    } else {
        &moves.slice_move
    };
    let total = prune_entries(classes.count);
    table.fill(EMPTY);
    set(table, 0, 0);
    let mut done = 1;
    let mut level = 0u32;
    while done < total {
        let backward = done > total / 2;
        let current = level % 3;
        let next = (level + 1) % 3;
        let mut found = 0;
        for c in 0..classes.count {
            if c % PROGRESS_EVERY == 0 && !progress(done + found, total) {
                return false;
            }
            let rep = classes.representative[c] as usize;
            let flip_row = (rep % N_FLIP) * N_MOVES;
            let slice_row = (rep / N_FLIP) * N_MOVES;
            let base = c * N_TWIST;
            let mut twist = 0;
            while twist < N_TWIST {
                let index = base + twist;
                let w = table[index >> 4];
                if !backward && w == EMPTY && index.is_multiple_of(16) && twist + 16 <= N_TWIST {
                    twist += 16;
                    continue;
                }
                let value = (w >> ((index & 15) << 1)) & 3;
                if if backward {
                    value != 3
                } else {
                    value != current
                } {
                    twist += 1;
                    continue;
                }
                let twist_row = twist * N_MOVES;
                for m in 0..N_MOVES {
                    let raw = usize::from(slice_moves[slice_row + m]) * N_FLIP
                        + usize::from(moves.flip_move[flip_row + m]);
                    let packed = classes.class_of[raw] as usize;
                    let c1 = packed >> 4;
                    let t1 = usize::from(
                        twist_conj
                            [usize::from(moves.twist_move[twist_row + m]) * N_SYM + (packed & 15)],
                    );
                    let index1 = c1 * N_TWIST + t1;
                    let value1 = get(table, index1);
                    if backward {
                        if value1 == current {
                            set(table, index, next);
                            found += 1;
                            break;
                        }
                        continue;
                    }
                    if value1 != 3 {
                        continue;
                    }
                    set(table, index1, next);
                    found += 1;
                    let stable = classes.stabilizer[c1];
                    if stable == 1 {
                        continue;
                    }
                    for s in 1..N_SYM {
                        if (stable >> s) & 1 == 0 {
                            continue;
                        }
                        let index2 = c1 * N_TWIST + usize::from(twist_conj[t1 * N_SYM + s]);
                        if get(table, index2) == 3 {
                            set(table, index2, next);
                            found += 1;
                        }
                    }
                }
                twist += 1;
            }
        }
        assert!(found > 0, "prune table stuck at {done} of {total}");
        done += found;
        level += 1;
    }
    progress(done, total);
    true
}

impl OptimalTables {
    /// Builds the tables, or adopts `saved` (header and table words) when it is a valid file of
    /// this tier. `progress` returns false to stop, which makes this return `None`.
    pub fn build(
        tier: Tier,
        moves: &TwoPhaseTables,
        saved: Option<Vec<u32>>,
        progress: &mut dyn FnMut(usize, usize) -> bool,
    ) -> Option<Self> {
        let classes = build_flip_slice_classes(tier == Tier::Huge);
        let twist_conj = build_twist_conjugation();
        let corner_depth = build_corner_depth(&moves.corner_perm_move);
        if let Some(file) = saved.filter(|file| valid(file, tier, classes.count)) {
            return Some(Self {
                tier,
                classes,
                twist_conj,
                file,
                restored: true,
                corner_depth,
            });
        }
        let mut file = vec![0u32; file_words(classes.count)];
        if !fill(
            &mut file[HEADER_WORDS..],
            &classes,
            &twist_conj,
            moves,
            progress,
        ) {
            return None;
        }
        let head = header(tier, classes.count, &file[HEADER_WORDS..]);
        file[..HEADER_WORDS].copy_from_slice(&head);
        Some(Self {
            tier,
            classes,
            twist_conj,
            file,
            restored: false,
            corner_depth,
        })
    }

    #[must_use]
    pub fn prune(&self) -> &[u32] {
        &self.file[HEADER_WORDS..]
    }

    #[must_use]
    pub fn bytes(&self) -> usize {
        self.file.len() * 4 + self.classes.class_of.len() * 4
    }
}

/// Words of a file of this tier, for callers that read a saved file into place.
#[must_use]
pub fn tier_file_words(tier: Tier) -> usize {
    use crate::sym_coordinates::{N_FLIPSLICE_CLASS, N_FLIPSLICESORTED_CLASS};
    file_words(if tier == Tier::Huge {
        N_FLIPSLICESORTED_CLASS
    } else {
        N_FLIPSLICE_CLASS
    })
}
