import {
  applyAlgorithm,
  SOLVED,
  toFacelets,
  type CubieCube,
  type FaceTurn,
  type NotationError,
} from '@cube/core';
import type { OptimalTier } from '@cube/solver-contracts';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import styles from './App.module.css';
import type { TurnAnimation } from './cube3d/CubeModel.tsx';
import { GuidePanel } from './guide/GuidePanel.tsx';
import { useI18n } from './i18n/i18n.ts';
import { InputPanel, type InputMode } from './panels/InputPanel.tsx';
import { MovesPanel } from './panels/MovesPanel.tsx';
import { PlaybackControls } from './panels/PlaybackControls.tsx';
import { ScrambleInput } from './panels/ScrambleInput.tsx';
import { SolvePanel } from './panels/SolvePanel.tsx';
import {
  faceletsAt,
  INITIAL_PLAYBACK,
  nextMove,
  playbackReducer,
  visibleTurn,
} from './playback/playback.ts';
import type { Handle } from './solver/client.ts';
import { toSolveOptions, type SolveSettings } from './solver/settings.ts';
import { getSolverClient, useOptimalStatus, useSolverStatus } from './solver/solver.ts';
import { randomScramble, useSolveSession } from './solver/useSolveSession.ts';
import { StickerEditor } from './stickers/StickerEditor.tsx';
import { BLANK_STICKERS, checkStickers, isStickers } from './stickers/stickers.ts';
import { LanguageSwitch } from './ui/LanguageSwitch.tsx';
import { readStored, writeStored } from './ui/storage.ts';
import { useWakeLock } from './ui/useWakeLock.ts';

// three.js is most of the page's weight; the controls render while it loads.
const CubeView = lazy(() => import('./cube3d/CubeView.tsx'));

const QUARTER_TURN_MS = 320;
const REPOSITORY = 'https://github.com/MrDenzzz/cube-solver';
const STICKERS_KEY = 'cube-solver.stickers';

const outerTurns = (moves: readonly FaceTurn[]) =>
  moves.map(({ face, turns }) => ({ face, from: 1, to: 1, turns }));

function storedStickers(): string {
  const stored = readStored(STICKERS_KEY);
  return stored !== null && isStickers(stored) ? stored : BLANK_STICKERS;
}

export function App() {
  const { t } = useI18n();
  const status = useSolverStatus();
  const [mode, setMode] = useState<InputMode>('scramble');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<readonly NotationError[]>([]);
  const [scrambled, setScrambled] = useState<CubieCube>(SOLVED);
  const [stickers, setStickers] = useState(storedStickers);
  const [playback, dispatch] = useReducer(playbackReducer, INITIAL_PLAYBACK);
  const optimalStatus = useOptimalStatus();
  const [settings, setSettings] = useState<SolveSettings>({
    mode: 'fast',
    maxLength: 20,
    timeLimitMs: 2000,
    tier: 'standard',
  });
  const preparing = useRef<Handle<unknown> | null>(null);
  const [speed, setSpeed] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [viewKey, setViewKey] = useState(0);
  const stage = useRef<HTMLElement>(null);

  const stickerCheck = useMemo(() => checkStickers(stickers), [stickers]);
  const cube: CubieCube | null =
    mode === 'scramble'
      ? errors.length === 0
        ? scrambled
        : null
      : stickerCheck.kind === 'valid'
        ? stickerCheck.cube
        : null;

  const onSolved = useCallback((solved: CubieCube, moves: readonly FaceTurn[]) => {
    dispatch({ type: 'load', size: 3, start: toFacelets(solved), moves: outerTurns(moves) });
    // Following the solution starts from the reference hold, so the view starts there too.
    setViewKey((key) => key + 1);
    stage.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);
  const { session, solve, cancel, reset } = useSolveSession(onSolved);

  /** Shows a new state to solve, dropping the previous solution. */
  const show = useCallback(
    (facelets: string) => {
      reset();
      dispatch({ type: 'load', size: 3, start: facelets, moves: [] });
    },
    [reset],
  );

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
      show(toFacelets(parsed.value));
    },
    [show],
  );

  // Half-entered stickers are shown as they are, unknown ones in grey.
  const changeStickers = useCallback(
    (value: string) => {
      setStickers(value);
      writeStored(STICKERS_KEY, value);
      show(value);
    },
    [show],
  );

  const changeMode = (next: InputMode) => {
    setMode(next);
    if (next === 'scramble') show(toFacelets(scrambled));
    else show(stickers);
  };

  const prepare = useCallback((tier: OptimalTier) => {
    preparing.current?.cancel();
    const handle = getSolverClient().prepare(tier);
    preparing.current = handle;
    // Failures show up in the optimal status; the promise has nothing more to say.
    handle.result.catch(() => undefined);
  }, []);

  // The standard table takes seconds and is then cached, so choosing the mode is enough to start
  // it; the huge one waits for an explicit request.
  useEffect(() => {
    if (
      settings.mode === 'optimal' &&
      settings.tier === 'standard' &&
      status.kind === 'ready' &&
      optimalStatus.kind === 'none'
    ) {
      prepare('standard');
    }
  }, [settings.mode, settings.tier, status.kind, optimalStatus.kind, prepare]);

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

  const { moves, animating, playing } = playback;
  useWakeLock(moves.length > 0);
  const facelets = useMemo(() => faceletsAt(playback), [playback]);
  const hint = animating === null && !playing ? nextMove(playback) : null;

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
        <section className={styles.stage} ref={stage}>
          <div className={styles.canvas}>
            <Suspense fallback={null}>
              <CubeView
                size={playback.size}
                facelets={facelets}
                animation={animation}
                hint={hint}
                viewKey={viewKey}
                label={t('cube.label')}
              />
            </Suspense>
            <button
              type="button"
              className={styles.resetView}
              onClick={() => {
                setViewKey((key) => key + 1);
              }}
            >
              {t('view.reset')}
            </button>
          </div>
          {moves.length > 0 && <GuidePanel playback={playback} dispatch={dispatch} />}
          <PlaybackControls
            playback={playback}
            dispatch={dispatch}
            speed={speed}
            onSpeedChange={setSpeed}
          />
        </section>
        <div className={styles.panel}>
          <InputPanel mode={mode} onModeChange={changeMode}>
            {mode === 'scramble' ? (
              <ScrambleInput
                text={text}
                errors={errors}
                generating={generating}
                canGenerate={status.kind === 'ready'}
                onChange={changeScramble}
                onRandom={generate}
              />
            ) : (
              <StickerEditor stickers={stickers} check={stickerCheck} onChange={changeStickers} />
            )}
          </InputPanel>
          <SolvePanel
            status={status}
            optimalStatus={optimalStatus}
            session={session}
            settings={settings}
            canSolve={cube !== null}
            onSettingsChange={setSettings}
            onPrepare={prepare}
            onSolve={() => {
              if (cube !== null) solve(cube, toSolveOptions(settings));
            }}
            onCancel={cancel}
          />
          {moves.length > 0 && (
            <MovesPanel
              moves={moves}
              size={playback.size}
              position={playback.position}
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
