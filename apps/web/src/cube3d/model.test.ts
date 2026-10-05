import { FACES } from '@cube/core';
import { describe, expect, it } from 'vitest';
import { buildCubies, easeInOutCubic, layerMembers, turnAngle } from './model.ts';

describe('cube model for rendering', () => {
  it('has the 26 visible cubies of a 3×3×3 with 1, 2 or 3 stickers each', () => {
    const cubies = buildCubies(3);
    expect(cubies).toHaveLength(26);
    const counts = cubies.map((c) => c.stickers.length);
    expect(counts.filter((n) => n === 1)).toHaveLength(6);
    expect(counts.filter((n) => n === 2)).toHaveLength(12);
    expect(counts.filter((n) => n === 3)).toHaveLength(8);
  });

  it('has the 56 visible cubies of a 4×4×4', () => {
    expect(buildCubies(4)).toHaveLength(56);
  });

  it('puts nine cubies in every outer layer of a 3×3×3', () => {
    const cubies = buildCubies(3);
    for (const face of FACES) expect(layerMembers(cubies, 3, face)).toHaveLength(9);
    expect(layerMembers(cubies, 3, 'U', 2)).toHaveLength(8);
    expect(layerMembers(cubies, 3, 'U', 1, 3)).toHaveLength(26);
  });

  it('turns clockwise as a negative angle and takes the short way for X′', () => {
    expect(turnAngle(1)).toBeCloseTo(-Math.PI / 2);
    expect(turnAngle(2)).toBeCloseTo(-Math.PI);
    expect(turnAngle(3)).toBeCloseTo(Math.PI / 2);
  });

  it('eases from 0 to 1', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
    expect(easeInOutCubic(1)).toBe(1);
  });
});
