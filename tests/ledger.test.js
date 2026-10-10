// T-04, T-05: idempotent submission and balance/activity consistency.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLedger, submitTransfer, checkStatus, activity } from '../app/domain/ledger.js';
import { STATES as S, createTransfer, transition } from '../app/domain/transfer.js';
import { ACCOUNT, TRANSACTIONS } from '../app/data/seed.js';

const payee = { name: 'Chinedu Eze', bankCode: 'LGN', accountNumber: '0198765432' };
const fresh = () => createLedger({ account: ACCOUNT, transactions: TRANSACTIONS });
const processing = (amountKobo = 500000) =>
  transition(transition(createTransfer({ payee, amountKobo, feeKobo: 1000 }), S.REVIEW), S.PROCESSING);

test('T-04 the same operation submitted ten times creates one ledger entry', () => {
  let ledger = fresh();
  const t = processing();
  for (let i = 0; i < 10; i++) ledger = submitTransfer(ledger, t, S.COMPLETED).ledger;
  assert.equal(ledger.transactions.length, TRANSACTIONS.length + 1);
  assert.equal(ledger.balanceKobo, ACCOUNT.balanceKobo - 501000);
});

test('T-05 completed debits once and adds one item', () => {
  const r = submitTransfer(fresh(), processing(), S.COMPLETED);
  assert.equal(r.transfer.state, S.COMPLETED);
  assert.match(r.transfer.reference, /^WM-[0-9A-Z]{4}$/);
  assert.equal(r.ledger.balanceKobo, ACCOUNT.balanceKobo - 501000);
  assert.equal(activity(r.ledger)[0].status, S.COMPLETED);
  assert.equal(activity(r.ledger)[0].transferId, r.transfer.operationId);
});

test('T-05 failed leaves the balance unchanged and never shows as completed', () => {
  const r = submitTransfer(fresh(), processing(), S.FAILED);
  assert.equal(r.ledger.balanceKobo, ACCOUNT.balanceKobo);
  assert.equal(activity(r.ledger)[0].status, S.FAILED);
});

test('T-05 cancel never reaches the ledger', () => {
  const ledger = fresh();
  const t = transition(createTransfer({ payee, amountKobo: 500000, feeKobo: 1000 }), S.CANCELLED);
  assert.throws(() => submitTransfer(ledger, t, S.COMPLETED), /must be processing/);
  assert.equal(ledger.balanceKobo, ACCOUNT.balanceKobo);
});

test('T-05 unknown then resolved: one activity item, debited exactly once', () => {
  let { ledger, transfer } = submitTransfer(fresh(), processing(), S.UNKNOWN);
  assert.equal(ledger.balanceKobo, ACCOUNT.balanceKobo, 'not debited while unknown');
  assert.equal(activity(ledger)[0].status, S.UNKNOWN);

  ({ ledger } = checkStatus(ledger, transfer.operationId));
  assert.equal(ledger.balanceKobo, ACCOUNT.balanceKobo - 501000);
  assert.equal(ledger.transactions.filter((t) => t.transferId === transfer.operationId).length, 1);
  assert.equal(activity(ledger)[0].status, S.COMPLETED);

  // Checking again changes nothing.
  const again = checkStatus(ledger, transfer.operationId);
  assert.equal(again.changed, false);
  assert.equal(again.ledger.balanceKobo, ledger.balanceKobo);
});

test('pending can resolve to failed without debiting', () => {
  let { ledger, transfer } = submitTransfer(fresh(), processing(), S.PENDING);
  ({ ledger } = checkStatus(ledger, transfer.operationId, S.FAILED));
  assert.equal(ledger.balanceKobo, ACCOUNT.balanceKobo);
  assert.equal(activity(ledger)[0].status, S.FAILED);
});

test('the ledger re-checks funds even if the form did not', () => {
  const r = submitTransfer(fresh(), processing(ACCOUNT.balanceKobo), S.COMPLETED);
  assert.equal(r.transfer.state, S.FAILED);
  assert.equal(r.transfer.failureReason, 'insufficient-funds');
  assert.equal(r.ledger.balanceKobo, ACCOUNT.balanceKobo);
});

test('ledger state survives a JSON round trip (sessionStorage)', () => {
  const r = submitTransfer(fresh(), processing(), S.PENDING);
  const restored = JSON.parse(JSON.stringify(r.ledger));
  const resolved = checkStatus(restored, r.transfer.operationId);
  assert.equal(resolved.transfer.state, S.COMPLETED);
});
