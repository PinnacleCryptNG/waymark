// Fictional name enquiry: account number + bank -> account name, plus the lookalike check.

/** Returns { ok: true, entry } or { ok: false, code: 'not-found' } */
export function lookupAccount(directory, bankCode, accountNumber) {
  const entry = directory.find((e) => e.bankCode === bankCode && e.accountNumber === accountNumber);
  return entry ? { ok: true, entry } : { ok: false, code: 'not-found' };
}

const normalise = (s) => s.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/** True when two names are the same person by eye or ear: equal, reordered, or 1-2 letters apart. */
export function namesLookAlike(a, b) {
  const x = normalise(a), y = normalise(b);
  if (x === y) return true;
  if (x.split(' ').sort().join(' ') === y.split(' ').sort().join(' ')) return true;
  return editDistance(x, y) <= 2;
}

/**
 * A saved beneficiary whose name looks like the looked-up name but whose account differs.
 * Returns that beneficiary, or null when there is nothing to warn about.
 */
export function findLookalike(beneficiaries, entry) {
  return beneficiaries.find((b) =>
    namesLookAlike(b.name, entry.name) &&
    !(b.accountNumber === entry.accountNumber && b.bankCode === entry.bankCode)) ?? null;
}
