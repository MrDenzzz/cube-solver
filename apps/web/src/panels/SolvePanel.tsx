import type { OptimalTier } from '@cube/solver-contracts';
import { useI18n } from '../i18n/i18n.ts';
import type { OptimalStatus, SolverStatus } from '../solver/client.ts';
import { MODES, optimalReady, type SolveSettings } from '../solver/settings.ts';
import type { SolveSession } from '../solver/useSolveSession.ts';
import { cx } from '../ui/cx.ts';
import styles from '../ui/ui.module.css';

const TARGETS = [18, 19, 20, 21, 22] as const;
const TIME_LIMITS_MS = [500, 1000, 2000, 5000, 10_000] as const;
const TIERS: readonly OptimalTier[] = ['standard', 'huge'];

function SolverStatusLine({ status }: { readonly status: SolverStatus }) {
  const { t, number } = useI18n();
  switch (status.kind) {
    case 'starting':
      return (
        <>
          <p className={styles.muted}>{t('solve.preparing')}</p>
          <progress className={styles.progress} value={status.done} max={status.total} />
        </>
      );
    case 'failed':
      return <p className={styles.errors}>{t('solve.failed', { message: status.message })}</p>;
    case 'ready':
      return (
        <p className={styles.muted}>
          {t('solve.ready', {
            size: number(Math.round((status.tableBytes / 2 ** 20) * 10) / 10),
            ms: Math.round(status.initMs),
          })}
        </p>
      );
  }
}

function OptimalStatusLine({
  status,
  tier,
  onPrepare,
}: {
  readonly status: OptimalStatus;
  readonly tier: OptimalTier;
  readonly onPrepare: () => void;
}) {
  const { t, duration } = useI18n();
  if (status.kind === 'preparing' && status.tier === tier) {
    return (
      <>
        <p className={styles.muted}>
          {t('solve.optimal.preparing', {
            percent: Math.floor((status.done / status.total) * 100),
          })}
        </p>
        <progress className={styles.progress} value={status.done} max={status.total} />
      </>
    );
  }
  if (status.kind === 'ready' && status.report.tier === tier) {
    const { report } = status;
    const time = duration(report.ms);
    const text =
      report.source === 'cache'
        ? t('solve.optimal.loaded', { time })
        : report.cacheError === null
          ? t('solve.optimal.built', { time })
          : t('solve.optimal.notSaved', { time, message: report.cacheError });
    return <p className={styles.muted}>{text}</p>;
  }
  return (
    <>
      {status.kind === 'failed' && status.tier === tier && (
        <p className={styles.errors}>{t('solve.optimal.failed', { message: status.message })}</p>
      )}
      <div className={styles.row}>
        <button
          type="button"
          className={styles.button}
          disabled={status.kind === 'preparing'}
          onClick={onPrepare}
        >
          {t('solve.optimal.prepare')}
        </button>
      </div>
    </>
  );
}

function SessionLine({ session }: { readonly session: SolveSession }) {
  const { t, moves, compact, duration } = useI18n();
  switch (session.kind) {
    case 'idle':
      return null;
    case 'error':
      return <p className={styles.errors}>{session.message}</p>;
    case 'solving': {
      const { progress, bestLength, mode } = session;
      if (mode === 'optimal') {
        return (
          <p className={styles.status} aria-live="polite">
            {progress === null
              ? t('solve.preparing')
              : t('solve.optimal.searching', { depth: progress.depth })}
            {bestLength !== null && ` · ${t('solve.optimal.known', { moves: moves(bestLength) })}`}
            {progress !== null && ` · ${duration(progress.elapsedMs)}`}
          </p>
        );
      }
      return (
        <p className={styles.status} aria-live="polite">
          {t('solve.searching', { depth: progress?.depth ?? 0 })}
          {bestLength !== null && ` · ${t('solve.best', { moves: moves(bestLength) })}`}
        </p>
      );
    }
    case 'done': {
      const { result } = session;
      if (session.moves === null) return <p className={styles.status}>{t('solve.noSolution')}</p>;
      if (session.moves.length === 0) return <p className={styles.status}>{t('solve.solved')}</p>;
      if (result.stoppedBy === 'proven') {
        return (
          <p className={styles.status} aria-live="polite">
            {t('solve.optimal.proven', {
              moves: moves(session.moves.length),
              time: duration(result.elapsedMs),
              nodes: compact(result.nodes),
            })}
          </p>
        );
      }
      if (session.mode === 'optimal' && result.stoppedBy === 'cancelled') {
        return (
          <p className={styles.status} aria-live="polite">
            {t('solve.optimal.cancelled', { moves: moves(session.moves.length) })}
          </p>
        );
      }
      return (
        <div aria-live="polite">
          <p className={styles.status}>
            {t('solve.result', {
              moves: moves(session.moves.length),
              ms: Math.round(result.elapsedMs),
              nodes: result.nodes,
            })}
          </p>
          <p className={styles.muted}>{t(`solve.stoppedBy.${result.stoppedBy}`)}</p>
        </div>
      );
    }
  }
}

export function SolvePanel({
  status,
  optimalStatus,
  session,
  settings,
  canSolve,
  onSettingsChange,
  onPrepare,
  onSolve,
  onCancel,
}: {
  readonly status: SolverStatus;
  readonly optimalStatus: OptimalStatus;
  readonly session: SolveSession;
  readonly settings: SolveSettings;
  readonly canSolve: boolean;
  readonly onSettingsChange: (settings: SolveSettings) => void;
  readonly onPrepare: (tier: OptimalTier) => void;
  readonly onSolve: () => void;
  readonly onCancel: () => void;
}) {
  const { t, number } = useI18n();
  const solving = session.kind === 'solving';
  const ready =
    status.kind === 'ready' &&
    (settings.mode === 'fast' || optimalReady(optimalStatus, settings.tier));
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('solve.title')}</h2>
        <div className={styles.segmented} role="group" aria-label={t('solve.mode')}>
          {MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              className={styles.segment}
              aria-pressed={settings.mode === mode}
              disabled={solving}
              onClick={() => {
                onSettingsChange({ ...settings, mode });
              }}
            >
              {t(`solve.mode.${mode}`)}
            </button>
          ))}
        </div>
      </div>
      {settings.mode === 'fast' ? (
        <div className={styles.row}>
          <label className={cx(styles.label, styles.grow)}>
            {t('solve.target')}
            <select
              className={styles.select}
              value={settings.maxLength}
              onChange={(event) => {
                onSettingsChange({ ...settings, maxLength: Number(event.target.value) });
              }}
            >
              {TARGETS.map((n) => (
                <option key={n} value={n}>
                  {t('solve.targetOption', { n })}
                </option>
              ))}
            </select>
          </label>
          <label className={cx(styles.label, styles.grow)}>
            {t('solve.timeLimit')}
            <select
              className={styles.select}
              value={settings.timeLimitMs}
              onChange={(event) => {
                onSettingsChange({ ...settings, timeLimitMs: Number(event.target.value) });
              }}
            >
              {TIME_LIMITS_MS.map((ms) => (
                <option key={ms} value={ms}>
                  {t('solve.seconds', { n: number(ms / 1000) })}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <>
          <label className={styles.label}>
            {t('solve.tier')}
            <select
              className={styles.select}
              value={settings.tier}
              disabled={solving || optimalStatus.kind === 'preparing'}
              onChange={(event) => {
                const tier = TIERS.find((value) => value === event.target.value) ?? 'standard';
                onSettingsChange({ ...settings, tier });
              }}
            >
              {TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {t(`solve.tier.${tier}`)}
                </option>
              ))}
            </select>
          </label>
          <p className={styles.muted}>{t('solve.optimal.note')}</p>
          <OptimalStatusLine
            status={optimalStatus}
            tier={settings.tier}
            onPrepare={() => {
              onPrepare(settings.tier);
            }}
          />
        </>
      )}
      <div className={styles.row}>
        {solving ? (
          <button type="button" className={styles.button} onClick={onCancel}>
            {t('solve.cancel')}
          </button>
        ) : (
          <button
            type="button"
            className={cx(styles.button, styles.primary)}
            disabled={!canSolve || !ready}
            onClick={onSolve}
          >
            {t('solve.button')}
          </button>
        )}
      </div>
      <SessionLine session={session} />
      <SolverStatusLine status={status} />
    </section>
  );
}
