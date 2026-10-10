// Form validation with plain-language messages. Each message says what is wrong and how to fix it.

import { parseAmount, formatNaira, totalDebit } from './money.js';

export const MESSAGES = {
  phoneBlank: 'Enter the demo phone number. It is printed above the field.',
  phoneWrong: 'That is not the demo phone number. Enter 0800 000 0000.',
  otpBlank: 'Enter the 6-digit demo code. It is printed above the field.',
  otpWrong: 'That code does not match. Enter the demo code 123456.',
  pinFormat: 'Your PIN must be exactly 4 digits.',
  pinMismatch: 'The two PINs do not match. Enter the same 4 digits in both fields.',
  pinWrong: 'That PIN is not correct. Enter the 4-digit demo PIN you created at sign-in.',
  accountBlank: 'Enter the 10-digit account number.',
  accountFormat: 'An account number has exactly 10 digits. Check the number and try again.',
  bankBlank: 'Choose the bank the account is with.',
  notFound: 'No account was found with this number at this bank. Check the number and the bank.',
  payeeBlank: 'Choose who you want to pay.',
  amountBlank: 'Enter an amount to send, for example 5000.',
  amountNotNumber: 'Enter the amount in numbers only, for example 5000 or 5000.50.',
  amountDecimals: 'Enter no more than 2 digits after the decimal point, for example 5000.50.',
  amountZero: 'Enter an amount greater than zero.',
  amountNegative: 'Enter an amount greater than zero. Do not use a minus sign.',
  noteTooLong: 'Keep the note to 30 characters or fewer.',
};

export const amountOverBalance = (balanceKobo, feeKobo) =>
  `The amount plus the ${formatNaira(feeKobo)} fee is more than your demo balance of ${formatNaira(balanceKobo)}. Enter a smaller amount.`;

const AMOUNT_CODE_MESSAGE = {
  blank: MESSAGES.amountBlank,
  'not-number': MESSAGES.amountNotNumber,
  'too-many-decimals': MESSAGES.amountDecimals,
  zero: MESSAGES.amountZero,
  negative: MESSAGES.amountNegative,
};

/** Returns { ok: true, kobo } or { ok: false, code, message }. */
export function validateAmount(text, balanceKobo, feeKobo) {
  const parsed = parseAmount(text);
  if (!parsed.ok) return { ...parsed, message: AMOUNT_CODE_MESSAGE[parsed.code] };
  if (totalDebit(parsed.kobo, feeKobo) > balanceKobo) {
    return { ok: false, code: 'over-balance', message: amountOverBalance(balanceKobo, feeKobo) };
  }
  return parsed;
}

/** Returns null when valid, or a message. Spaces typed between digit groups are ignored. */
export function validateAccountNumber(text) {
  const digits = String(text ?? '').replace(/\s/g, '');
  if (digits === '') return MESSAGES.accountBlank;
  if (!/^\d{10}$/.test(digits)) return MESSAGES.accountFormat;
  return null;
}

export const normaliseDigits = (text) => String(text ?? '').replace(/[\s-]/g, '');

export const validatePinFormat = (pin) => (/^\d{4}$/.test(pin) ? null : MESSAGES.pinFormat);

export const validateNote = (note) => (String(note ?? '').length > 30 ? MESSAGES.noteTooLong : null);
