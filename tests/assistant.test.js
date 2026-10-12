// The voice assistant end to end, with stand-ins for the WAYMARK server's voice checks and the screens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssistant, extractDigits } from '../app/voice/assistant.js';
import { createRuleInterpreter } from '../app/voice/interpreter.js';
import { createDemoBank, BEHAVIOURS } from '../app/bank/demo-bank.js';
import { sendTransfer, checkTransfer } from '../app/bank/transfer-client.js';
import { BANKS } from '../app/data/seed.js';

const CLIP = { ok: true, audio: 'clip' };

/** Stand-in for voice-auth.js. `voice` decides what the next voice check says. */
function fakeAuth({ registered = false, savedPhone = null } = {}) {
  const f = { voice: 'match', heard: '47291', phone: savedPhone, samples: 0, approvals: [], challenges: [], locked: false };
  f.api = {
    savedPhone: () => f.phone,
    forget: () => { f.phone = null; },
    async start(phone) { f.phone = phone; return { ok: true, phone, status: registered ? 'active' : 'enrolling', samplesNeeded: 3 }; },
    async challenge(body) {
      if (f.locked) return { ok: false, code: 'locked' };
      f.challenges.push(body);
      return { ok: true, challengeId: `c${f.challenges.length}`, digits: '47291' };
    },
    async enroll() {
      if (f.voice === 'wrong-digits') return { ok: false, code: 'wrong-digits', heard: '4729' };
      if (f.voice !== 'match') return { ok: false, code: 'different-voice' };
      f.samples += 1;
      return f.samples < 3 ? { ok: true, done: false, samples: f.samples, samplesNeeded: 3 } : { ok: true, done: true, token: 't' };
    },
    async login() { return f.voice === 'match' ? { ok: true, token: 't' } : { ok: false, code: 'voice-mismatch' }; },
    async approve() {
      if (f.voice !== 'match') return { ok: false, code: 'voice-mismatch' };
      f.approvals.push('a1');
      return { ok: true, approvalToken: 'a1' };
    },
  };
  return f;
}

function setup({ signedIn = false, canRecord = true, registered = false, savedPhone = null } = {}) {
  const bank = createDemoBank({ speed: 0 });
  const data = { account: null, activity: [], beneficiaries: [] };
  const session = { signedIn };
  const log = { progress: [], screens: 0, sent: [] };
  const auth = fakeAuth({ registered, savedPhone });
  const refresh = async () => {
    const [account, activity, beneficiaries] = await Promise.all([bank.getAccount(), bank.listActivity(), bank.listBeneficiaries()]);
    Object.assign(data, { account, activity, beneficiaries });
  };
  const a = createAssistant({
    interpreter: createRuleInterpreter(),
    bank,
    banks: BANKS,
    auth: auth.api,
    canRecord,
    session: {
      signedIn: () => session.signedIn,
      signIn: async () => { session.signedIn = true; await refresh(); },
      refresh,
      context: () => ({ beneficiaries: data.beneficiaries, banks: BANKS, balanceKobo: data.account?.balanceKobo ?? 0, activity: data.activity }),
    },
    transfers: {
      send: (p) => { log.sent.push(p); return sendTransfer(bank, p, { timeoutMs: 50, slowMs: 10 }); },
      check: (x) => checkTransfer(bank, x),
    },
    progress: async (t) => { log.progress.push(t); },
    switchToScreens: () => { log.screens += 1; },
  });
  return { a, bank, data, session, log, refresh, auth };
}

test('digits are read from speech in every common form', () => {
  assert.equal(extractDigits('0803 123 4567'), '08031234567');
  assert.equal(extractDigits('zero eight zero three one two three four five six seven'), '08031234567');
  assert.equal(extractDigits('oh eight oh three, double one, two three'), '0803112' + '3');
  assert.equal(extractDigits('one two three four five six'), '123456');
  assert.equal(extractDigits('triple 5'), '555');
});

test('sign-up by voice: phone number with no code, then three voice samples, then ready', async () => {
  const { a, session, auth } = setup();
  let r = await a.begin();
  assert.match(r.say, /Welcome to WAYMARK/);
  assert.match(r.say, /Say your mobile number/);
  assert.equal(r.then, 'listen');

  r = await a.hear('my number is 1 2 3');
  assert.match(r.say, /not a Nigerian mobile number/);

  r = await a.hear('zero eight zero three one two three four five six seven');
  assert.match(r.say, /ending 4 5 6 7 is set up/);
  assert.match(r.say, /learn your voice/);
  assert.match(r.say, /After the tone, say: 4, 7, 2, 9, 1\.$/);
  assert.equal(r.then, 'record');
  assert.equal(auth.phone, '08031234567');

  r = await a.recorded(CLIP);
  assert.match(r.say, /^Got it\. Two more\./);
  r = await a.recorded(CLIP);
  assert.match(r.say, /^Got it\. One more\./);
  r = await a.recorded(CLIP);
  assert.match(r.say, /Your voice is saved/);
  assert.match(r.say, /Your demo balance is 245,800 naira/);
  assert.equal(r.then, 'listen');
  assert.equal(session.signedIn, true);
});

test('sign-up: wrong digits or a different voice asks again with fresh numbers', async () => {
  const { a, auth } = setup();
  await a.begin();
  await a.hear('08031234567');
  auth.voice = 'wrong-digits';
  let r = await a.recorded(CLIP);
  assert.match(r.say, /I heard 4, 7, 2, 9\. Let's try that again\. After the tone/);
  auth.voice = 'other';
  r = await a.recorded(CLIP);
  assert.match(r.say, /different voice/);
  assert.equal(r.then, 'record');
  assert.equal(auth.challenges.length, 3);
});

test('a number that already has an account signs in by voice', async () => {
  const { a, session } = setup({ registered: true });
  await a.begin();
  let r = await a.hear('08031234567');
  assert.match(r.say, /already has a WAYMARK account/);
  assert.equal(r.then, 'record');
  r = await a.recorded(CLIP);
  assert.match(r.say, /You're signed in\. What would you like to do\?/);
  assert.equal(session.signedIn, true);
});

test('returning user: straight to the voice check, and another voice is refused', async () => {
  const { a, auth, session } = setup({ savedPhone: '08031234567' });
  let r = await a.begin();
  assert.match(r.say, /Welcome back/);
  assert.equal(r.then, 'record');
  auth.voice = 'other';
  r = await a.recorded(CLIP);
  assert.match(r.say, /did not match this account/);
  assert.equal(session.signedIn, false);
  auth.locked = true;
  auth.voice = 'match';
  // After too many misses the server locks the account.
  const locked = setup({ savedPhone: '08031234567' });
  locked.auth.locked = true;
  r = await locked.a.begin();
  assert.match(r.say, /locked for 15 minutes/);
  assert.equal(r.then, 'idle');
});

test('no microphone recording in this browser: explains, never signs in', async () => {
  const { a } = setup({ canRecord: false });
  const r = await a.begin();
  assert.match(r.say, /cannot record/);
  assert.equal(r.then, 'idle');
});

async function signedIn(opts) {
  const ctx = setup(opts);
  await ctx.a.begin();
  await ctx.a.hear('08031234567');
  for (let i = 0; i < 3; i++) await ctx.a.recorded(CLIP);
  return ctx;
}

test('pay a saved person entirely by voice: summary from bank figures, tap and voice check to send', async () => {
  const { a, data, auth, log } = await signedIn();
  let r = await a.hear('send 500 naira to Musa');
  assert.equal(r.say, 'Send 500 naira to Musa Ibrahim, Savanna Bank (demo), account ending 8 8 4 6. The fee is 10 naira, so 510 naira in total. To send it, tap anywhere on the screen and say the numbers I give you. To stop, say cancel.');
  assert.equal(a.wantsTap(), true);

  r = await a.hear('yes');
  assert.match(r.say, /tap anywhere/i, 'yes alone never sends');
  assert.equal(data.account.balanceKobo, 24580000);

  r = await a.tapped();
  assert.equal(r.say, 'After the tone, say: 4, 7, 2, 9, 1.');
  assert.equal(r.then, 'record');
  const ch = auth.challenges.at(-1);
  assert.equal(ch.purpose, 'approve');
  assert.equal(ch.amountKobo, 50000);
  assert.equal(ch.payee.accountNumber, '2203918846');

  r = await a.recorded(CLIP);
  assert.match(r.say, /^Done\. 500 naira sent to Musa Ibrahim\. Reference W M/);
  assert.match(r.say, /Your balance is now 245,290 naira/);
  assert.equal(data.account.balanceKobo, 24580000 - 51000);
  assert.equal(log.sent[0].approvalToken, 'a1');
});

test('cancel before the voice check sends nothing', async () => {
  const { a, data } = await signedIn();
  await a.hear('send 500 to Musa');
  const r = await a.hear('cancel');
  assert.match(r.say, /Cancelled\. Nothing was sent/);
  assert.equal(data.account.balanceKobo, 24580000);
  assert.equal(a.wantsTap(), false);
});

test('a voice that does not match sends nothing', async () => {
  const { a, data, auth, log } = await signedIn();
  await a.hear('send 500 to Musa');
  await a.tapped();
  auth.voice = 'other';
  const r = await a.recorded(CLIP);
  assert.match(r.say, /did not match this account\. Nothing was sent\. Tap anywhere to try again/);
  assert.equal(r.then, 'idle');
  assert.equal(log.sent.length, 0);
  assert.equal(data.account.balanceKobo, 24580000);
  assert.equal(a.wantsTap(), true);
});

test('new account by voice: owner read back, yes, then tap and voice check', async () => {
  const { a, log } = await signedIn();
  let r = await a.hear('pay 0198765432 at Lagoon bank 2000 naira');
  assert.deepEqual(log.progress.slice(-1), ['Looking up the account.']);
  assert.match(r.say, /That account belongs to Chinedu Eze/);
  r = await a.hear('yes');
  assert.match(r.say, /^Send 2,000 naira to Chinedu Eze, Lagoon Bank \(demo\), account ending 5 4 3 2/);
  await a.tapped();
  r = await a.recorded(CLIP);
  assert.match(r.say, /^Done\. 2,000 naira sent to Chinedu Eze/);
});

test('connection drop: unknown outcome, then status check finds it completed', async () => {
  const { a, bank } = await signedIn();
  await a.hear('send 500 to Musa');
  await a.tapped();
  bank.setBehaviour(BEHAVIOURS.DROP);
  let r = await a.recorded(CLIP);
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

test('no speech in a recording asks again without calling the server', async () => {
  const { a, auth } = setup({ savedPhone: '08031234567' });
  await a.begin();
  const r = await a.recorded({ ok: false, reason: 'no-speech' });
  assert.match(r.say, /^I didn't hear you\. After the tone, say/);
  assert.equal(r.then, 'record');
  const again = await a.recorded({ ok: false, reason: 'no-speech' });
  assert.match(again.say, /Tap anywhere when you are ready/);
  assert.equal(again.then, 'idle', 'stops recording after two quiet tries');
  assert.equal(auth.challenges.length, 1);
});
