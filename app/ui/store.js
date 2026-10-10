// sessionStorage mirror of the demo ledger and preferences. Synthetic data only.
// PIN and OTP are never stored. Every access is guarded: storage may be unavailable.

const KEY = 'waymark.demo.v1';

export const DEFAULT_PREFS = { textSize: 'standard', highContrast: false, reducedMotion: false, haptics: true };

export function load() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function save({ ledger, prefs }) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ledger, prefs }));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try { sessionStorage.removeItem(KEY); } catch { /* storage unavailable: nothing to clear */ }
}
