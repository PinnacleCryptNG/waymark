// The voice conversation: decides what to say and what to do next. Pure functions, no I/O.
// It never moves money. The furthest it goes is asking the app to open Review, where the
// user approves with a fingerprint or pin exactly as on the screens.

import { spokenNaira, spokenAccountEnding, spokenDate } from '../domain/spoken.js';
import { STATUS_LABEL } from '../domain/transfer.js';
import { FEE_KOBO } from '../domain/money.js';

export const VOICE_LIMIT_KOBO = 5000000; // ₦50,000 per voice payment in this demo

export const EXAMPLES = 'You can say: what is my balance. Or: send 5,000 naira to Musa. Or: pay account 0 1 9 8 7 6 5 4 3 2 at Lagoon Bank, 2,000 naira.';

export const newDialog = () => ({ pending: null });

const firstWordOfBank = (banks, code) => banks.find((b) => b.code === code)?.name ?? 'that bank';
const bankList = (banks) => banks.map((b) => b.name.split(' ')[0]).join(', ').replace(/, ([^,]*)$/, ' or $1');

function checkAmount(amountKobo, ctx) {
  if (amountKobo > VOICE_LIMIT_KOBO) {
    return `Voice payments are limited to ${spokenNaira(VOICE_LIMIT_KOBO)} in this demo. Use the Pay screen for larger amounts. Nothing was sent.`;
  }
  if (amountKobo + FEE_KOBO > ctx.balanceKobo) {
    return `${spokenNaira(amountKobo)} plus the ${spokenNaira(FEE_KOBO)} fee is more than your balance of ${spokenNaira(ctx.balanceKobo)}. Say a smaller amount.`;
  }
  return null;
}

/** Payee and amount known: either ask for the amount, refuse it, or hand over to Review. */
function toPayee(payee, amountKobo, ctx) {
  if (!amountKobo) {
    return { dialog: { pending: { kind: 'amount', payee } }, reply: `How much do you want to send to ${payee.name}?`, action: null };
  }
  const problem = checkAmount(amountKobo, ctx);
  if (problem) return { dialog: { pending: { kind: 'amount', payee } }, reply: problem, action: null };
  return {
    dialog: newDialog(),
    reply: `Ready to send ${spokenNaira(amountKobo)} to ${payee.name}. Check the details, then confirm.`,
    action: { type: 'review', payee, amountKobo },
  };
}

function toAccount(accountNumber, bankCode, amountKobo, ctx) {
  if (!bankCode) {
    return {
      dialog: { pending: { kind: 'bank', accountNumber, amountKobo } },
      reply: `Which bank is ${spokenAccountEnding(accountNumber)} with? ${bankList(ctx.banks)}?`,
      action: null,
    };
  }
  return { dialog: newDialog(), reply: 'Looking up the account.', action: { type: 'lookup', accountNumber, bankCode, amountKobo } };
}

/**
 * Respond to one thing the user said.
 * ctx: { beneficiaries, banks, balanceKobo, activity }
 * Returns { dialog, reply, action } where action is null, { type: 'review', payee, amountKobo }
 * or { type: 'lookup', accountNumber, bankCode, amountKobo }.
 */
export function respond(dialog, intent, ctx) {
  const say = (reply, pending = null) => ({ dialog: { pending }, reply, action: null });
  const p = dialog.pending;

  if (intent.type === 'no') return say('Okay, cancelled. Nothing was sent.');

  // Answers to a question we asked.
  if (p?.kind === 'amount') {
    const amountKobo = intent.amountKobo ?? null;
    if (amountKobo && (intent.type === 'amount' || (intent.type === 'transfer' && !intent.payeeIds.length && !intent.accountNumber))) {
      return toPayee(p.payee, amountKobo, ctx);
    }
  }
  if (p?.kind === 'bank') {
    const bankCode = intent.bankCode ?? null;
    if (bankCode) return toAccount(p.accountNumber, bankCode, p.amountKobo ?? intent.amountKobo ?? null, ctx);
  }
  if (p?.kind === 'confirm-payee') {
    // Hearing who owns the account is the point of the check: only a clear yes moves on.
    if (intent.type === 'yes') return toPayee(p.payee, p.amountKobo ?? null, ctx);
    if (!['balance', 'recent', 'help', 'transfer'].includes(intent.type)) {
      return say(`Do you want to pay ${p.payee.name}? Say yes or no.`, p);
    }
  }

  switch (intent.type) {
    case 'yes':
      return say(`There is nothing to confirm right now. ${EXAMPLES}`);
    case 'help':
      return say(EXAMPLES);
    case 'balance':
      return say(`Your demo balance is ${spokenNaira(ctx.balanceKobo)}.`);
    case 'recent': {
      const items = ctx.activity.slice(0, 3).map((t) =>
        `${t.description}, ${t.direction === 'debit' ? 'debit' : 'credit'}, ${spokenNaira(t.amountKobo)}, ${STATUS_LABEL[t.status] ?? t.status}, ${spokenDate(t.occurredAt)}`);
      return say(items.length ? `Your last ${items.length} transactions. ${items.join('. ')}.` : 'You have no transactions yet.');
    }
    case 'transfer': {
      if (intent.accountNumber) return toAccount(intent.accountNumber, intent.bankCode, intent.amountKobo, ctx);
      const matches = ctx.beneficiaries.filter((b) => intent.payeeIds.includes(b.id));
      if (matches.length === 1) return toPayee(matches[0], intent.amountKobo, ctx);
      if (matches.length > 1) {
        return say(`I found ${matches.length} saved people: ${matches.map((b) => b.name).join(' and ')}. Say the full name.`);
      }
      if (intent.nameHeard) {
        return say(`I could not find ${intent.nameHeard} in your saved people. Say their 10-digit account number and bank instead.`);
      }
      return say('Who do you want to pay? Say a saved name, or an account number and bank.');
    }
    case 'amount':
      return say('Who do you want to send it to? Say a saved name, or an account number and bank.');
    case 'bank':
      return say('Say the 10-digit account number too, then the amount.');
    default:
      return say(`Sorry, I did not understand. ${EXAMPLES}`, p);
  }
}

/**
 * After the app looked up an account: say whose it is and ask for a yes before going further.
 * `found` is the bank's lookupName result; `lookalike` a saved beneficiary with a similar name, or null.
 */
export function afterLookup(found, lookalike, amountKobo, ctx) {
  if (!found.ok) {
    return { dialog: newDialog(), reply: 'No account was found with that number at that bank. Check the number and the bank, and try again.', action: null };
  }
  const payee = { id: null, name: found.name, bankCode: found.bankCode, accountNumber: found.accountNumber };
  const warning = lookalike ? `Careful. This is not your saved ${lookalike.name}. The name is similar but the account number is different. ` : '';
  return {
    dialog: { pending: { kind: 'confirm-payee', payee, amountKobo } },
    reply: `${warning}That account belongs to ${found.name}, ${firstWordOfBank(ctx.banks, found.bankCode)}. Do you want to pay ${found.name}? Say yes or no.`,
    action: null,
  };
}
