import type { OptimalTier, SolveOptions } from '@cube/solver-contracts';
import type { OptimalStatus } from './client.ts';

export const MODES = ['fast', 'optimal'] as const;

/** What the solve panel controls; both modes' settings are kept while switching. */
export interface SolveSettings {
  readonly mode: (typeof MODES)[number];
  readonly maxLength: number;
  readonly timeLimitMs: number;
  readonly tier: OptimalTier;
}

export function toSolveOptions(settings: SolveSettings): SolveOptions {
  return settings.mode === 'fast'
    ? { mode: 'fast', maxLength: settings.maxLength, timeLimitMs: settings.timeLimitMs }
    : { mode: 'optimal', tier: settings.tier };
}

export function optimalReady(status: OptimalStatus, tier: OptimalTier): boolean {
  return status.kind === 'ready' && status.report.tier === tier;
}
