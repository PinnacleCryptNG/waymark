// T-01, T-02: amount parsing and the amount-plus-fee balance check.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatNaira, koboToInputText, FEE_KOBO, totalDebit } from '../app/domain/money.js';
import { validateAmount, MESSAGES } from '../app/domain/validation.js';

test('T-01 parses valid amounts to integer kobo', () => {
  assert.deepEqual(parseAmount('5000'), { ok: true, kobo: 500000 });
  assert.deepEqual(parseAmount('1,250.50'), { ok: true, kobo: 125050 });
  assert.deepEqual(parseAmount('1250.5'), { ok: true, kobo: 125050 });
  assert.deepEqual(parseAmount(' ₦2,000 '), { ok: true, kobo: 200000 });
  assert.deepEqual(parseAmount('0.01'), { ok: true, kobo: 1 });
  assert.deepEqual(parseAmount('12.'), { ok: true, kobo: 1200 });
});

test('T-01 rejects invalid amounts with a specific code', () => {
  assert.equal(parseAmount('').code, 'blank');
  assert.equal(parseAmount('   ').code, 'blank');
  assert.equal(parseAmount('abc').code, 'not-number');
  assert.equal(parseAmount('1,25').code, 'not-number');
  assert.equal(parseAmount('12a').code, 'not-number');
  assert.equal(parseAmount('0').code, 'zero');
  assert.equal(parseAmount('0.00').code, 'zero');
  assert.equal(parseAmount('-5').code, 'negative');
  assert.equal(parseAmount('1.234').code, 'too-many-decimals');
});

test('formats kobo for display', () => {
  assert.equal(formatNaira(24580000), '₦245,800.00');
  assert.equal(formatNaira(125050), '₦1,250.50');
  assert.equal(formatNaira(5), '₦0.05');
  assert.equal(formatNaira(-500000), '−₦5,000.00');
  assert.equal(koboToInputText(125050), '1250.50');
});

test('T-02 amount plus fee over balance is rejected', () => {
  const balance = 1000000; // ₦10,000
  assert.equal(validateAmount('10000', balance, FEE_KOBO).code, 'over-balance');
  assert.equal(validateAmount('9990.01', balance, FEE_KOBO).code, 'over-balance');
  assert.deepEqual(validateAmount('9990', balance, FEE_KOBO), { ok: true, kobo: 999000 });
  assert.equal(totalDebit(999000), balance);
});

test('every invalid amount has its own message', () => {
  assert.equal(validateAmount('', 1e9, FEE_KOBO).message, MESSAGES.amountBlank);
  assert.equal(validateAmount('x', 1e9, FEE_KOBO).message, MESSAGES.amountNotNumber);
  assert.equal(validateAmount('1.234', 1e9, FEE_KOBO).message, MESSAGES.amountDecimals);
  assert.equal(validateAmount('0', 1e9, FEE_KOBO).message, MESSAGES.amountZero);
  assert.equal(validateAmount('-1', 1e9, FEE_KOBO).message, MESSAGES.amountNegative);
  assert.match(validateAmount('99999999', 100, FEE_KOBO).message, /more than your demo balance/);
});
