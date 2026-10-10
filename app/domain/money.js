// Money is always integer kobo. Text input is parsed to kobo once; display formats from kobo.

export const FEE_KOBO = 1000; // ₦10.00 flat demo fee (illustrative, see PRD OD-5)

const groupThousands = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Parse what the user typed into kobo.
 * Returns { ok: true, kobo } or { ok: false, code } where code is one of
 * 'blank', 'not-number', 'too-many-decimals', 'zero', 'negative'.
 */
export function parseAmount(text) {
  const raw = String(text ?? '').trim();
  if (raw === '') return { ok: false, code: 'blank' };
  const cleaned = raw.replace(/[₦\s]/g, '').replace(/^NGN/i, '');
  if (/^-/.test(cleaned)) return { ok: false, code: 'negative' };
  // Commas are allowed only as thousands separators.
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d*)?$/.test(cleaned)) return { ok: false, code: 'not-number' };
  const [whole, fraction = ''] = cleaned.replace(/,/g, '').split('.');
  if (fraction.length > 2) return { ok: false, code: 'too-many-decimals' };
  const kobo = Number(whole) * 100 + Number(fraction.padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(kobo)) return { ok: false, code: 'not-number' };
  if (kobo === 0) return { ok: false, code: 'zero' };
  return { ok: true, kobo };
}

/** Visual form: ₦245,800.00 */
export function formatNaira(kobo) {
  const sign = kobo < 0 ? '−' : '';
  const abs = Math.abs(kobo);
  const naira = groupThousands(String(Math.floor(abs / 100)));
  const k = String(abs % 100).padStart(2, '0');
  return `${sign}₦${naira}.${k}`;
}

/** Plain digits for an input field: 1250.5 -> "1250.50" */
export function koboToInputText(kobo) {
  return `${Math.floor(kobo / 100)}.${String(kobo % 100).padStart(2, '0')}`;
}

export const totalDebit = (amountKobo, feeKobo = FEE_KOBO) => amountKobo + feeKobo;
