// Voice: the command reader (intent.js) and the conversation rules (dialog.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent, extractAmountKobo, extractAccountNumber, normalise } from '../app/voice/intent.js';
import { respond, afterLookup, newDialog, VOICE_LIMIT_KOBO } from '../app/voice/dialog.js';
import { BENEFICIARIES, BANKS } from '../app/data/seed.js';

const ctx = { beneficiaries: BENEFICIARIES, banks: BANKS, balanceKobo: 24580000, activity: [] };
const parse = (t) => parseIntent(t, ctx);

test('amounts in digits, words and shorthand', () => {
  const amt = (t) => extractAmountKobo(normalise(t));
  assert.equal(amt('send 5000 naira'), 500000);
  assert.equal(amt('send ₦5,000'), 500000);
  assert.equal(amt('send 5k'), 500000);
  assert.equal(amt('send 2.5k'), 250000);
  assert.equal(amt('five thousand naira'), 500000);
  assert.equal(amt('five thousand two hundred and fifty'), 525000);
  assert.equal(amt('one hundred and twenty thousand'), 12000000);
  assert.equal(amt('a thousand'), 100000);
  assert.equal(amt('1250.50'), 125050);
  assert.equal(amt('pay musa'), null);
});

test('account numbers spoken as one block, groups or words', () => {
  assert.equal(extractAccountNumber(normalise('0198765432')).accountNumber, '0198765432');
  assert.equal(extractAccountNumber(normalise('019 876 5432')).accountNumber, '0198765432');
  assert.equal(extractAccountNumber(normalise('zero one nine eight seven six five four three two')).accountNumber, '0198765432');
  assert.equal(extractAccountNumber(normalise('send 5000 to 0198765432')).accountNumber, '0198765432');
  assert.equal(extractAccountNumber(normalise('send 5000')).accountNumber, null);
});

test('intents', () => {
  assert.equal(parse('What is my balance?').type, 'balance');
  assert.equal(parse('how much money do I have').type, 'balance');
  assert.equal(parse('read my last transactions').type, 'recent');
  assert.equal(parse('yes please').type, 'yes');
  assert.equal(parse('No').type, 'no');
  assert.equal(parse('help').type, 'help');
  assert.equal(parse('the weather').type, 'unknown');
  assert.deepEqual(parse('two thousand'), { type: 'amount', amountKobo: 200000 });
  assert.deepEqual(parse('Lagoon bank'), { type: 'bank', bankCode: 'LGN' });
});

test('transfer to a saved payee by first, last or full name', () => {
  const t = parse('Send 5,000 naira to Musa');
  assert.equal(t.type, 'transfer');
  assert.deepEqual(t.payeeIds, ['ben-2']);
  assert.equal(t.amountKobo, 500000);
  assert.deepEqual(parse('pay Okafor two thousand').payeeIds, ['ben-1']);
  assert.deepEqual(parse('transfer 300 to funke adeyemi').payeeIds, ['ben-3']);
});

test('transfer to an account number and bank', () => {
  const t = parse('pay 0198765432 at Lagoon Bank 2000 naira');
  assert.equal(t.accountNumber, '0198765432');
  assert.equal(t.bankCode, 'LGN');
  assert.equal(t.amountKobo, 200000);
  assert.deepEqual(t.payeeIds, []);
});

test('unknown name is reported back', () => {
  const t = parse('send 1000 to Bayo');
  assert.equal(t.nameHeard, 'bayo');
  const r = respond(newDialog(), t, ctx);
  assert.match(r.reply, /could not find bayo/i);
  assert.equal(r.action, null);
});

test('dialog: saved payee with amount goes to Review, never sends', () => {
  const r = respond(newDialog(), parse('send 5000 to Musa'), ctx);
  assert.equal(r.action.type, 'review');
  assert.equal(r.action.payee.name, 'Musa Ibrahim');
  assert.equal(r.action.amountKobo, 500000);
  assert.match(r.reply, /5,000 naira to Musa Ibrahim/);
});

test('dialog: missing amount is asked for, then answered', () => {
  let r = respond(newDialog(), parse('pay Musa'), ctx);
  assert.match(r.reply, /How much do you want to send to Musa Ibrahim/);
  r = respond(r.dialog, parse('two thousand'), ctx);
  assert.equal(r.action.type, 'review');
  assert.equal(r.action.amountKobo, 200000);
});

test('dialog: voice limit and balance are enforced before Review', () => {
  const over = respond(newDialog(), { type: 'transfer', payeeIds: ['ben-2'], amountKobo: VOICE_LIMIT_KOBO + 100, accountNumber: null, bankCode: null, nameHeard: null }, ctx);
  assert.equal(over.action, null);
  assert.match(over.reply, /limited to 50,000 naira/);
  const poor = respond(newDialog(), parse('send 40000 to Musa'), { ...ctx, balanceKobo: 100000 });
  assert.equal(poor.action, null);
  assert.match(poor.reply, /more than your balance/);
});

test('dialog: account number without a bank asks which bank, then looks it up', () => {
  let r = respond(newDialog(), parse('send 2000 to 0198765432'), ctx);
  assert.match(r.reply, /Which bank is account ending 5 4 3 2 with/);
  r = respond(r.dialog, parse('Lagoon'), ctx);
  assert.deepEqual(r.action, { type: 'lookup', accountNumber: '0198765432', bankCode: 'LGN', amountKobo: 200000 });
});

test('dialog: after lookup, the name is read and only a clear yes continues', () => {
  const found = { ok: true, name: 'Chinedu Eze', bankCode: 'LGN', accountNumber: '0198765432' };
  let r = afterLookup(found, null, 200000, ctx);
  assert.match(r.reply, /belongs to Chinedu Eze/);
  assert.match(r.reply, /Say yes or no/);
  const notYes = respond(r.dialog, parse('two thousand'), ctx);
  assert.equal(notYes.action, null);
  assert.match(notYes.reply, /Do you want to pay Chinedu Eze/);
  r = respond(r.dialog, parse('yes'), ctx);
  assert.equal(r.action.type, 'review');
  assert.equal(r.action.payee.accountNumber, '0198765432');
});

test('dialog: lookalike warning is spoken before the name', () => {
  const found = { ok: true, name: 'Adaeze Okafur', bankCode: 'KLA', accountNumber: '5009988776' };
  const r = afterLookup(found, BENEFICIARIES[0], 100000, ctx);
  assert.match(r.reply, /^Careful\. This is not your saved Adaeze Okafor/);
});

test('dialog: no cancels anything pending', () => {
  let r = respond(newDialog(), parse('pay Musa'), ctx);
  r = respond(r.dialog, parse('no'), ctx);
  assert.match(r.reply, /Nothing was sent/);
  assert.equal(r.dialog.pending, null);
});

test('dialog: balance and recent are spoken in full words', () => {
  assert.equal(respond(newDialog(), parse('balance'), ctx).reply, 'Your demo balance is 245,800 naira.');
  const recent = respond(newDialog(), parse('recent transactions'), { ...ctx, activity: [
    { description: 'Transfer to Musa Ibrahim', direction: 'debit', amountKobo: 1500000, status: 'completed', occurredAt: '2026-10-01T14:05:00Z' },
  ] }).reply;
  assert.equal(recent, 'Your last 1 transactions. Transfer to Musa Ibrahim, debit, 15,000 naira, Completed, 1 October 2026.');
});
