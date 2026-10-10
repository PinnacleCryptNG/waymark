// DemoBank: an in-browser stand-in for a real bank, implementing bank-api.js.
// It owns the ledger, adds realistic delays, and can be told how to behave so every
// outcome can be demonstrated: complete, decline, hold as pending, or lose the reply.

import { createLedger, submitTransfer, checkStatus, activity } from '../domain/ledger.js';
import { STATES } from '../domain/transfer.js';
import { lookupAccount } from '../domain/directory.js';
import { FEE_KOBO } from '../domain/money.js';
import { ACCOUNT, TRANSACTIONS, BENEFICIARIES, DIRECTORY } from '../data/seed.js';

export const BEHAVIOURS = Object.freeze({
  NORMAL: 'normal',   // bank completes the transfer
  DECLINE: 'decline', // bank refuses it; no money moves
  HOLD: 'hold',       // bank accepts it as pending; a later status check finds it completed
  DROP: 'drop',       // bank completes it, but the reply never reaches the phone
});

const DEFAULT_LATENCY = { read: 150, lookup: 700, quote: 250, submit: 1200, status: 900 };

const clone = (x) => JSON.parse(JSON.stringify(x)); // nothing shared by reference across the boundary
const seedLedger = () => createLedger({ account: ACCOUNT, transactions: TRANSACTIONS });

export function createDemoBank({ storage = null, latency = DEFAULT_LATENCY, speed = 1 } = {}) {
  let ledger = storage?.load() ?? seedLedger();
  let behaviour = BEHAVIOURS.NORMAL;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms * speed));
  const save = () => storage?.save(ledger);

  const statusOf = (t) => ({
    ok: true,
    transferId: t.operationId,
    state: t.state,
    reference: t.reference,
    payee: { ...t.payee },
    amountKobo: t.amountKobo,
    feeKobo: t.feeKobo,
    totalKobo: t.totalKobo,
    note: t.note,
    failureReason: t.failureReason ?? null,
    updatedAt: t.updatedAt,
  });

  return {
    async getAccount() {
      await wait(latency.read);
      return { id: ACCOUNT.id, nickname: ACCOUNT.nickname, currency: ACCOUNT.currency, balanceKobo: ledger.balanceKobo };
    },

    async listActivity() {
      await wait(latency.read);
      return clone(activity(ledger));
    },

    async listBeneficiaries() {
      await wait(latency.read);
      return clone(BENEFICIARIES);
    },

    async lookupName({ bankCode, accountNumber }) {
      await wait(latency.lookup);
      const found = lookupAccount(DIRECTORY, bankCode, accountNumber);
      if (!found.ok) return found;
      const { name } = found.entry;
      return { ok: true, name, bankCode, accountNumber };
    },

    async quoteTransfer({ amountKobo }) {
      await wait(latency.quote);
      if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) return { ok: false, code: 'invalid-amount' };
      const totalKobo = amountKobo + FEE_KOBO;
      if (totalKobo > ledger.balanceKobo) return { ok: false, code: 'insufficient-funds', balanceKobo: ledger.balanceKobo, feeKobo: FEE_KOBO };
      return { ok: true, amountKobo, feeKobo: FEE_KOBO, totalKobo };
    },

    async submitTransfer({ idempotencyKey, payee, amountKobo, note = '' }) {
      if (!idempotencyKey) throw new Error('idempotencyKey is required');
      // The request reaches the bank quickly; the reply takes longer.
      await wait(latency.submit / 4);

      const existing = ledger.transfers[idempotencyKey];
      if (!existing) {
        const now = new Date().toISOString();
        const processing = {
          operationId: idempotencyKey,
          payee: { name: payee.name, bankCode: payee.bankCode, accountNumber: payee.accountNumber },
          amountKobo,
          feeKobo: FEE_KOBO, // the bank sets the fee, not the client
          totalKobo: amountKobo + FEE_KOBO,
          note,
          state: STATES.PROCESSING,
          reference: null,
          createdAt: now,
          updatedAt: now,
        };
        const outcome = behaviour === BEHAVIOURS.DECLINE ? STATES.FAILED
          : behaviour === BEHAVIOURS.HOLD ? STATES.PENDING
            : STATES.COMPLETED;
        ledger = submitTransfer(ledger, processing, outcome).ledger;
        save();
      }

      if (behaviour === BEHAVIOURS.DROP) return new Promise(() => {}); // reply lost on the way back
      await wait(latency.submit);
      return statusOf(ledger.transfers[idempotencyKey]);
    },

    async getTransferStatus(transferId) {
      await wait(latency.status);
      const t = ledger.transfers[transferId];
      if (!t) return { ok: false, code: 'not-found' };
      if (t.state === STATES.PENDING) {
        // Time has passed: the bank finishes a held transfer by the next status check.
        ledger = checkStatus(ledger, transferId, STATES.COMPLETED).ledger;
        save();
      }
      return statusOf(ledger.transfers[transferId]);
    },

    // ---- Demo controls (not part of the bank API) ----
    setBehaviour(next) {
      if (!Object.values(BEHAVIOURS).includes(next)) throw new Error(`Unknown behaviour ${next}`);
      behaviour = next;
    },
    getBehaviour: () => behaviour,
    reset() {
      ledger = seedLedger();
      behaviour = BEHAVIOURS.NORMAL;
      save();
    },
  };
}
