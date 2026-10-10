// sessionStorage, guarded: storage may be unavailable (private windows, sandboxes).
// Two separate records: the user's settings (client side) and the demo bank's ledger (bank side).
// PIN, code and phone number are never stored.

const PREFS_KEY = 'waymark.prefs.v1';
const BANK_KEY = 'waymark.demobank.v1';

export const DEFAULT_PREFS = { textSize: 'standard', highContrast: false, reducedMotion: false, haptics: true };

function read(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable: the demo still works for this page load */ }
}

export const prefsStore = {
  load: () => ({ ...DEFAULT_PREFS, ...read(PREFS_KEY) }),
  save: (prefs) => write(PREFS_KEY, prefs),
};

/** Passed to the demo bank so its ledger survives a page refresh. */
export const bankStorage = {
  load: () => read(BANK_KEY),
  save: (ledger) => write(BANK_KEY, ledger),
};
