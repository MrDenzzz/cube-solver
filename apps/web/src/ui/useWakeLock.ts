import { useEffect } from 'react';

/**
 * Keeps the screen on while `active`: following a solution with a cube in both hands leaves no
 * hand free to wake the phone. Browsers release the lock when the page is hidden, so it is taken
 * again on return. Refusals (battery saver, unsupported browser) only mean the screen may dim.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (sentinel) => {
          if (disposed) void sentinel.release();
          else lock = sentinel;
        },
        () => {
          // See above: not fatal.
        },
      );
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release();
    };
  }, [active]);
}
