// The bank service boundary. Screens talk to a bank only through these methods.
// The demo uses DemoBank (demo-bank.js). Going live means writing another object with the
// same methods that calls the bank's authorised APIs; the screens do not change.
//
// Every method is async and may reject with a network error. Money is integer kobo.
//
// getAccount()                          -> { id, nickname, currency, balanceKobo }
// listActivity()                        -> Transaction[] newest first
//                                          { id, transferId?, description, direction, amountKobo,
//                                            feeKobo, status, occurredAt, reference }
// listBeneficiaries()                   -> { id, name, bankCode, accountNumber }[]
// lookupName({ bankCode, accountNumber })
//                                       -> { ok: true, name, bankCode, accountNumber }
//                                        | { ok: false, code: 'not-found' }
//                                          (production: NIP name enquiry)
// quoteTransfer({ amountKobo })         -> { ok: true, amountKobo, feeKobo, totalKobo }
//                                        | { ok: false, code: 'invalid-amount' | 'insufficient-funds' }
// submitTransfer({ idempotencyKey, payee, amountKobo, note })
//                                       -> TransferStatus
//                                          The same idempotencyKey always returns the same transfer
//                                          and never moves money twice.
// getTransferStatus(transferId)         -> TransferStatus | { ok: false, code: 'not-found' }
//
// TransferStatus = { ok: true, transferId, state: 'completed' | 'failed' | 'pending',
//                    reference, payee, amountKobo, feeKobo, totalKobo, note, failureReason, updatedAt }
//
// A bank never answers 'unknown'. Unknown is what the client concludes when it gets no answer.

export const BANK_METHODS = [
  'getAccount', 'listActivity', 'listBeneficiaries', 'lookupName',
  'quoteTransfer', 'submitTransfer', 'getTransferStatus',
];

/** Throws if `bank` is missing a method, so a new adapter fails fast instead of mid-demo. */
export function assertBank(bank) {
  const missing = BANK_METHODS.filter((m) => typeof bank?.[m] !== 'function');
  if (missing.length) throw new Error(`Bank adapter is missing: ${missing.join(', ')}`);
  return bank;
}
