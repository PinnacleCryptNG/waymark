// The voice assistant end to end, with stand-ins for the fingerprint sensor and screens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant, extractDigits } from '../app/voice/assistant.js';
import { createRuleInterpreter } from '../app/voice/interpreter.js';
import { createDemoBank, BEHAVIOURS } from '../app/bank/demo-bank.js';
import { sendTransfer, checkTransfer } from '../app/bank/transfer-client.js';
import { BANKS } from '../app/data/seed.js';

function setup({ fingerprint = true, fingerprintWorks = true, signedIn = false, credential = null, authMethod = null } = {}) {
  const bank = createDemoBank({ speed: 0 });
  const data = { account: null, activity: [], beneficiaries: [] };
  const session = { signedIn, authMethod };
  const log = { progress: [], screens: 0, review: null };
  let cred = credential;
  const refresh = async () => {
    const [account, activity, beneficiaries] = await Promise.all([bank.getAccount(), bank.listActivity(), bank.listBeneficiaries()]);
    Object.assign(data, { account, activity, beneficiaries });
  };
  const a = createAssistant({
    interpreter: createRuleInterpreter(),
    bank,
    banks: BANKS,
    biometric: {
      available: fingerprint,
      register: async () => (fingerprintWorks ? { ok: true, credentialId: 'cred-1' } : { ok: false, reason: 'cancelled' }),
      verify: async () => (fingerprintWorks ? { ok: true } : { ok: false, reason: 'cancelled' }),
    },
    credential: { get: () => cred, save: (id) => { cred = id; } },
    session: {
      signedIn: () => session.signedIn,
      authMethod: () => session.authMethod,
      signIn: async (method) => { session.signedIn = true; session.authMethod = method; await refresh(); },
      refresh,
      context: () => ({ beneficiaries: data.beneficiaries, banks: BANKS, balanceKobo: data.account?.balanceKobo ?? 0, activity: data.activity }),
    },
    transfers: { send: (p) => sendTransfer(bank, p, { timeoutMs: 50, slowMs: 10 }), check: (x) => checkTransfer(bank, x) },
    progress: async (t) => { log.progress.push(t); },
    switchToScreens: () => { log.screens += 1; },
    openReview: (payee, amountKobo) => { log.review = { payee, amountKobo }; },
  });
  return { a, bank, data, session, log, refresh, cred: () => cred };
}

test('digits are read from speech in every common form', () => {
  assert.equal(extractDigits('0803 123 4567'), '08031234567');
  assert.equal(extractDigits('zero eight zero three one two three four five six seven'), '08031234567');
  assert.equal(extractDigits('oh eight oh three, double one, two three'), '0803112' + '3');
  assert.equal(extractDigits('one two three four five six'), '123456');
  assert.equal(extractDigits('triple 5'), '555');
});

test('sign-up by voice: phone, code, fingerprint, then ready', async () => {
  const { a, cred, session } = setup();
  let r = await a.begin();
  assert.match(r.say, /Welcome to WAYMARK/);
  assert.match(r.say, /Say your mobile number/);
  assert.equal(r.then, 'listen');

  r = await a.hear('my number is 1 2 3');
  assert.match(r.say, /not a Nigerian mobile number/);

  r = await a.hear('zero eight zero three one two three four five six seven');
  assert.match(r.say, /ending 4 5 6 7/);
  assert.match(r.say, /the code is 1 2 3 4 5 6/);

  r = await a.hear('one two three four five six');
  assert.match(r.say, /Tap anywhere on the screen, then confirm with your phone lock/);
  assert.equal(a.wantsTap(), true);

  r = await a.tapped();
  assert.match(r.say, /You're all set\. Your demo balance is 245,800 naira/);
  assert.equal(session.signedIn, true);
  assert.equal(session.authMethod, 'biometric');
  assert.equal(cred(), 'cred-1');
});

test('returning user signs in with one tap and a fingerprint', async () => {
  const { a } = setup({ credential: 'cred-1' });
  let r = await a.begin();
  assert.match(r.say, /Welcome back/);
  r = await a.tapped();
  assert.match(r.say, /You're signed in\. What would you like to do\?/);
});

test('no fingerprint on this phone: voice sends the user to the screens', async () => {
  const { a, log } = setup({ fingerprint: false });
  await a.begin();
  await a.hear('08031234567');
  let r = await a.hear('123456');
  assert.match(r.say, /has no screen lock WAYMARK can use/);
  r = await a.hear('screens');
  assert.equal(log.screens, 1);
});

async function signedIn(opts) {
  const ctx = setup(opts);
  await ctx.a.begin();
  await ctx.a.hear('08031234567');
  await ctx.a.hear('123456');
  await ctx.a.tapped();
  return ctx;
}

test('pay a saved person entirely by voice: summary from bank figures, tap and fingerprint to send', async () => {
  const { a, data } = await signedIn();
  let r = await a.hear('send 500 naira to Musa');
  assert.equal(r.say, "Send 500 naira to Musa Ibrahim, Savanna Bank (demo), account ending 8 8 4 6. The fee is 10 naira, so 510 naira in total. To send it, tap anywhere on the screen, then confirm with your phone lock: fingerprint, face or PIN. To stop, say cancel.");
  assert.equal(a.wantsTap(), true);

  r = await a.hear('yes');
  assert.match(r.say, /tap anywhere/i, 'yes alone never sends');
  assert.equal(data.account.balanceKobo, 24580000);

  r = await a.tapped();
  assert.match(r.say, /^Done\. 500 naira sent to Musa Ibrahim\. Reference W M/);
  assert.match(r.say, /Your balance is now 245,290 naira/);
  assert.equal(data.account.balanceKobo, 24580000 - 51000);
});

test('cancel before the fingerprint sends nothing', async () => {
  const { a, data } = await signedIn();
  await a.hear('send 500 to Musa');
  const r = await a.hear('cancel');
  assert.match(r.say, /Cancelled\. Nothing was sent/);
  assert.equal(data.account.balanceKobo, 24580000);
  assert.equal(a.wantsTap(), false);
});

test('a failed fingerprint sends nothing', async () => {
  const ctx = await signedIn();
  await ctx.a.hear('send 500 to Musa');
  // Swap in a sensor that refuses.
  const refusing = setup({ fingerprintWorks: false, signedIn: true, authMethod: 'biometric', credential: 'cred-1' });
  await refusing.refresh();
  await refusing.a.begin();
  await refusing.a.hear('send 500 to Musa');
  const r = await refusing.a.tapped();
  assert.match(r.say, /Not confirmed\. Nothing was sent/);
  assert.equal(refusing.data.account.balanceKobo, 24580000);
});

test('new account by voice: owner read back, yes, then tap and fingerprint', async () => {
  const { a, log } = await signedIn();
  let r = await a.hear('pay 0198765432 at Lagoon bank 2000 naira');
  assert.deepEqual(log.progress, ['Looking up the account.']);
  assert.match(r.say, /That account belongs to Chinedu Eze/);
  r = await a.hear('yes');
  assert.match(r.say, /^Send 2,000 naira to Chinedu Eze, Lagoon Bank \(demo\), account ending 5 4 3 2/);
  r = await a.tapped();
  assert.match(r.say, /^Done\. 2,000 naira sent to Chinedu Eze/);
});

test('connection drop: unknown outcome, then status check finds it completed', async () => {
  const { a, bank } = await signedIn();
  await a.hear('send 500 to Musa');
  bank.setBehaviour(BEHAVIOURS.DROP);
  let r = await a.tapped();
  assert.match(r.say, /I could not confirm whether it went through\. It may already have gone\. Do not send it again/);
  bank.setBehaviour(BEHAVIOURS.NORMAL);
  r = await a.hear('check status');
  assert.match(r.say, /^Done\. 500 naira sent to Musa Ibrahim/);
});

test('repeat, stop and silence', async () => {
  const { a } = await signedIn();
  const first = await a.hear('what is my balance');
  assert.equal(first.say, 'Your demo balance is 245,800 naira.');
  assert.equal((await a.hear('say that again')).say, first.say);
  let r = a.silence();
  assert.match(r.say, /didn't hear anything/);
  r = a.silence();
  assert.equal(r.then, 'idle');
  r = await a.hear('goodbye');
  assert.equal(r.then, 'idle');
});

test('pin users are handed to the Review screen', async () => {
  const ctx = setup({ signedIn: true, authMethod: 'pin' });
  await ctx.refresh();
  await ctx.a.begin();
  const r = await ctx.a.hear('send 500 to Musa');
  assert.match(r.say, /Opening the review screen/);
  assert.equal(ctx.log.review.amountKobo, 50000);
});
