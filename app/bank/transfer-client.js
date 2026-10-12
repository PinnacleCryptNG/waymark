// Client side of a transfer: send it, wait a bounded time, and never guess the result.
// If no reply arrives in time, or the connection fails, the attempt becomes UNKNOWN and the
// only way forward is a status check with the same transfer id.

import { STATES, transition, isUnresolved } from '../domain/transfer.js';

export const CLIENT_TIMEOUT_MS = 6000;
export const SLOW_NOTICE_MS = 2500;

const TIMED_OUT = Symbol('timed-out');
const NETWORK_ERROR = Symbol('network-error');

function applyBankStatus(attempt, status) {
  const next = attempt.state === status.state ? attempt : transition(attempt, status.state);
  return {
    ...next,
    reference: status.reference ?? next.reference,
    feeKobo: status.feeKobo ?? next.feeKobo,
    totalKobo: status.totalKobo ?? next.totalKobo,
    failureReason: status.failureReason ?? null,
  };
}

/**
 * Submit a PROCESSING attempt. Resolves to the attempt in COMPLETED, FAILED, PENDING or UNKNOWN.
 * `onSlow` is called once if the bank has not answered after `slowMs`.
 */
export async function sendTransfer(bank, attempt, { timeoutMs = CLIENT_TIMEOUT_MS, slowMs = SLOW_NOTICE_MS, onSlow } = {}) {
  if (attempt.state !== STATES.PROCESSING) throw new Error(`Attempt must be processing, was ${attempt.state}`);
  const timers = [];
  const timeout = new Promise((resolve) => timers.push(setTimeout(() => resolve(TIMED_OUT), timeoutMs)));
  if (onSlow) timers.push(setTimeout(onSlow, slowMs));

  const request = bank.submitTransfer({
    idempotencyKey: attempt.operationId,
    payee: attempt.payee,
    amountKobo: attempt.amountKobo,
    note: attempt.note,
    approvalToken: attempt.approvalToken,
  }).catch(() => NETWORK_ERROR);

  const reply = await Promise.race([request, timeout]);
  timers.forEach(clearTimeout);

  if (reply === TIMED_OUT || reply === NETWORK_ERROR || !reply?.ok) {
    return { ...transition(attempt, STATES.UNKNOWN), failureReason: null };
  }
  return applyBankStatus(attempt, reply);
}

/**
 * Ask the bank what happened to an unresolved attempt. Never resubmits.
 * Resolves to the updated attempt, or the same attempt if the bank cannot be reached.
 */
export async function checkTransfer(bank, attempt) {
  if (!isUnresolved(attempt.state)) return attempt;
  let status;
  try {
    status = await bank.getTransferStatus(attempt.operationId);
  } catch {
    return attempt; // still unknown; the user can check again
  }
  if (!status.ok) {
    // The bank has no record: the request never arrived, so no money moved.
    return { ...transition(attempt, STATES.FAILED), failureReason: 'not-received' };
  }
  return applyBankStatus(attempt, status);
}

/** Build a client attempt from a bank status, e.g. when opening a transfer from Activity. */
export const attemptFromStatus = (status) => ({
  operationId: status.transferId,
  payee: status.payee,
  amountKobo: status.amountKobo,
  feeKobo: status.feeKobo,
  totalKobo: status.totalKobo,
  note: status.note,
  state: status.state,
  reference: status.reference,
  failureReason: status.failureReason,
  createdAt: status.updatedAt,
  updatedAt: status.updatedAt,
});
