// Transfer state machine. See "Transfer states" in the PRD.

export const STATES = Object.freeze({
  DRAFT: 'draft',
  REVIEW: 'review',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PENDING: 'pending',
  UNKNOWN: 'unknown',
  CANCELLED: 'cancelled',
});

const S = STATES;
const ALLOWED = {
  [S.DRAFT]: [S.REVIEW, S.CANCELLED],
  [S.REVIEW]: [S.DRAFT, S.PROCESSING, S.CANCELLED],
  [S.PROCESSING]: [S.COMPLETED, S.FAILED, S.PENDING, S.UNKNOWN],
  [S.PENDING]: [S.COMPLETED, S.FAILED],
  [S.UNKNOWN]: [S.COMPLETED, S.FAILED, S.PENDING], // a status check may find the bank still working on it
  [S.COMPLETED]: [],
  [S.FAILED]: [],
  [S.CANCELLED]: [],
};

export const canTransition = (from, to) => ALLOWED[from]?.includes(to) ?? false;

/** Returns a new transfer in state `to`, or throws on an illegal move. */
export function transition(transfer, to) {
  if (!canTransition(transfer.state, to)) {
    throw new Error(`Illegal transfer transition: ${transfer.state} -> ${to}`);
  }
  return { ...transfer, state: to, updatedAt: new Date().toISOString() };
}

export const isUnresolved = (state) => state === S.PENDING || state === S.UNKNOWN;

/** Plain-language status words, shared by activity, detail and outcome screens. */
export const STATUS_LABEL = {
  completed: 'Completed',
  failed: 'Failed',
  pending: 'Pending',
  unknown: 'Outcome unknown',
};

let counter = 0;
export function newOperationId() {
  counter += 1;
  const rand = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `op-${counter}-${rand}`;
}

/** Start a transfer in DRAFT. Each attempt (including a retry after failure) gets a new operation id. */
export function createTransfer({ payee, amountKobo, feeKobo, note = '' }) {
  const now = new Date().toISOString();
  return {
    operationId: newOperationId(),
    payee: { ...payee }, // snapshot: name, bankCode, accountNumber
    amountKobo,
    feeKobo,
    totalKobo: amountKobo + feeKobo,
    note,
    state: S.DRAFT,
    reference: null,
    createdAt: now,
    updatedAt: now,
  };
}
