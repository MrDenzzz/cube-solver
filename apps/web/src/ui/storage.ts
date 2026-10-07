// Storage can be unavailable (private mode, blocked site data). Everything kept here is a
// convenience, so failures are ignored and callers fall back to defaults.

export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisting is acceptable.
  }
}
