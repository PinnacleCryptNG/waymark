// The bank boundary (bank-api.js), backed by the WAYMARK server. Every call carries the
// session token from voice sign-in. Transfers also carry a one-time voice approval.

export function createServerBank({ base = '', getToken }) {
  let behaviour = 'normal';

  async function call(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Bank error ${res.status}`);
    return res.json();
  }

  return {
    getAccount: () => call('/api/account'),
    listActivity: () => call('/api/activity'),
    listBeneficiaries: () => call('/api/beneficiaries'),
    lookupName: ({ bankCode, accountNumber }) => call('/api/name-enquiry', { method: 'POST', body: { bankCode, accountNumber } }),
    quoteTransfer: ({ amountKobo }) => call('/api/quote', { method: 'POST', body: { amountKobo } }),
    submitTransfer: ({ idempotencyKey, payee, amountKobo, note, approvalToken }) =>
      call('/api/transfers', { method: 'POST', body: { idempotencyKey, payee, amountKobo, note: note ?? '', approvalToken, behaviour } }),
    getTransferStatus: (id) => call(`/api/transfers/${encodeURIComponent(id)}`),
    /** Demo switch: make the next transfer decline or hold. */
    setBehaviour: (b) => { behaviour = b; },
    reset: () => {},
  };
}
