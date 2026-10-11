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

/**
 * The id of the fingerprint credential registered for the demo, kept across visits so the next
 * sign-in is one touch. It is an identifier, not a secret: the private key never leaves the phone.
 */
const CREDENTIAL_KEY = 'waymark.credential.v1';
export const credentialStore = {
  load() {
    try { return localStorage.getItem(CREDENTIAL_KEY); } catch { return null; }
  },
  save(id) {
    try { localStorage.setItem(CREDENTIAL_KEY, id); } catch { /* sign-in will ask to set up again */ }
  },
  clear() {
    try { localStorage.removeItem(CREDENTIAL_KEY); } catch { /* nothing stored */ }
  },
};

/** Passed to the demo bank so its ledger survives a page refresh. */
export const bankStorage = {
  load: () => read(BANK_KEY),
  save: (ledger) => write(BANK_KEY, ledger),
};
