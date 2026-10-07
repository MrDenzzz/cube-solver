import { useI18n } from '../i18n/i18n.ts';
import type { FourStatus } from '../solver/client.ts';
import type { FourSession } from '../solver/useFourSession.ts';
import { cx } from '../ui/cx.ts';
import styles from '../ui/ui.module.css';

function StatusLine({ status }: { readonly status: FourStatus }) {
  const { t, number, duration } = useI18n();
  switch (status.kind) {
    case 'none':
      return null;
    case 'preparing':
      return (
        <>
          <p className={styles.muted}>
            {t('solve.four.preparing', {
              percent: Math.floor((status.done / status.total) * 100),
            })}
          </p>
          <progress className={styles.progress} value={status.done} max={status.total} />
        </>
      );
    case 'ready':
      return (
        <p className={styles.muted}>
          {t('solve.four.ready', {
            size: number(Math.round((status.tableBytes / 2 ** 20) * 10) / 10),
            time: duration(status.ms),
          })}
        </p>
      );
    case 'failed':
      return <p className={styles.errors}>{t('solve.four.failed', { message: status.message })}</p>;
  }
}

function SessionLine({ session }: { readonly session: FourSession }) {
  const { t, moves, duration } = useI18n();
  switch (session.kind) {
    case 'idle':
      return null;
    case 'error':
      return <p className={styles.errors}>{session.message}</p>;
    case 'solving':
      return (
        <p className={styles.status} aria-live="polite">
          {t('solve.four.searching')}
        </p>
      );
    case 'done': {
      if (session.moves === null) return <p className={styles.status}>{t('solve.noSolution')}</p>;
      if (session.moves.length === 0) return <p className={styles.status}>{t('solve.solved')}</p>;
      const [a = 0, b = 0, c = 0, d = 0] = session.result.phases;
      return (
        <p className={styles.status} aria-live="polite">
          {t('solve.four.result', {
            moves: moves(session.moves.length),
            time: duration(session.result.elapsedMs),
            phases: t('solve.four.phases', { a, b, c, d }),
          })}
        </p>
      );
    }
  }
}

/** The 4×4×4 has one method, so its panel has no modes or engines to choose. */
export function FourSolvePanel({
  status,
  session,
  canSolve,
  onSolve,
  onCancel,
}: {
  readonly status: FourStatus;
  readonly session: FourSession;
  readonly canSolve: boolean;
  readonly onSolve: () => void;
  readonly onCancel: () => void;
}) {
  const { t } = useI18n();
  const solving = session.kind === 'solving';
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>{t('solve.title')}</h2>
      </div>
      <p className={styles.muted}>{t('solve.four.method')}</p>
      <div className={styles.row}>
        {solving ? (
          <button type="button" className={styles.button} onClick={onCancel}>
            {t('solve.cancel')}
          </button>
        ) : (
          <button
            type="button"
            className={cx(styles.button, styles.primary)}
            disabled={!canSolve || status.kind === 'failed'}
            onClick={onSolve}
          >
            {t('solve.button')}
          </button>
        )}
      </div>
      <SessionLine session={session} />
      <StatusLine status={status} />
    </section>
  );
}
