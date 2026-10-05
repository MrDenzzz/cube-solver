import type { SolveOptions } from '@cube/solver-contracts';
import { useI18n } from '../i18n/i18n.ts';
import type { SolverStatus } from '../solver/client.ts';
import type { SolveSession } from '../solver/useSolveSession.ts';
import { cx } from '../ui/cx.ts';
import styles from '../ui/ui.module.css';

const TARGETS = [18, 19, 20, 21, 22] as const;
const TIME_LIMITS_MS = [500, 1000, 2000, 5000, 10_000] as const;

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

function SessionLine({ session }: { readonly session: SolveSession }) {
  const { t, moves } = useI18n();
  switch (session.kind) {
    case 'idle':
      return null;
    case 'error':
      return <p className={styles.errors}>{session.message}</p>;
    case 'solving': {
      const { progress, bestLength } = session;
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
  session,
  options,
  canSolve,
  onOptionsChange,
  onSolve,
  onCancel,
}: {
  readonly status: SolverStatus;
  readonly session: SolveSession;
  readonly options: SolveOptions;
  readonly canSolve: boolean;
  readonly onOptionsChange: (options: SolveOptions) => void;
  readonly onSolve: () => void;
  readonly onCancel: () => void;
}) {
  const { t, number } = useI18n();
  const solving = session.kind === 'solving';
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t('solve.title')}</h2>
      <div className={styles.row}>
        <label className={cx(styles.label, styles.grow)}>
          {t('solve.target')}
          <select
            className={styles.select}
            value={options.maxLength}
            onChange={(event) => {
              onOptionsChange({ ...options, maxLength: Number(event.target.value) });
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
            value={options.timeLimitMs}
            onChange={(event) => {
              onOptionsChange({ ...options, timeLimitMs: Number(event.target.value) });
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
      <div className={styles.row}>
        {solving ? (
          <button type="button" className={styles.button} onClick={onCancel}>
            {t('solve.cancel')}
          </button>
        ) : (
          <button
            type="button"
            className={cx(styles.button, styles.primary)}
            disabled={!canSolve || status.kind !== 'ready'}
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
