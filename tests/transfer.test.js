// T-03: every state transition, legal and illegal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATES as S, canTransition, transition, createTransfer, isUnresolved } from '../app/domain/transfer.js';

const LEGAL = [
  [S.DRAFT, S.REVIEW], [S.DRAFT, S.CANCELLED],
  [S.REVIEW, S.DRAFT], [S.REVIEW, S.PROCESSING], [S.REVIEW, S.CANCELLED],
  [S.PROCESSING, S.COMPLETED], [S.PROCESSING, S.FAILED], [S.PROCESSING, S.PENDING], [S.PROCESSING, S.UNKNOWN],
  [S.PENDING, S.COMPLETED], [S.PENDING, S.FAILED],
  [S.UNKNOWN, S.COMPLETED], [S.UNKNOWN, S.FAILED], [S.UNKNOWN, S.PENDING],
];

test('T-03 exactly the legal transitions are allowed', () => {
  const all = Object.values(S);
  for (const from of all) {
    for (const to of all) {
      const expected = LEGAL.some(([f, t]) => f === from && t === to);
      assert.equal(canTransition(from, to), expected, `${from} -> ${to}`);
    }
  }
});

test('T-03 illegal transitions throw', () => {
  const t = createTransfer({ payee: { name: 'A', bankCode: 'LGN', accountNumber: '0000000000' }, amountKobo: 100, feeKobo: 10 });
  assert.throws(() => transition(t, S.PROCESSING), /Illegal/); // cannot skip review
  assert.throws(() => transition(t, S.COMPLETED), /Illegal/);
  const done = transition(transition(transition(t, S.REVIEW), S.PROCESSING), S.COMPLETED);
  assert.throws(() => transition(done, S.FAILED), /Illegal/); // terminal
  const cancelled = transition(t, S.CANCELLED);
  assert.throws(() => transition(cancelled, S.REVIEW), /Illegal/);
});

test('unknown and pending have no path back to processing (no resend)', () => {
  for (const s of [S.PENDING, S.UNKNOWN]) {
    assert.ok(isUnresolved(s));
    assert.equal(canTransition(s, S.PROCESSING), false);
    assert.equal(canTransition(s, S.DRAFT), false);
  }
});

test('each new attempt gets its own operation id; total is amount plus fee', () => {
  const payee = { name: 'A', bankCode: 'LGN', accountNumber: '0000000000' };
  const a = createTransfer({ payee, amountKobo: 500000, feeKobo: 1000 });
  const b = createTransfer({ payee, amountKobo: 500000, feeKobo: 1000 });
  assert.notEqual(a.operationId, b.operationId);
  assert.equal(a.totalKobo, 501000);
  assert.equal(a.state, S.DRAFT);
});
