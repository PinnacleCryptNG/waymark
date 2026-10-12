// Gemini-backed reader. Sends only the spoken sentence and the public list of demo bank names
// to the WAYMARK server (server/gemini-worker.js), which asks Gemini what it means.
// Balances, account numbers on file and saved payees never leave the phone: the payee name
// Gemini hears is matched against saved payees here.
//
// What comes back is untrusted. It is checked and turned into the same intent shapes as the
// rule reader, and the conversation rules (dialog.js) still decide everything.
// If the server is slow, down or odd, the rule reader answers instead.

import { normalise, parseIntent, extractBank, matchPayees } from './intent.js';

const TYPES = new Set(['balance', 'recent', 'help', 'yes', 'no', 'transfer', 'amount', 'bank', 'unknown']);

/** Turn the server's answer into an intent, or null if it is unusable. */
export function toIntent(raw, ctx) {
  if (!raw || typeof raw !== 'object' || !TYPES.has(raw.type)) return null;
  const accountNumber = typeof raw.accountNumber === 'string' && /^\d{10}$/.test(raw.accountNumber) ? raw.accountNumber : null;
  const naira = Number(raw.amountNaira);
  const amountKobo = raw.amountNaira != null && Number.isFinite(naira) && naira > 0 && naira <= 1e9 ? Math.round(naira * 100) : null;
  const bankCode = typeof raw.bankName === 'string' ? extractBank(normalise(raw.bankName), ctx.banks) : null;
  const name = typeof raw.payeeName === 'string' ? normalise(raw.payeeName) : '';

  switch (raw.type) {
    case 'transfer': {
      const payeeIds = accountNumber || !name ? [] : matchPayees(name, ctx.beneficiaries);
      return { type: 'transfer', payeeIds, nameHeard: payeeIds.length || accountNumber || !name ? null : name, accountNumber, bankCode, amountKobo };
    }
    case 'amount': return amountKobo ? { type: 'amount', amountKobo } : null;
    case 'bank': return bankCode ? { type: 'bank', bankCode } : null;
    case 'unknown': return null;
    default: return { type: raw.type };
  }
}

/** interpret(text, ctx) -> Promise<intent>, with `via` saying which reader answered. */
export function createGeminiInterpreter({ endpoint, timeoutMs = 4000, fetchFn = (...a) => fetch(...a) }) {
  const url = `${endpoint.replace(/\/$/, '')}/interpret`;
  return {
    name: 'gemini',
    async interpret(text, ctx) {
      const rules = parseIntent(text, ctx);
      // Plain yes and no stay on the phone: instant, and never reinterpreted.
      if (rules.type === 'yes' || rules.type === 'no' || !normalise(text)) return { ...rules, via: 'rules' };
      const controller = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = setTimeout(() => controller?.abort(), timeoutMs);
      try {
        const res = await fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.slice(0, 300), banks: ctx.banks.map((b) => b.name) }),
          signal: controller?.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const intent = toIntent((await res.json())?.intent, ctx);
        if (intent?.type === 'transfer' && rules.type === 'transfer') {
          // Gemini sometimes drops a detail the rules heard plainly; keep what either reader found.
          intent.amountKobo ??= rules.amountKobo ?? null;
          intent.bankCode ??= rules.bankCode ?? null;
          if (!intent.accountNumber && !intent.payeeIds.length && rules.accountNumber) intent.accountNumber = rules.accountNumber;
        }
        if (intent) return { ...intent, via: 'gemini' };
      } catch { /* fall through to the rules */ } finally {
        clearTimeout(timer);
      }
      return { ...rules, via: 'rules' };
    },
  };
}
