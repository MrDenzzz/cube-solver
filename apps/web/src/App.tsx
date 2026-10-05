import {
  applyAlgorithm,
  SOLVED,
  toFacelets,
  type CubieCube,
  type FaceTurn,
  type NotationError,
} from '@cube/core';
import type { SolveOptions } from '@cube/solver-contracts';
import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import styles from './App.module.css';
import type { TurnAnimation } from './cube3d/CubeModel.tsx';
import { useI18n } from './i18n/i18n.ts';
import { MovesPanel } from './panels/MovesPanel.tsx';
import { PlaybackControls } from './panels/PlaybackControls.tsx';
import { ScramblePanel } from './panels/ScramblePanel.tsx';
import { SolvePanel } from './panels/SolvePanel.tsx';
import { cubeAt, INITIAL_PLAYBACK, playbackReducer, visibleTurn } from './playback/playback.ts';
import { useSolverStatus } from './solver/solver.ts';
import { randomScramble, useSolveSession } from './solver/useSolveSession.ts';
import { LanguageSwitch } from './ui/LanguageSwitch.tsx';

// three.js is most of the page's weight; the controls render while it loads.
const CubeView = lazy(() => import('./cube3d/CubeView.tsx'));

const QUARTER_TURN_MS = 320;
const REPOSITORY = 'https://github.com/MrDenzzz/cube-solver';

export function App() {
  const { t } = useI18n();
  const status = useSolverStatus();
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<readonly NotationError[]>([]);
  const [scrambled, setScrambled] = useState<CubieCube>(SOLVED);
  const [playback, dispatch] = useReducer(playbackReducer, INITIAL_PLAYBACK);
  const [options, setOptions] = useState<SolveOptions>({ maxLength: 20, timeLimitMs: 2000 });
  const [speed, setSpeed] = useState(1);
  const [generating, setGenerating] = useState(false);

  const onSolved = useCallback((cube: CubieCube, moves: readonly FaceTurn[]) => {
    dispatch({ type: 'load', start: cube, moves });
  }, []);
  const { session, solve, cancel, reset } = useSolveSession(onSolved);

  // An invalid scramble keeps the last valid cube on screen while the errors are shown.
  const changeScramble = useCallback(
    (value: string) => {
      setText(value);
      const parsed = applyAlgorithm(SOLVED, value);
      if (!parsed.ok) {
        setErrors(parsed.errors);
        return;
      }
      setErrors([]);
      setScrambled(parsed.value);
      reset();
      dispatch({ type: 'load', start: parsed.value, moves: [] });
    },
    [reset],
  );

  const generate = useCallback(() => {
    setGenerating(true);
    void randomScramble()
      .then(changeScramble)
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        setGenerating(false);
      });
  }, [changeScramble]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, select, button')
      ) {
        return;
      }
      if (event.key === ' ') dispatch({ type: 'toggle' });
      else if (event.key === 'ArrowRight') dispatch({ type: 'step', forward: true });
      else if (event.key === 'ArrowLeft') dispatch({ type: 'step', forward: false });
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const { start, moves, position, animating } = playback;
  const facelets = useMemo(
    () => toFacelets(cubeAt(start, moves, position)),
    [start, moves, position],
  );

  const onAnimationDone = useCallback(() => {
    dispatch({ type: 'animation-done' });
  }, []);
  const animation = useMemo<TurnAnimation | null>(
    () =>
      animating === null
        ? null
        : {
            key: animating,
            turn: visibleTurn(animating),
            durationMs: QUARTER_TURN_MS / speed,
            onDone: onAnimationDone,
          },
    [animating, speed, onAnimationDone],
  );

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('app.title')}</h1>
          <p className={styles.subtitle}>{t('app.subtitle')}</p>
        </div>
        <div className={styles.headerActions}>
          <LanguageSwitch />
          <a
            className={styles.link}
            href={REPOSITORY}
            target="_blank"
            rel="noreferrer"
            title={t('app.source')}
            aria-label={t('app.source')}
          >
            GitHub
          </a>
        </div>
      </header>
      <main className={styles.main}>
        <section className={styles.stage}>
          <div className={styles.canvas}>
            <Suspense fallback={null}>
              <CubeView
                size={3}
                facelets={facelets}
                animation={animation}
                label={t('cube.label')}
              />
            </Suspense>
          </div>
          <PlaybackControls
            playback={playback}
            dispatch={dispatch}
            speed={speed}
            onSpeedChange={setSpeed}
          />
        </section>
        <div className={styles.panel}>
          <ScramblePanel
            text={text}
            errors={errors}
            generating={generating}
            canGenerate={status.kind === 'ready'}
            onChange={changeScramble}
            onRandom={generate}
          />
          <SolvePanel
            status={status}
            session={session}
            options={options}
            canSolve={errors.length === 0}
            onOptionsChange={setOptions}
            onSolve={() => {
              solve(scrambled, options);
            }}
            onCancel={cancel}
          />
          {moves.length > 0 && (
            <MovesPanel
              moves={moves}
              position={position}
              onSeek={(target) => {
                dispatch({ type: 'seek', position: target });
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}
