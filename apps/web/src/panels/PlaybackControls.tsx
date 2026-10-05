import type { Dispatch } from 'react';
import { useI18n } from '../i18n/i18n.ts';
import type { Playback, PlaybackAction } from '../playback/playback.ts';
import {
  BackIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
  ToEndIcon,
  ToStartIcon,
} from '../ui/icons.tsx';
import styles from './PlaybackControls.module.css';
import ui from '../ui/ui.module.css';

const SPEEDS = [0.5, 1, 2, 4] as const;

export function PlaybackControls({
  playback,
  dispatch,
  speed,
  onSpeedChange,
}: {
  readonly playback: Playback;
  readonly dispatch: Dispatch<PlaybackAction>;
  readonly speed: number;
  readonly onSpeedChange: (speed: number) => void;
}) {
  const { t, number } = useI18n();
  const total = playback.moves.length;
  const { position } = playback;
  const busy = playback.animating !== null;
  return (
    <div className={styles.controls}>
      <div className={styles.buttons}>
        <button
          type="button"
          className={ui.iconButton}
          aria-label={t('playback.start')}
          title={t('playback.start')}
          disabled={total === 0 || position === 0}
          onClick={() => {
            dispatch({ type: 'seek', position: 0 });
          }}
        >
          <ToStartIcon />
        </button>
        <button
          type="button"
          className={ui.iconButton}
          aria-label={t('playback.back')}
          title={t('playback.back')}
          disabled={position === 0 || busy}
          onClick={() => {
            dispatch({ type: 'step', forward: false });
          }}
        >
          <BackIcon />
        </button>
        <button
          type="button"
          className={ui.iconButton}
          aria-label={playback.playing ? t('playback.pause') : t('playback.play')}
          title={playback.playing ? t('playback.pause') : t('playback.play')}
          disabled={total === 0}
          onClick={() => {
            dispatch({ type: playback.playing ? 'pause' : 'play' });
          }}
        >
          {playback.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          className={ui.iconButton}
          aria-label={t('playback.forward')}
          title={t('playback.forward')}
          disabled={position >= total || busy}
          onClick={() => {
            dispatch({ type: 'step', forward: true });
          }}
        >
          <ForwardIcon />
        </button>
        <button
          type="button"
          className={ui.iconButton}
          aria-label={t('playback.end')}
          title={t('playback.end')}
          disabled={total === 0 || position === total}
          onClick={() => {
            dispatch({ type: 'seek', position: total });
          }}
        >
          <ToEndIcon />
        </button>
      </div>
      <input
        className={styles.slider}
        type="range"
        min={0}
        max={total}
        value={position}
        disabled={total === 0}
        aria-label={t('playback.position', { position, total })}
        aria-valuetext={t('playback.position', { position, total })}
        onChange={(event) => {
          dispatch({ type: 'seek', position: Number(event.target.value) });
        }}
      />
      <span className={styles.counter}>
        {number(position)} / {number(total)}
      </span>
      <label className={styles.speed}>
        <span className={styles.speedLabel}>{t('playback.speed')}</span>
        <select
          className={ui.select}
          value={speed}
          onChange={(event) => {
            onSpeedChange(Number(event.target.value));
          }}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {number(s)}×
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
