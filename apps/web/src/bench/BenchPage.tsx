import { useEffect, useRef, useState } from 'react';
import { useI18n, type I18n } from '../i18n/i18n.ts';
import type { Handle } from '../solver/client.ts';
import { cx } from '../ui/cx.ts';
import { Header } from '../ui/Header.tsx';
import ui from '../ui/ui.module.css';
import styles from './BenchPage.module.css';
import recorded from './recorded.json';
import { runBenchmark, type RunSummary } from './runs.ts';

const ADR = 'https://github.com/MrDenzzz/cube-solver/blob/main/docs/adr';

/** Live runs: the first cubes of each recorded set, so the numbers compare directly. */
const RUNS = [
  { puzzle: 3, count: 20 },
  { puzzle: 4, count: 10 },
] as const;

type Puzzle = (typeof RUNS)[number]['puzzle'];

/** Durations, with a tenth of a millisecond below 10 ms, where the fast solver's times sit. */
const ms = (value: number, i18n: I18n) =>
  value < 10 ? i18n.t('time.ms', { n: Math.round(value * 10) / 10 }) : i18n.duration(value);

function LiveRuns() {
  const i18n = useI18n();
  const { t, number } = i18n;
  const [running, setRunning] = useState<{ readonly puzzle: Puzzle; readonly done: number } | null>(
    null,
  );
  const [results, setResults] = useState<Partial<Record<Puzzle, RunSummary>>>({});
  const handle = useRef<Handle<RunSummary | null> | null>(null);

  useEffect(
    () => () => {
      handle.current?.cancel();
    },
    [],
  );

  const start = (puzzle: Puzzle, count: number) => {
    setRunning({ puzzle, done: 0 });
    const run = runBenchmark(puzzle, count, (done) => {
      setRunning({ puzzle, done });
    });
    handle.current = run;
    run.result.then(
      (summary) => {
        if (handle.current !== run) return;
        handle.current = null;
        setRunning(null);
        if (summary !== null) setResults((r) => ({ ...r, [puzzle]: summary }));
      },
      () => {
        handle.current = null;
        setRunning(null);
      },
    );
  };

  const desktop = (puzzle: Puzzle) => {
    if (puzzle === 3) {
      const row = recorded.twoPhase.find((r) => r.maxLength === 20);
      return row && { count: row.count, meanLength: row.meanLength, medianMs: row.medianMs };
    }
    const row = recorded.reduction.find(
      (r) => r.phase2Candidates === 100 && r.phase3Candidates === 4,
    );
    return row && { count: row.count, meanLength: row.meanLength, medianMs: row.medianMs };
  };

  return (
    <section className={ui.card}>
      <div className={ui.cardHeader}>
        <h2 className={ui.cardTitle}>{t('bench.live.title')}</h2>
      </div>
      <p className={ui.muted}>
        {t('bench.live.device', {
          cores: navigator.hardwareConcurrency,
          isolation: t(crossOriginIsolated ? 'bench.live.isolated' : 'bench.live.notIsolated'),
        })}
      </p>
      <p className={ui.muted}>{t('bench.live.note')}</p>
      {RUNS.map(({ puzzle, count }) => {
        const result = results[puzzle];
        const reference = desktop(puzzle);
        const mine = running?.puzzle === puzzle;
        return (
          <div key={puzzle} className={styles.run}>
            <div className={ui.row}>
              <button
                type="button"
                className={cx(ui.button, mine ? undefined : ui.primary)}
                disabled={running !== null && !mine}
                onClick={() => {
                  if (mine) handle.current?.cancel();
                  else start(puzzle, count);
                }}
              >
                {mine
                  ? t('solve.cancel')
                  : t(`bench.live.run${String(puzzle) as '3' | '4'}`, { count })}
              </button>
            </div>
            {mine && (
              <>
                <p className={ui.status}>
                  {t('bench.live.running', { done: running.done, total: count })}
                </p>
                <progress className={ui.progress} value={running.done} max={count} />
              </>
            )}
            {result !== undefined && (
              <p className={ui.status}>
                {t('bench.live.result', {
                  count: result.count,
                  length: number(Math.round(result.meanLength * 100) / 100),
                  median: ms(result.medianMs, i18n),
                  max: ms(result.maxMs, i18n),
                })}
              </p>
            )}
            {reference !== undefined && (
              <p className={ui.muted}>
                {t('bench.live.reference', {
                  count: reference.count,
                  length: number(reference.meanLength),
                  median: ms(reference.medianMs, i18n),
                })}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function Recorded() {
  const i18n = useI18n();
  const { t, number, compact } = i18n;
  const engine = (name: string) =>
    t(name === 'wasm' ? 'solve.engine.wasm' : 'solve.engine.typescript');
  return (
    <section className={ui.card}>
      <div className={ui.cardHeader}>
        <h2 className={ui.cardTitle}>{t('bench.recorded.title')}</h2>
      </div>
      <p className={ui.muted}>
        {t('bench.recorded.machine', {
          cpu: recorded.machine.cpu,
          node: recorded.machine.node,
        })}
      </p>

      <h3 className={styles.heading}>{t('bench.twoPhase.title')}</h3>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('bench.col.target')}</th>
              <th>{t('bench.col.cubes')}</th>
              <th>{t('bench.col.length')}</th>
              <th>{t('bench.col.median')}</th>
              <th>{t('bench.col.p95')}</th>
              <th>{t('bench.col.max')}</th>
              <th>{t('bench.col.nodes')}</th>
            </tr>
          </thead>
          <tbody>
            {recorded.twoPhase.map((row) => (
              <tr key={row.maxLength}>
                <td>≤ {row.maxLength}</td>
                <td>{number(row.count)}</td>
                <td>{number(row.meanLength)}</td>
                <td>{ms(row.medianMs, i18n)}</td>
                <td>{ms(row.p95Ms, i18n)}</td>
                <td>{ms(row.maxMs, i18n)}</td>
                <td>{compact(row.nodesPerSecond)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className={styles.heading}>{t('bench.optimal.title')}</h3>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('bench.col.table')}</th>
              <th>{t('bench.col.engine')}</th>
              <th>{t('bench.col.threads')}</th>
              <th>{t('bench.col.time')}</th>
              <th>{t('bench.col.nodes')}</th>
            </tr>
          </thead>
          <tbody>
            {recorded.optimal.map((row, i) => (
              // Repeated runs share every other field: the order tells them apart.
              <tr key={i}>
                <td>{t(row.tier === 'huge' ? 'bench.tier.huge' : 'bench.tier.standard')}</td>
                <td>{engine(row.engine)}</td>
                <td>{row.threads}</td>
                <td>{i18n.duration(row.ms)}</td>
                <td>{compact(row.nodesPerSecond)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={ui.muted}>
        {t('bench.optimal.note')}{' '}
        <a href={`${ADR}/0007-typescript-vs-webassembly.md`} target="_blank" rel="noreferrer">
          ADR 0007
        </a>
      </p>

      <h3 className={styles.heading}>{t('bench.reduction.title')}</h3>
      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('bench.col.candidates')}</th>
              <th>{t('bench.col.length')}</th>
              <th>{t('bench.col.phases')}</th>
              <th>{t('bench.col.median')}</th>
              <th>{t('bench.col.p95')}</th>
              <th>{t('bench.col.max')}</th>
            </tr>
          </thead>
          <tbody>
            {recorded.reduction.map((row) => (
              <tr key={`${String(row.phase2Candidates)}-${String(row.phase3Candidates)}`}>
                <td>
                  {row.phase2Candidates} / {row.phase3Candidates}, {row.finishTimeMs} ms
                </td>
                <td>{number(row.meanLength)}</td>
                <td>
                  {row.meanPhaseLengths.map((p) => number(Math.round(p * 10) / 10)).join(' + ')}
                </td>
                <td>{ms(row.medianMs, i18n)}</td>
                <td>{ms(row.p95Ms, i18n)}</td>
                <td>{ms(row.maxMs, i18n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={ui.muted}>
        {t('bench.reduction.note')}{' '}
        <a href={`${ADR}/0008-four-by-four-reduction.md`} target="_blank" rel="noreferrer">
          ADR 0008
        </a>
      </p>
    </section>
  );
}

export function BenchPage() {
  const { t } = useI18n();
  return (
    <div className={styles.page}>
      <Header page="bench" />
      <main className={styles.main}>
        <p className={styles.intro}>{t('bench.intro')}</p>
        <LiveRuns />
        <Recorded />
      </main>
    </div>
  );
}
