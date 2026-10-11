// Rule-based command reader: turns what the user said into a structured intent.
// No AI here. A Claude-backed reader can replace it later behind the same interface
// (see interpreter.js); the dialog and the money rules do not change.
//
// Intent shapes:
//   { type: 'balance' } | { type: 'recent' } | { type: 'help' } | { type: 'yes' } | { type: 'no' }
//   { type: 'transfer', payeeIds: string[], nameHeard: string|null,
//     accountNumber: string|null, bankCode: string|null, amountKobo: number|null }
//   { type: 'amount', amountKobo }        (just an amount, e.g. answering "how much?")
//   { type: 'bank', bankCode }            (just a bank, e.g. answering "which bank?")
//   { type: 'unknown', text }

const SMALL = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, a: 1,
};
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { thousand: 1000, million: 1000000 };
const DIGIT_WORDS = { zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

const isNumberWord = (w) => w in SMALL || w in TENS || w === 'hundred' || w in SCALES || /^\d+(\.\d+)?$/.test(w);

/** Normalise speech-to-text output: lower case, naira signs, "5,000", "5k". */
export function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/₦/g, ' ')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(/\b(\d+(?:\.\d+)?)\s*k\b/g, (_, n) => String(Math.round(Number(n) * 1000)))
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find a 10-digit account number spoken as "0198765432", "019 876 5432" or
 * "zero one nine eight ...". Returns { accountNumber, rest } with the digits removed from the text.
 */
export function extractAccountNumber(text) {
  const tokens = text.split(' ');
  for (let i = 0; i < tokens.length; i++) {
    let digits = '';
    let j = i;
    while (j < tokens.length && (/^\d+$/.test(tokens[j]) || tokens[j] in DIGIT_WORDS)) {
      const t = tokens[j];
      // A spoken amount like "5000" next to the account must not be glued on.
      if (/^\d+$/.test(t) && digits.length + t.length > 10) break;
      digits += /^\d+$/.test(t) ? t : DIGIT_WORDS[t];
      j++;
      if (digits.length === 10) break;
    }
    if (digits.length === 10 && j - i >= 1) {
      // Single-word digit runs only count when they are all single digits or one 10-digit block.
      return { accountNumber: digits, rest: [...tokens.slice(0, i), ...tokens.slice(j)].join(' ') };
    }
  }
  return { accountNumber: null, rest: text };
}

/** Parse the first amount: "5000", "5000.50", "five thousand two hundred", "2 million". Returns kobo or null. */
export function extractAmountKobo(text) {
  const tokens = text.split(' ');
  for (let i = 0; i < tokens.length; i++) {
    if (!isNumberWord(tokens[i]) || tokens[i] === 'a' && !isNumberWord(tokens[i + 1] ?? '')) continue;
    let total = 0, current = 0, used = 0, decimals = 0;
    for (let j = i; j < tokens.length; j++) {
      const w = tokens[j];
      if (w === 'and' && used && isNumberWord(tokens[j + 1] ?? '')) continue;
      if (/^\d+(\.\d+)?$/.test(w)) {
        const [whole, frac = ''] = w.split('.');
        current += Number(whole);
        if (frac) decimals = Math.round(Number(`0.${frac.slice(0, 2).padEnd(2, '0')}`) * 100);
      } else if (w in SMALL) current += SMALL[w];
      else if (w in TENS) current += TENS[w];
      else if (w === 'hundred') current = (current || 1) * 100;
      else if (w in SCALES) { total += (current || 1) * SCALES[w]; current = 0; }
      else break;
      used++;
    }
    const naira = total + current;
    if (used && naira > 0) return naira * 100 + decimals;
  }
  return null;
}

/** Which bank was named, by the first word of its name ("lagoon", "savanna", ...). */
export function extractBank(text, banks) {
  const bank = banks.find((b) => new RegExp(`\\b${b.name.split(' ')[0].toLowerCase()}\\b`).test(text));
  return bank?.code ?? null;
}

/** Saved payees whose full, first or last name was said. */
export function matchPayees(text, beneficiaries) {
  const full = beneficiaries.filter((b) => text.includes(b.name.toLowerCase()));
  if (full.length) return full.map((b) => b.id);
  return beneficiaries
    .filter((b) => b.name.toLowerCase().split(' ').some((part) => part.length > 2 && new RegExp(`\\b${part}\\b`).test(text)))
    .map((b) => b.id);
}

const STOP_AFTER_TO = new Set(['naira', 'at', 'in', 'with', 'for', 'please', 'now', 'account', 'bank']);

/** The name after "to" / "pay", if any, for "I could not find X" replies. */
function nameAfterTo(text) {
  const m = text.match(/\b(?:to|pay)\s+([a-z]+(?:\s+[a-z]+)?)/);
  if (!m) return null;
  const words = m[1].split(' ').filter((w) => !isNumberWord(w) && !STOP_AFTER_TO.has(w));
  return words.length ? words.join(' ') : null;
}

export function parseIntent(rawText, { beneficiaries, banks }) {
  const text = normalise(rawText);
  if (!text) return { type: 'unknown', text: '' };

  if (/^(yes|yeah|yep|yes please|correct|confirm|ok|okay|go ahead|sure|that s right|thats right)\b/.test(text)) return { type: 'yes' };
  if (/^(no|nope|cancel|stop|wrong|not that)\b/.test(text)) return { type: 'no' };
  if (/\b(help|what can you do|what can i say)\b/.test(text)) return { type: 'help' };
  if (/\b(balance|how much (money )?(do i have|have i got|is left)|my account)\b/.test(text)) return { type: 'balance' };
  if (/\b(transactions?|activity|history|recent|last (payment|transfer|payments|transfers))\b/.test(text)) return { type: 'recent' };

  const { accountNumber, rest } = extractAccountNumber(text);
  const amountKobo = extractAmountKobo(rest);
  const bankCode = extractBank(rest, banks);
  const payeeIds = accountNumber ? [] : matchPayees(rest, beneficiaries);
  const wantsToPay = /\b(send|pay|transfer|give)\b/.test(rest);

  if (wantsToPay || accountNumber || payeeIds.length) {
    return {
      type: 'transfer',
      payeeIds,
      nameHeard: payeeIds.length || accountNumber ? null : nameAfterTo(rest),
      accountNumber,
      bankCode,
      amountKobo,
    };
  }
  if (amountKobo) return { type: 'amount', amountKobo };
  if (bankCode) return { type: 'bank', bankCode };
  return { type: 'unknown', text };
}
