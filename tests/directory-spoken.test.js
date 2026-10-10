// T-06 directory lookup and lookalike warning; T-07 exact spoken forms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupAccount, findLookalike, namesLookAlike } from '../app/domain/directory.js';
import { validateAccountNumber, normaliseDigits, MESSAGES } from '../app/domain/validation.js';
import {
  spokenNaira, spokenDirectionAmount, maskAccount, spokenAccountEnding, spokenReference,
  spokenDate, spokenDateTime, spellOut,
} from '../app/domain/spoken.js';
import { DIRECTORY, BENEFICIARIES } from '../app/data/seed.js';

test('T-06 lookup returns the account name', () => {
  const r = lookupAccount(DIRECTORY, 'LGN', '0198765432');
  assert.equal(r.ok, true);
  assert.equal(r.entry.name, 'Chinedu Eze');
});

test('T-06 right number at the wrong bank is not found', () => {
  assert.deepEqual(lookupAccount(DIRECTORY, 'SVN', '0198765432'), { ok: false, code: 'not-found' });
});

test('T-06 lookalike of a saved beneficiary on a different number warns', () => {
  const r = lookupAccount(DIRECTORY, 'KLA', '5009988776');
  const lookalike = findLookalike(BENEFICIARIES, r.entry);
  assert.equal(lookalike?.name, 'Adaeze Okafor');
});

test('T-06 the saved beneficiary itself does not warn', () => {
  const r = lookupAccount(DIRECTORY, 'LGN', '0123454719');
  assert.equal(findLookalike(BENEFICIARIES, r.entry), null);
});

test('T-06 an unrelated name does not warn', () => {
  const r = lookupAccount(DIRECTORY, 'LGN', '0198765432');
  assert.equal(findLookalike(BENEFICIARIES, r.entry), null);
});

test('name similarity rules', () => {
  assert.ok(namesLookAlike('Adaeze Okafor', 'adaeze okafor'));
  assert.ok(namesLookAlike('Adaeze Okafor', 'Okafor Adaeze'));
  assert.ok(namesLookAlike('Adaeze Okafor', 'Adaeze Okafur'));
  assert.ok(!namesLookAlike('Adaeze Okafor', 'Ngozi Umeh'));
});

test('account number validation', () => {
  assert.equal(validateAccountNumber(''), MESSAGES.accountBlank);
  assert.equal(validateAccountNumber('123456789'), MESSAGES.accountFormat);
  assert.equal(validateAccountNumber('12345678901'), MESSAGES.accountFormat);
  assert.equal(validateAccountNumber('01234a4719'), MESSAGES.accountFormat);
  assert.equal(validateAccountNumber('0123 454 719'), null);
  assert.equal(normaliseDigits('0123 454-719'), '0123454719');
});

test('T-07 spoken forms match the PRD table exactly', () => {
  assert.equal(spokenNaira(24580000), '245,800 naira');
  assert.equal(spokenNaira(125050), '1,250 naira 50 kobo');
  assert.equal(spokenNaira(50), '50 kobo');
  assert.equal(maskAccount('0123454719'), '******4719');
  assert.equal(spokenAccountEnding('0123454719'), 'account ending 4 7 1 9');
  assert.equal(spokenDirectionAmount('debit', 500000), 'Debit, 5,000 naira');
  assert.equal(spokenDirectionAmount('credit', 15000000), 'Credit, 150,000 naira');
  assert.equal(spokenDate('2026-10-10T10:00:00Z'), '10 October 2026');
  assert.equal(spokenReference('WM-7F3K'), 'Reference W M 7 F 3 K');
});

test('dates use Lagos time', () => {
  assert.equal(spokenDate('2026-10-09T23:30:00Z'), '10 October 2026');
  assert.equal(spokenDateTime('2026-10-10T13:05:00Z'), '10 October 2026, 2:05 pm');
  assert.equal(spokenDateTime('2026-10-09T23:00:00Z'), '10 October 2026, 12:00 am');
});

test('spell out names letter by letter', () => {
  assert.equal(spellOut('Ada Obi'), 'A, D, A, space, O, B, I');
});
