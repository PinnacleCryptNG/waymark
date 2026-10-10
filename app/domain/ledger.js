// The one place balance and activity change. Pure functions over a plain, serialisable state.
// Screens never touch balance or transactions directly.

import { STATES, transition, isUnresolved } from './transfer.js';

export function createLedger({ account, transactions }) {
  return {
    balanceKobo: account.balanceKobo,
    transactions: transactions.map((t) => ({ ...t })), // stored oldest first
    transfers: {}, // operationId -> transfer
    seq: 0,
  };
}

const nextReference = (seq) => `WM-${(0x7f3a + seq).toString(36).toUpperCase().padStart(4, '0')}`;

/** Activity, newest first. */
export const activity = (ledger) => [...ledger.transactions].reverse();

/**
 * Record the result of a confirmed transfer. `outcome` is the demo's scripted result:
 * 'completed' | 'failed' | 'pending' | 'unknown'.
 * Idempotent: the same operationId submitted again returns the stored transfer and changes nothing.
 */
export function submitTransfer(ledger, transfer, outcome) {
  const existing = ledger.transfers[transfer.operationId];
  if (existing) return { ledger, transfer: existing, duplicate: true };
  if (transfer.state !== STATES.PROCESSING) {
    throw new Error(`Transfer must be processing to submit, was ${transfer.state}`);
  }

  // Funds are re-checked here even though the form checked them; the screen is not the authority.
  const insufficient = transfer.totalKobo > ledger.balanceKobo;
  const finalState = insufficient ? STATES.FAILED : outcome;
  const seq = ledger.seq + 1;
  const done = { ...transition(transfer, finalState), reference: nextReference(seq), failureReason: insufficient ? 'insufficient-funds' : null };

  const txn = {
    id: `tx-${done.operationId}`,
    transferId: done.operationId,
    description: `Transfer to ${done.payee.name}`,
    direction: 'debit',
    amountKobo: done.amountKobo,
    feeKobo: done.feeKobo,
    status: finalState,
    occurredAt: done.updatedAt,
    reference: done.reference,
  };

  return {
    ledger: {
      ...ledger,
      seq,
      balanceKobo: finalState === STATES.COMPLETED ? ledger.balanceKobo - done.totalKobo : ledger.balanceKobo,
      transactions: [...ledger.transactions, txn],
      transfers: { ...ledger.transfers, [done.operationId]: done },
    },
    transfer: done,
    duplicate: false,
  };
}

/**
 * Check status of a pending or unknown transfer. In the demo the bank "answers" with `resolveTo`
 * (default completed). The activity item is updated in place, so the transfer still appears once.
 */
export function checkStatus(ledger, operationId, resolveTo = STATES.COMPLETED) {
  const current = ledger.transfers[operationId];
  if (!current) throw new Error(`No transfer ${operationId}`);
  if (!isUnresolved(current.state)) return { ledger, transfer: current, changed: false };

  const resolved = transition(current, resolveTo);
  return {
    ledger: {
      ...ledger,
      balanceKobo: resolveTo === STATES.COMPLETED ? ledger.balanceKobo - resolved.totalKobo : ledger.balanceKobo,
      transactions: ledger.transactions.map((t) => (t.transferId === operationId ? { ...t, status: resolveTo } : t)),
      transfers: { ...ledger.transfers, [operationId]: resolved },
    },
    transfer: resolved,
    changed: true,
  };
}
