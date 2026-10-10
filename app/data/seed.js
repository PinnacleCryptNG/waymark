// All names, banks, account numbers and amounts here are invented for the demo.
// Banks carry "(demo)" in their names so nothing reads as a real institution.

export const DEMO_PHONE = '08000000000';
export const DEMO_OTP = '123456';

export const BANKS = [
  { code: 'LGN', name: 'Lagoon Bank (demo)' },
  { code: 'SVN', name: 'Savanna Bank (demo)' },
  { code: 'HMT', name: 'Harmattan Bank (demo)' },
  { code: 'KLA', name: 'Kola Microfinance (demo)' },
];

export const ACCOUNT = {
  id: 'acc-1',
  nickname: 'Demo savings',
  currency: 'NGN',
  balanceKobo: 24580000, // ₦245,800.00
};

export const BENEFICIARIES = [
  { id: 'ben-1', name: 'Adaeze Okafor', bankCode: 'LGN', accountNumber: '0123454719' },
  { id: 'ben-2', name: 'Musa Ibrahim', bankCode: 'SVN', accountNumber: '2203918846' },
  { id: 'ben-3', name: 'Funke Adeyemi', bankCode: 'HMT', accountNumber: '3108827153' },
];

// The fictional name-enquiry directory. Includes the saved beneficiaries,
// new payees, and one lookalike of a saved beneficiary on a different number.
export const DIRECTORY = [
  ...BENEFICIARIES.map(({ name, bankCode, accountNumber }) => ({ name, bankCode, accountNumber })),
  { name: 'Chinedu Eze', bankCode: 'LGN', accountNumber: '0198765432' },
  { name: 'Grace Bello', bankCode: 'SVN', accountNumber: '2211334455' },
  { name: 'Tunde Bakare', bankCode: 'SVN', accountNumber: '2299001122' },
  { name: 'Halima Yusuf', bankCode: 'HMT', accountNumber: '3100456789' },
  { name: 'Emeka Nwosu', bankCode: 'HMT', accountNumber: '3177002244' },
  { name: 'Ngozi Umeh', bankCode: 'KLA', accountNumber: '5001239876' },
  { name: 'Ibrahim Sani', bankCode: 'KLA', accountNumber: '5004561230' },
  { name: 'Bisi Lawal', bankCode: 'LGN', accountNumber: '0155667788' },
  // Lookalike of saved "Adaeze Okafor" (0123454719) on another number and bank.
  { name: 'Adaeze Okafur', bankCode: 'KLA', accountNumber: '5009988776' },
];

export const TRANSACTIONS = [
  { id: 'tx-6', description: 'Salary, Demo Employer Ltd', direction: 'credit', amountKobo: 35000000, feeKobo: 0, status: 'completed', occurredAt: '2026-09-30T09:12:00Z', reference: 'WM-S0930' },
  { id: 'tx-5', description: 'Transfer to Musa Ibrahim', direction: 'debit', amountKobo: 1500000, feeKobo: 1000, status: 'completed', occurredAt: '2026-10-01T14:05:00Z', reference: 'WM-T1001' },
  { id: 'tx-4', description: 'Airtime top-up', direction: 'debit', amountKobo: 200000, feeKobo: 0, status: 'completed', occurredAt: '2026-10-03T08:40:00Z', reference: 'WM-A1003' },
  { id: 'tx-3', description: 'Transfer to Funke Adeyemi', direction: 'debit', amountKobo: 500000, feeKobo: 1000, status: 'failed', occurredAt: '2026-10-05T19:22:00Z', reference: 'WM-T1005' },
  { id: 'tx-2', description: 'Market stall rent', direction: 'debit', amountKobo: 4000000, feeKobo: 1000, status: 'completed', occurredAt: '2026-10-07T11:30:00Z', reference: 'WM-T1007' },
  { id: 'tx-1', description: 'Refund from Kola Stores', direction: 'credit', amountKobo: 1200000, feeKobo: 0, status: 'completed', occurredAt: '2026-10-09T16:45:00Z', reference: 'WM-R1009' },
];

export const bankName = (code) => BANKS.find((b) => b.code === code)?.name ?? 'Unknown bank';
