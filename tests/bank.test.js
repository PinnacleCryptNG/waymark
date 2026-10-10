// The bank boundary: DemoBank behaviours and the client's timeout and status-check rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDemoBank, BEHAVIOURS } from '../app/bank/demo-bank.js';
import { assertBank } from '../app/bank/bank-api.js';
import { sendTransfer, checkTransfer, attemptFromStatus } from '../app/bank/transfer-client.js';
import { STATES as S, createTransfer, transition } from '../app/domain/transfer.js';
import { ACCOUNT } from '../app/data/seed.js';

const payee = { name: 'Chinedu Eze', bankCode: 'LGN', accountNumber: '0198765432' };
const bank = () => createDemoBank({ speed: 0 });
const processing = (amountKobo = 500000) =>
  transition(transition(createTransfer({ payee, amountKobo, feeKobo: 1000 }), S.REVIEW), S.PROCESSING);
const fast = { timeoutMs: 50, slowMs: 10 };

test('DemoBank implements the whole bank API', () => {
  assert.doesNotThrow(() => assertBank(bank()));
  assert.throws(() => assertBank({ getAccount() {} }), /missing/);
});

test('name lookup and quote', async () => {
  const b = bank();
  assert.deepEqual(await b.lookupName({ bankCode: 'LGN', accountNumber: '0198765432' }),
    { ok: true, name: 'Chinedu Eze', bankCode: 'LGN', accountNumber: '0198765432' });
  assert.equal((await b.lookupName({ bankCode: 'SVN', accountNumber: '0198765432' })).code, 'not-found');
  assert.deepEqual(await b.quoteTransfer({ amountKobo: 500000 }), { ok: true, amountKobo: 500000, feeKobo: 1000, totalKobo: 501000 });
  assert.equal((await b.quoteTransfer({ amountKobo: ACCOUNT.balanceKobo })).code, 'insufficient-funds');
  assert.equal((await b.quoteTransfer({ amountKobo: 0 })).code, 'invalid-amount');
});

test('normal: completed, debited once', async () => {
  const b = bank();
  const done = await sendTransfer(b, processing(), fast);
  assert.equal(done.state, S.COMPLETED);
  assert.match(done.reference, /^WM-/);
  assert.equal((await b.getAccount()).balanceKobo, ACCOUNT.balanceKobo - 501000);
});

test('the same idempotency key never moves money twice', async () => {
  const b = bank();
  const t = processing();
  await sendTransfer(b, t, fast);
  await sendTransfer(b, t, fast);
  await b.submitTransfer({ idempotencyKey: t.operationId, payee, amountKobo: t.amountKobo });
  const items = (await b.listActivity()).filter((x) => x.transferId === t.operationId);
  assert.equal(items.length, 1);
  assert.equal((await b.getAccount()).balanceKobo, ACCOUNT.balanceKobo - 501000);
});

test('decline: failed, balance unchanged', async () => {
  const b = bank();
  b.setBehaviour(BEHAVIOURS.DECLINE);
  const done = await sendTransfer(b, processing(), fast);
  assert.equal(done.state, S.FAILED);
  assert.equal((await b.getAccount()).balanceKobo, ACCOUNT.balanceKobo);
});

test('hold: pending, then a status check finds it completed', async () => {
  const b = bank();
  b.setBehaviour(BEHAVIOURS.HOLD);
  const pending = await sendTransfer(b, processing(), fast);
  assert.equal(pending.state, S.PENDING);
  assert.equal((await b.getAccount()).balanceKobo, ACCOUNT.balanceKobo, 'not debited while pending');
  const done = await checkTransfer(b, pending);
  assert.equal(done.state, S.COMPLETED);
  assert.equal((await b.getAccount()).balanceKobo, ACCOUNT.balanceKobo - 501000);
});

test('drop: no reply means UNKNOWN; the status check shows the bank had completed it', async () => {
  const b = bank();
  b.setBehaviour(BEHAVIOURS.DROP);
  let slow = false;
  const unknown = await sendTransfer(b, processing(), { ...fast, onSlow: () => { slow = true; } });
  assert.equal(unknown.state, S.UNKNOWN);
  assert.equal(unknown.reference, null);
  assert.ok(slow, 'slow notice fired');
  b.setBehaviour(BEHAVIOURS.NORMAL);
  const done = await checkTransfer(b, unknown);
  assert.equal(done.state, S.COMPLETED);
  assert.ok(done.reference);
  const items = (await b.listActivity()).filter((x) => x.transferId === unknown.operationId);
  assert.equal(items.length, 1, 'one transfer, not two');
});

test('a network error is UNKNOWN, never FAILED', async () => {
  const broken = { submitTransfer: () => Promise.reject(new Error('offline')) };
  const r = await sendTransfer(broken, processing(), fast);
  assert.equal(r.state, S.UNKNOWN);
});

test('status check while offline keeps the attempt unknown', async () => {
  const offline = { getTransferStatus: () => Promise.reject(new Error('offline')) };
  const unknown = transition(processing(), S.UNKNOWN);
  assert.equal((await checkTransfer(offline, unknown)).state, S.UNKNOWN);
});

test('bank has no record: the request never arrived, so FAILED with no money moved', async () => {
  const b = bank();
  const unknown = transition(processing(), S.UNKNOWN);
  const r = await checkTransfer(b, unknown);
  assert.equal(r.state, S.FAILED);
  assert.equal(r.failureReason, 'not-received');
  assert.equal((await b.getAccount()).balanceKobo, ACCOUNT.balanceKobo);
});

test('the bank re-checks funds and sets the fee itself', async () => {
  const b = bank();
  const t = { ...processing(ACCOUNT.balanceKobo), feeKobo: 0, totalKobo: ACCOUNT.balanceKobo };
  const r = await sendTransfer(b, t, fast);
  assert.equal(r.state, S.FAILED);
  assert.equal(r.failureReason, 'insufficient-funds');
});

test('an attempt can be rebuilt from a bank status', async () => {
  const b = bank();
  const done = await sendTransfer(b, processing(), fast);
  const rebuilt = attemptFromStatus(await b.getTransferStatus(done.operationId));
  assert.equal(rebuilt.state, S.COMPLETED);
  assert.equal(rebuilt.payee.name, 'Chinedu Eze');
  assert.equal(rebuilt.totalKobo, 501000);
});

test('ledger survives storage round trip', async () => {
  let saved = null;
  const storage = { load: () => saved, save: (l) => { saved = JSON.parse(JSON.stringify(l)); } };
  const b1 = createDemoBank({ storage, speed: 0 });
  await sendTransfer(b1, processing(), fast);
  const b2 = createDemoBank({ storage, speed: 0 });
  assert.equal((await b2.getAccount()).balanceKobo, ACCOUNT.balanceKobo - 501000);
  b2.reset();
  assert.equal((await createDemoBank({ storage, speed: 0 }).getAccount()).balanceKobo, ACCOUNT.balanceKobo);
});
