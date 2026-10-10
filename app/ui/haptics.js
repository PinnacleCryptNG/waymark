// Outcome signatures: a distinct vibration per outcome, alongside the spoken heading.
// Never the only signal. iPhone Safari has no Vibration API, so iOS users get speech only.

export const PATTERNS = {
  completed: [90],                       // one short buzz
  failed: [250, 120, 250],               // two long
  pending: [60, 90, 60, 90, 60],         // three quick
  unknown: [60, 90, 60, 90, 60],         // same as pending: both mean "not final yet"
};

export const hapticsSupported = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function playOutcome(state, enabled) {
  if (!enabled || !hapticsSupported() || !PATTERNS[state]) return;
  try { navigator.vibrate(PATTERNS[state]); } catch { /* some browsers block vibrate without a user gesture */ }
}
