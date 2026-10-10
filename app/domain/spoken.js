// Exact text a screen reader should speak, so amounts, accounts and dates are never misread.
// See "Exact spoken forms" in the PRD.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const LAGOS_OFFSET_MS = 60 * 60 * 1000; // West Africa Time, UTC+1, no daylight saving

const groupThousands = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** 24580000 -> "245,800 naira"; 125050 -> "1,250 naira 50 kobo"; 50 -> "50 kobo" */
export function spokenNaira(kobo) {
  const abs = Math.abs(kobo);
  const naira = Math.floor(abs / 100);
  const k = abs % 100;
  if (naira === 0) return `${k} kobo`;
  const n = `${groupThousands(String(naira))} naira`;
  return k ? `${n} ${k} kobo` : n;
}

/** Signed transaction amount: "Debit, 5,000 naira" / "Credit, 150,000 naira" */
export const spokenDirectionAmount = (direction, kobo) =>
  `${direction === 'debit' ? 'Debit' : 'Credit'}, ${spokenNaira(kobo)}`;

/** "0123454719" -> "******4719" */
export const maskAccount = (accountNumber) => `******${String(accountNumber).slice(-4)}`;

/** "0123454719" -> "account ending 4 7 1 9" */
export const spokenAccountEnding = (accountNumber) =>
  `account ending ${String(accountNumber).slice(-4).split('').join(' ')}`;

/** "WM-7F3K" -> "Reference W M 7 F 3 K" */
export const spokenReference = (ref) =>
  `Reference ${String(ref).replace(/[^A-Za-z0-9]/g, '').split('').join(' ')}`;

const lagosParts = (iso) => {
  const d = new Date(Date.parse(iso) + LAGOS_OFFSET_MS);
  return { day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), h: d.getUTCHours(), m: d.getUTCMinutes() };
};

/** ISO timestamp -> "10 October 2026" (Lagos time) */
export function spokenDate(iso) {
  const { day, month, year } = lagosParts(iso);
  return `${day} ${MONTHS[month]} ${year}`;
}

/** ISO timestamp -> "10 October 2026, 2:05 pm" (Lagos time) */
export function spokenDateTime(iso) {
  const { h, m } = lagosParts(iso);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${spokenDate(iso)}, ${hour12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** Spell a name letter by letter: "Ada Obi" -> "A, D, A, space, O, B, I" */
export const spellOut = (text) =>
  String(text).toUpperCase().split('').map((c) => (c === ' ' ? 'space' : c === '-' ? 'hyphen' : c)).join(', ');
