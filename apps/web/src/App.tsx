import {
  applyAlgorithm,
  applyAlgorithm4,
  cube4ToFacelets,
  SOLVED,
  SOLVED_4,
  toFacelets,
  type Cube4,
  type CubieCube,
  type FaceTurn,
  type LayerTurn,
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
import { FourSolvePanel } from './panels/FourSolvePanel.tsx';
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
import {
  getFourClient,
  getSolverClient,
  setEngineKind,
  useEngineKind,
  useFourStatus,
  useOptimalStatus,
  useSolverStatus,
  type EngineKind,
} from './solver/solver.ts';
import { randomScramble4, useFourSession } from './solver/useFourSession.ts';
import { randomScramble, useSolveSession } from './solver/useSolveSession.ts';
import { StickerEditor } from './stickers/StickerEditor.tsx';
import {
  blankStickers,
  checkStickers,
  checkStickers4,
  isStickers,
  type PuzzleSize,
} from './stickers/stickers.ts';
import { Header } from './ui/Header.tsx';
import { readStored, writeStored } from './ui/storage.ts';
import { useWakeLock } from './ui/useWakeLock.ts';

// three.js is most of the page's weight; the controls render while it loads.
const CubeView = lazy(() => import('./cube3d/CubeView.tsx'));

const QUARTER_TURN_MS = 320;
const STICKERS_KEYS: Readonly<Record<PuzzleSize, string>> = {
  3: 'cube-solver.stickers',
  4: 'cube-solver.stickers4',
};
const PUZZLE_KEY = 'cube-solver.puzzle';

const outerTurns = (moves: readonly FaceTurn[]) =>
  moves.map(({ face, turns }) => ({ face, from: 1, to: 1, turns }));

function storedStickers(size: PuzzleSize): string {
  const stored = readStored(STICKERS_KEYS[size]);
  return stored !== null && isStickers(stored, size) ? stored : blankStickers(size);
}

const storedPuzzle = (): PuzzleSize => (readStored(PUZZLE_KEY) === '4' ? 4 : 3);

/** The state a scramble leads to on either puzzle, as stickers, or the notation errors. */
function scrambleState(
  puzzle: PuzzleSize,
  text: string,
):
  | { readonly ok: true; readonly cube3: CubieCube | null; readonly cube4: Cube4 | null }
  | { readonly ok: false; readonly errors: readonly NotationError[] } {
  if (puzzle === 3) {
    const parsed = applyAlgorithm(SOLVED, text);
    return parsed.ok ? { ok: true, cube3: parsed.value, cube4: null } : parsed;
  }
  const parsed = applyAlgorithm4(SOLVED_4, text);
  return parsed.ok ? { ok: true, cube3: null, cube4: parsed.value } : parsed;
}

export function App() {
  const { t } = useI18n();
  const status = useSolverStatus();
  const [puzzle, setPuzzle] = useState<PuzzleSize>(storedPuzzle);
  const [mode, setMode] = useState<InputMode>('scramble');
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<readonly NotationError[]>([]);
  const [scrambled, setScrambled] = useState<CubieCube>(SOLVED);
  const [scrambled4, setScrambled4] = useState<Cube4>(SOLVED_4);
  const [stickers, setStickers] = useState(() => storedStickers(3));
  const [stickers4, setStickers4] = useState(() => storedStickers(4));
  const fourStatus = useFourStatus();
  const [playback, dispatch] = useReducer(playbackReducer, INITIAL_PLAYBACK);
  const optimalStatus = useOptimalStatus();
  const engine = useEngineKind();
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
  const stickerCheck4 = useMemo(() => checkStickers4(stickers4), [stickers4]);
  const cube: CubieCube | null =
    mode === 'scramble'
      ? errors.length === 0
        ? scrambled
        : null
      : stickerCheck.kind === 'valid'
        ? stickerCheck.cube
        : null;
  const cube4: Cube4 | null =
    mode === 'scramble'
      ? errors.length === 0
        ? scrambled4
        : null
      : stickerCheck4.kind === 'valid'
        ? stickerCheck4.cube
        : null;

  const showSolution = useCallback(
    (size: PuzzleSize, start: string, moves: readonly LayerTurn[]) => {
      dispatch({ type: 'load', size, start, moves });
      // Following the solution starts from the reference hold, so the view starts there too.
      setViewKey((key) => key + 1);
      stage.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    [],
  );
  const onSolved = useCallback(
    (solved: CubieCube, moves: readonly FaceTurn[]) => {
      showSolution(3, toFacelets(solved), outerTurns(moves));
    },
    [showSolution],
  );
  const onSolved4 = useCallback(
    (solved: Cube4, moves: readonly LayerTurn[]) => {
      showSolution(4, cube4ToFacelets(solved), moves);
    },
    [showSolution],
  );
  const { session, solve, cancel, reset } = useSolveSession(onSolved);
  const four = useFourSession(onSolved4);
  const resetFour = four.reset;

  /** Shows a new state to solve, dropping the previous solution. */
  const show = useCallback(
    (facelets: string, size: PuzzleSize) => {
      reset();
      resetFour();
      dispatch({ type: 'load', size, start: facelets, moves: [] });
    },
    [reset, resetFour],
  );

  // An invalid scramble keeps the last valid cube on screen while the errors are shown.
  const applyScramble = useCallback(
    (value: string, size: PuzzleSize) => {
      setText(value);
      const state = scrambleState(size, value);
      if (!state.ok) {
        setErrors(state.errors);
        return;
      }
      setErrors([]);
      if (state.cube3 !== null) {
        setScrambled(state.cube3);
        show(toFacelets(state.cube3), 3);
      }
      if (state.cube4 !== null) {
        setScrambled4(state.cube4);
        show(cube4ToFacelets(state.cube4), 4);
      }
    },
    [show],
  );
  const changeScramble = useCallback(
    (value: string) => {
      applyScramble(value, puzzle);
    },
    [applyScramble, puzzle],
  );

  // Half-entered stickers are shown as they are, unknown ones in grey.
  const changeStickers = useCallback(
    (value: string) => {
      if (puzzle === 3) setStickers(value);
      else setStickers4(value);
      writeStored(STICKERS_KEYS[puzzle], value);
      show(value, puzzle);
    },
    [show, puzzle],
  );

  const changeMode = (next: InputMode) => {
    setMode(next);
    if (next === 'stickers') show(puzzle === 3 ? stickers : stickers4, puzzle);
    else if (puzzle === 3) show(toFacelets(scrambled), 3);
    else show(cube4ToFacelets(scrambled4), 4);
  };

  const changePuzzle = (next: PuzzleSize) => {
    if (next === puzzle) return;
    setPuzzle(next);
    writeStored(PUZZLE_KEY, String(next));
    // The 4×4×4 tables take a second or two: start them as soon as the puzzle is chosen.
    if (next === 4)
      getFourClient()
        .prepareFour()
        .catch(() => undefined);
    if (mode === 'stickers') show(next === 3 ? stickers : stickers4, next);
    else applyScramble(text, next);
  };

  const prepare = useCallback((tier: OptimalTier) => {
    preparing.current?.cancel();
    const handle = getSolverClient().prepare(tier);
    preparing.current = handle;
    handle.result.then(
      (report) => {
        // A built table cost seconds to minutes: ask the browser not to evict it under storage
        // pressure (only pages can ask; workers cannot). Refusal leaves it best-effort.
        if (report?.source === 'built') void navigator.storage.persist().catch(() => false);
      },
      // Failures show up in the optimal status; the promise has nothing more to say.
      () => undefined,
    );
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
    void (puzzle === 3 ? randomScramble() : randomScramble4())
      .then(changeScramble)
      .catch((error: unknown) => {
        console.error(error);
      })
      .finally(() => {
        setGenerating(false);
      });
  }, [changeScramble, puzzle]);

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
      <Header page="solver" />
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
          <InputPanel
            puzzle={puzzle}
            onPuzzleChange={changePuzzle}
            mode={mode}
            onModeChange={changeMode}
          >
            {mode === 'scramble' ? (
              <ScrambleInput
                text={text}
                errors={errors}
                generating={generating}
                canGenerate={puzzle === 3 ? status.kind === 'ready' : fourStatus.kind !== 'failed'}
                onChange={changeScramble}
                onRandom={generate}
              />
            ) : (
              <StickerEditor
                key={puzzle}
                size={puzzle}
                stickers={puzzle === 3 ? stickers : stickers4}
                check={puzzle === 3 ? stickerCheck : stickerCheck4}
                onChange={changeStickers}
              />
            )}
          </InputPanel>
          {puzzle === 4 ? (
            <FourSolvePanel
              status={fourStatus}
              session={four.session}
              canSolve={cube4 !== null}
              onSolve={() => {
                if (cube4 !== null) four.solve(cube4);
              }}
              onCancel={four.cancel}
            />
          ) : (
            <SolvePanel
              engine={engine}
              onEngineChange={(next: EngineKind) => {
                // The old worker goes away with its requests; drop the sessions first.
                reset();
                resetFour();
                preparing.current = null;
                setEngineKind(next);
              }}
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
          )}
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
