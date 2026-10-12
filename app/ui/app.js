// App shell: state, hash routing, focus management and event handling.
// All banking goes through `bank` (see bank/bank-api.js). Screens render from a local
// cache (state.bankData) that is refreshed from the bank after anything changes.

import { BEHAVIOURS } from '../bank/demo-bank.js';
import { createServerBank } from '../bank/server-bank.js';
import { createVoiceAuth } from '../voice/voice-auth.js';
import { recordClip, recordingSupported } from '../voice/recorder.js';
import { assertBank } from '../bank/bank-api.js';
import { sendTransfer, checkTransfer, attemptFromStatus } from '../bank/transfer-client.js';
import { STATES, createTransfer, transition } from '../domain/transfer.js';
import { findLookalike } from '../domain/directory.js';
import { spellOut } from '../domain/spoken.js';
import {
  MESSAGES, validateAmount, validateAccountNumber, normaliseDigits, validatePinFormat, validateNote,
  validatePhone, amountOverBalance,
} from '../domain/validation.js';
import { FEE_KOBO, koboToInputText } from '../domain/money.js';
import { DEMO_OTP, BANKS } from '../data/seed.js';
import * as screens from './screens.js';
import { announce, focusElement } from './dom.js';
import { prefsStore, bankStorage, credentialStore, DEFAULT_PREFS } from './store.js';
import { biometricAvailable, registerBiometric, verifyBiometric } from './biometric.js';
import { createRuleInterpreter } from '../voice/interpreter.js';
import { createGeminiInterpreter } from '../voice/gemini-interpreter.js';
import { AI_ENDPOINT, API_BASE } from '../config.js';
import { createAssistant } from '../voice/assistant.js';
import { speak, stopSpeaking, startListening, tone } from '../voice/speech.js';
import { createTalkDriver } from './talk.js';
import { playOutcome } from './haptics.js';

// Accounts live on the WAYMARK server. Signing in is by voice; the session token is kept for this tab only.
const auth = createVoiceAuth({ base: API_BASE });
const bank = assertBank(createServerBank({ base: API_BASE, getToken: auth.token }));
// Gemini reads what was said when its server is set up (config.js); otherwise the built-in rules do.
const reader = AI_ENDPOINT ? createGeminiInterpreter({ endpoint: AI_ENDPOINT }) : createRuleInterpreter();
// Note on the conversation which reader understood each sentence, so it is easy to see Gemini at work.
const interpreter = {
  name: reader.name,
  async interpret(text, ctx) {
    const intent = await reader.interpret(text, ctx);
    const last = [...state.voice.log].reverse().find((e) => e.who === 'you');
    if (AI_ENDPOINT && last && intent.via) {
      last.via = intent.via;
      const list = document.getElementById('voice-log');
      if (list) list.innerHTML = screens.voiceLogHtml(state.voice.log);
    }
    return intent;
  },
};

const freshLookup = () => ({ accountText: '', bankCode: '', result: null, lookalike: null, loading: false, spelled: '' });
const freshFlow = () => ({ payee: null, amountText: '', note: '', transfer: null, behaviour: BEHAVIOURS.NORMAL });

const state = {
  signedIn: false,
  pin: null, // memory only, never stored
  prefs: prefsStore.load(),
  form: {},
  lookup: freshLookup(),
  flow: freshFlow(),
  attempts: {}, // transfer attempts as this device knows them, by transfer id
  auth: { method: null }, // 'biometric' or 'pin', chosen at sign-in
  biometric: { available: false, credentialId: credentialStore.load() },
  voice: { log: [], status: null },
  bankData: { account: null, activity: [], beneficiaries: [] },
  ui: { errors: null, focus: null, submitting: false, checking: false, flash: '', confirmReset: false, loadingAttempt: false },
};

async function refreshBankData() {
  const [account, activity, beneficiaries] = await Promise.all([
    bank.getAccount(), bank.listActivity(), bank.listBeneficiaries(),
  ]);
  state.bankData = { account, activity, beneficiaries };
}

// ---------- Routing ----------

const PUBLIC = new Set(['welcome', 'talk', 'start', 'signin', 'otp', 'secure', 'create-pin', 'help', 'settings']);

const SCREENS = {
  welcome: screens.talk, // voice first: the first screen is the Talk screen
  talk: screens.talk,
  start: screens.welcome, // the screens-based start, for anyone who prefers it
  signin: screens.signin,
  otp: screens.otp,
  secure: screens.secure,
  'create-pin': screens.createPin,
  home: screens.home,
  activity: screens.activityList,
  tx: screens.txDetail,
  pay: screens.pay,
  'pay-new': screens.payNew,
  amount: screens.amount,
  review: screens.review,
  outcome: screens.outcome,
  cancelled: screens.cancelled,
  help: screens.help,
  settings: screens.settings,
};

function parseRoute() {
  const [name, ...rest] = location.hash.replace(/^#/, '').split('/');
  return { name: SCREENS[name] ? name : null, param: rest.join('/') ? decodeURIComponent(rest.join('/')) : null };
}

/** Where to send the user instead, or null when the route is allowed. */
function guard({ name }) {
  if (!name) return state.signedIn ? 'home' : 'welcome';
  if (!state.signedIn && !PUBLIC.has(name)) return 'welcome';
  if (state.signedIn && ['welcome', 'start', 'signin', 'otp', 'secure', 'create-pin'].includes(name)) return 'home';
  // Signing up and signing in are by voice now (the server checks the voice), so the old screens are retired.
  if (['signin', 'otp', 'secure', 'create-pin'].includes(name)) return 'start';
  if (name === 'otp' && !state.form.phoneOk) return 'signin';
  if ((name === 'secure' || name === 'create-pin') && !state.form.otpOk) return 'signin';
  if (name === 'amount' && !state.flow.payee) return 'pay';
  if (name === 'review' && !state.flow.transfer) return state.flow.payee ? 'amount' : 'pay';
  return null;
}

const go = (route) => { location.hash = route; };

function render() {
  const route = parseRoute();
  const redirect = guard(route);
  if (redirect) { location.replace(`#${redirect}`); return; }

  // Opening a transfer this device has not seen (from Activity, or after a refresh): ask the bank.
  if (route.name === 'outcome' && !state.attempts[route.param] && !state.ui.loadingAttempt) {
    loadAttempt(route.param);
  }

  const screen = SCREENS[route.name](state, route.param);
  const main = document.getElementById('main');
  main.innerHTML = screen.html;
  main.dataset.layout = screen.layout ?? '';
  // Every screen opens at its top; focus then scrolls only if it must.
  window.scrollTo(0, 0);
  document.title = `${screen.title} · WAYMARK demo`;
  updateNav(screen.nav);

  const target = state.ui.focus ?? screen.focus;
  state.ui.focus = null;
  state.ui.flash = '';
  if (target === 'errors') focusElement(document.getElementById('error-summary'));
  else if (target?.startsWith('#')) focusElement(document.querySelector(target));
  else focusElement(document.getElementById('page-title'));
}

function rerender(focus) {
  state.ui.focus = focus ?? null;
  render();
}

async function loadAttempt(id) {
  state.ui.loadingAttempt = true;
  try {
    const status = await bank.getTransferStatus(id);
    if (status.ok) state.attempts[id] = attemptFromStatus(status);
    else state.attempts[id] = null; // known not to exist
    await refreshBankData();
  } catch {
    state.ui.flash = MESSAGES.network;
  }
  state.ui.loadingAttempt = false;
  if (parseRoute().param === id) rerender();
}

function updateNav(current) {
  const nav = document.getElementById('app-nav');
  nav.hidden = !state.signedIn;
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.nav === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

window.addEventListener('hashchange', () => {
  // Leaving the Talk screen ends the conversation: nothing should keep talking or listening.
  if (!['talk', 'welcome'].includes(parseRoute().name)) talk.stop();
  state.ui.errors = null;
  state.ui.confirmReset = false;
  render();
});

// ---------- Helpers ----------

const val = (id) => document.getElementById(id)?.value ?? '';
const showErrors = (errors) => { state.ui.errors = errors; rerender('errors'); };
const resetFlow = () => { state.flow = freshFlow(); state.lookup = freshLookup(); };

/** Load the account from the bank and land on Home. Returns false if the bank cannot be reached. */
async function finishSignIn(method) {
  try {
    await refreshBankData();
  } catch {
    return false;
  }
  state.auth = { method };
  state.signedIn = true;
  state.form = {};
  state.ui.flash = method === 'biometric'
    ? 'You are signed in. Payments are approved with your phone lock.'
    : 'You are signed in to the demo.';
  go('home');
  return true;
}

const BIO_MESSAGES = {
  cancelled: 'Not confirmed. Try again.',
  'already-registered': 'This phone is already set up for the demo. Try again.',
  unavailable: 'Phone lock is not available in this browser. Use a pin instead.',
};

function setBusy(button, text) {
  if (!button) return;
  button.disabled = true;
  button.setAttribute('aria-disabled', 'true');
  button.textContent = text;
}

function restore(button, text) {
  if (!button) return;
  button.disabled = false;
  button.removeAttribute('aria-disabled');
  button.textContent = text;
}

/** Ask the bank for a fee quote and move to Review. Returns an error message, or null. */
async function startReview() {
  const { flow } = state;
  const startedOn = location.hash;
  const checked = validateAmount(flow.amountText, state.bankData.account.balanceKobo, FEE_KOBO);
  if (!checked.ok) return checked.message;
  let quote;
  try {
    quote = await bank.quoteTransfer({ amountKobo: checked.kobo });
  } catch {
    return MESSAGES.network;
  }
  // The user may have cancelled or moved on while the bank was answering: drop the reply.
  if (state.flow !== flow || location.hash !== startedOn) return null;
  if (!quote.ok) {
    return quote.code === 'insufficient-funds' ? amountOverBalance(quote.balanceKobo, quote.feeKobo) : MESSAGES.amountNotNumber;
  }
  const draft = createTransfer({ payee: flow.payee, amountKobo: quote.amountKobo, feeKobo: quote.feeKobo, note: flow.note.trim() });
  flow.transfer = transition(draft, STATES.REVIEW);
  go('review');
  return null;
}

// ---------- Voice ----------

const voiceContext = () => ({
  beneficiaries: state.bankData.beneficiaries,
  banks: BANKS,
  balanceKobo: state.bankData.account?.balanceKobo ?? 0,
  activity: state.bankData.activity,
});

function talkLog(who, text) {
  state.voice.log.push({ who, text });
  const list = document.getElementById('voice-log');
  if (list) list.innerHTML = screens.voiceLogHtml(state.voice.log);
  const feed = document.getElementById('live-feed');
  if (feed) {
    feed.innerHTML = screens.liveFeedHtml(state.voice.log);
    feed.hidden = false;
  }
}

function talkStatus(text) {
  state.voice.status = text;
  const el = document.getElementById('talk-status');
  if (el) el.textContent = text;
  // The big button shows the state too (listening, speaking, working, waiting for a fingerprint).
  const btn = document.getElementById('talk-btn');
  if (btn) btn.dataset.state = screens.talkState(text);
}

function makeAssistant() {
  return createAssistant({
    interpreter,
    bank,
    banks: BANKS,
    auth,
    canRecord: recordingSupported(),
    session: {
      signedIn: () => state.signedIn,
      async signIn() {
        await refreshBankData();
        state.auth = { method: 'voice' };
        state.signedIn = true;
        state.form = {};
        // Stay in the conversation; just make the address and menu match the signed-in state.
        history.replaceState(null, '', '#talk');
        updateNav('voice');
      },
      async refresh() { try { await refreshBankData(); } catch { /* keep the last known balance */ } },
      context: voiceContext,
    },
    transfers: {
      async send(processing) {
        state.attempts[processing.operationId] = processing;
        const result = await sendTransfer(bank, processing, {
          onSlow: () => talk.progress('Still waiting for the bank. Please do not pay again.'),
        });
        state.attempts[result.operationId] = result;
        playOutcome(result.state, state.prefs.haptics);
        return result;
      },
      async check(attempt) {
        const updated = await checkTransfer(bank, attempt);
        state.attempts[updated.operationId] = updated;
        if (updated !== attempt) playOutcome(updated.state, state.prefs.haptics);
        return updated;
      },
    },
    progress: (text) => talk.progress(text),
    switchToScreens: () => { talk.stop(); go(state.signedIn ? 'home' : 'start'); },
  });
}

let assistant = makeAssistant();

const talk = createTalkDriver({
  assistant: () => assistant,
  speak,
  stopSpeaking,
  startListening: () => startListening(),
  record: () => recordClip(),
  tone,
  vibrate: (ms) => { try { navigator.vibrate?.(ms); } catch { /* optional */ } },
  log: talkLog,
  status: talkStatus,
});

function applyPrefs() {
  const root = document.documentElement;
  root.dataset.textSize = state.prefs.textSize;
  root.dataset.contrast = state.prefs.highContrast ? 'high' : 'standard';
  root.dataset.motion = state.prefs.reducedMotion ? 'reduce' : 'standard';
}

// ---------- Forms ----------

const FORMS = {
  phone() {
    state.form.phone = val('phone');
    const checked = validatePhone(state.form.phone);
    if (!checked.ok) return showErrors([{ field: 'phone', message: checked.message }]);
    state.form.phoneNumber = checked.number;
    state.form.phoneOk = true;
    go('otp');
  },

  otp() {
    state.form.otp = val('otp');
    const digits = normaliseDigits(state.form.otp);
    if (!digits) return showErrors([{ field: 'otp', message: MESSAGES.otpBlank }]);
    if (digits !== DEMO_OTP) return showErrors([{ field: 'otp', message: MESSAGES.otpWrong }]);
    state.form.otpOk = true;
    go('secure');
  },

  async 'create-pin'(form) {
    const pin1 = val('pin1'), pin2 = val('pin2');
    const errors = [];
    const formatError = validatePinFormat(pin1);
    if (formatError) errors.push({ field: 'pin1', message: formatError });
    else if (pin1 !== pin2) errors.push({ field: 'pin2', message: MESSAGES.pinMismatch });
    if (errors.length) return showErrors(errors);
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, 'Signing in…');
    state.pin = pin1;
    if (!await finishSignIn('pin')) {
      restore(button, 'Sign in');
      showErrors([{ field: 'pin1', message: MESSAGES.network }]);
    }
  },

  async lookup(form) {
    const L = state.lookup;
    L.accountText = val('account');
    L.bankCode = val('bank');
    const errors = [];
    const accountError = validateAccountNumber(L.accountText);
    if (accountError) errors.push({ field: 'account', message: accountError });
    if (!L.bankCode) errors.push({ field: 'bank', message: MESSAGES.bankBlank });
    if (errors.length) return showErrors(errors);

    L.loading = true;
    L.result = null;
    L.lookalike = null;
    L.spelled = '';
    document.getElementById('lookup-result')?.remove();
    setBusy(form.querySelector('button[type="submit"]'), 'Looking up account…');
    announce('Looking up account.');

    let found;
    try {
      found = await bank.lookupName({ bankCode: L.bankCode, accountNumber: normaliseDigits(L.accountText) });
    } catch {
      found = null;
    }
    L.loading = false;
    if (state.lookup !== L || parseRoute().name !== 'pay-new') return; // user moved on
    if (!found) return showErrors([{ field: 'account', message: MESSAGES.network }]);
    if (!found.ok) return showErrors([{ field: 'account', message: MESSAGES.notFound }]);
    L.result = { name: found.name, bankCode: found.bankCode, accountNumber: found.accountNumber };
    L.lookalike = findLookalike(state.bankData.beneficiaries, L.result);
    state.ui.errors = null;
    rerender('#lookup-result');
  },

  'talk-text'() {
    const input = document.getElementById('talk-input');
    const text = input.value.trim();
    input.value = '';
    if (text) talk.typed(text);
  },

  async amount(form) {
    const { flow } = state;
    flow.amountText = val('amount');
    flow.note = val('note');
    const errors = [];
    const checked = validateAmount(flow.amountText, state.bankData.account.balanceKobo, FEE_KOBO);
    if (!checked.ok) errors.push({ field: 'amount', message: checked.message });
    const noteError = validateNote(flow.note);
    if (noteError) errors.push({ field: 'note', message: noteError });
    if (errors.length) return showErrors(errors);
    const button = form.querySelector('button[type="submit"]');
    setBusy(button, 'Getting the fee…');
    const error = await startReview();
    if (error) {
      restore(button, 'Review transfer');
      showErrors([{ field: 'amount', message: error }]);
    }
  },

  async confirm() {
    if (state.ui.submitting) return; // a second tap while processing does nothing
    const { flow } = state;
    flow.behaviour = document.querySelector('input[name="behaviour"]:checked')?.value ?? BEHAVIOURS.NORMAL;
    const button = document.getElementById('confirm-btn');

    state.ui.submitting = true;
    const approval = await approveByVoice(flow.transfer, button);
    if (!approval.ok) {
      state.ui.submitting = false;
      return showErrors([{ field: 'confirm-btn', message: `${approval.message} Nothing was sent.` }]);
    }

    setBusy(button, 'Processing…');
    announce('Approved. Sending your transfer to the bank. Please wait.');

    bank.setBehaviour(flow.behaviour);
    const processing = { ...transition(flow.transfer, STATES.PROCESSING), approvalToken: approval.approvalToken };
    flow.transfer = processing;
    state.attempts[processing.operationId] = processing;

    const result = await sendTransfer(bank, processing, {
      onSlow: () => announce('Still waiting for the bank. Do not close this page or pay again.'),
    });
    bank.setBehaviour(BEHAVIOURS.NORMAL); // the demo switch applies to this one transfer only
    state.attempts[result.operationId] = result;
    try { await refreshBankData(); } catch { /* keep the last known balance */ }
    state.ui.submitting = false;

    // Keep the details after a failure so Try again does not mean retyping.
    if (result.state === STATES.FAILED) flow.transfer = null;
    else resetFlow();
    go(`outcome/${encodeURIComponent(result.operationId)}`);
    playOutcome(result.state, state.prefs.haptics);
  },
};

/** The Review screen's voice check: WAYMARK says random digits, records them, the server checks the voice. */
async function approveByVoice(transfer, button) {
  const VOICE_MESSAGES = {
    'wrong-digits': 'Those were not the numbers asked for.',
    'voice-mismatch': 'That voice did not match this account.',
    'no-speech': 'WAYMARK did not hear you.',
    'not-allowed': 'WAYMARK needs the microphone to check your voice. Allow it for this site and try again.',
  };
  try {
    setBusy(button, 'Getting your numbers…');
    const ch = await auth.challenge({ purpose: 'approve', idempotencyKey: transfer.operationId, payee: transfer.payee, amountKobo: transfer.amountKobo });
    if (!ch.ok) return { ok: false, message: MESSAGES.network };
    const spoken = ch.digits.split('').join(', ');
    setBusy(button, `Say: ${ch.digits.split('').join(' ')}`);
    await speak(`After the tone, say: ${spoken}.`);
    tone('start');
    const clip = await recordClip().done;
    tone(clip.ok ? 'stop' : 'error');
    if (!clip.ok) return { ok: false, message: VOICE_MESSAGES[clip.reason] ?? 'The microphone did not work.' };
    setBusy(button, 'Checking your voice…');
    const r = await auth.approve(ch.challengeId, clip.audio);
    return r.ok ? r : { ok: false, message: VOICE_MESSAGES[r.code] ?? 'Your voice could not be checked.' };
  } catch {
    return { ok: false, message: MESSAGES.network };
  }
}

// ---------- Buttons ----------

const ACTIONS = {
  'focus-field'(el) {
    const field = document.getElementById(el.dataset.field);
    if (field) { field.focus(); field.scrollIntoView({ block: 'center' }); }
  },

  async 'setup-biometric'(el) {
    setBusy(el, 'Waiting for your phone lock…');
    announce('Confirm with your fingerprint, face or phone PIN.');
    const result = await registerBiometric();
    if (!result.ok) {
      return showErrors([{ field: 'bio-setup', message: BIO_MESSAGES[result.reason] ?? BIO_MESSAGES.unavailable }]);
    }
    credentialStore.save(result.credentialId);
    state.biometric.credentialId = result.credentialId;
    if (!await finishSignIn('biometric')) showErrors([{ field: 'bio-setup', message: MESSAGES.network }]);
  },

  async 'biometric-signin'(el) {
    setBusy(el, 'Waiting for your phone lock…');
    announce('Confirm with your fingerprint, face or phone PIN to sign in.');
    const result = await verifyBiometric(state.biometric.credentialId);
    if (!result.ok) {
      return showErrors([{ field: 'bio-signin', message: BIO_MESSAGES[result.reason] ?? BIO_MESSAGES.cancelled }]);
    }
    if (!await finishSignIn('biometric')) showErrors([{ field: 'bio-signin', message: MESSAGES.network }]);
  },

  'pay-to'(el) {
    const payee = state.bankData.beneficiaries.find((b) => b.id === el.dataset.id);
    if (!payee) return;
    resetFlow();
    state.flow.payee = { ...payee };
    go('amount');
  },

  'confirm-payee'() {
    const { result } = state.lookup;
    state.flow.payee = { id: null, ...result };
    state.lookup = freshLookup();
    go('amount');
  },

  'spell-name'() {
    const name = state.lookup.result?.name;
    if (!name) return;
    state.lookup.spelled = spellOut(name);
    const box = document.getElementById('lookup-result');
    let p = box.querySelector('.spelled');
    if (!p) {
      p = document.createElement('p');
      p.className = 'spelled';
      p.setAttribute('aria-hidden', 'true');
      box.querySelector('.actions').before(p);
    }
    p.textContent = state.lookup.spelled;
    announce(state.lookup.spelled);
  },

  'clear-lookup'() {
    state.lookup.result = null;
    state.lookup.lookalike = null;
    rerender('#account');
  },

  'edit-amount'() {
    state.flow.transfer = null;
    go('amount');
  },

  'change-payee'() {
    state.flow.transfer = null;
    state.flow.payee = null;
    go('pay');
  },

  'cancel-transfer'() {
    if (state.ui.submitting) return;
    const t = state.flow.transfer;
    if (t) transition(t, STATES.CANCELLED); // throws if it was already sent
    resetFlow();
    go('cancelled');
  },

  async 'check-status'(el) {
    if (state.ui.checking) return;
    const id = parseRoute().param;
    const attempt = state.attempts[id];
    if (!attempt) return;
    state.ui.checking = true;
    setBusy(el, 'Checking status…');
    announce('Checking status with the bank.');
    const updated = await checkTransfer(bank, attempt);
    state.attempts[id] = updated;
    try { await refreshBankData(); } catch { /* keep the last known balance */ }
    state.ui.checking = false;
    if (updated === attempt) state.ui.flash = MESSAGES.network;
    rerender();
    if (updated !== attempt) playOutcome(updated.state, state.prefs.haptics);
  },

  async retry(el) {
    if (!state.flow.payee) { go('pay'); return; }
    setBusy(el, 'Getting the fee…');
    const error = await startReview();
    if (error) go('amount'); // amount screen keeps the entered values for correction
  },

  'reset-ask'() { state.ui.confirmReset = true; rerender('#reset-confirm'); },
  'reset-no'() { state.ui.confirmReset = false; rerender(); },
  async 'reset-yes'() {
    await auth.signOut();
    auth.forget();
    bank.reset();
    state.prefs = { ...DEFAULT_PREFS };
    prefsStore.save(state.prefs);
    state.signedIn = false;
    state.pin = null;
    state.auth = { method: null };
    credentialStore.clear();
    state.biometric.credentialId = null;
    state.form = {};
    state.attempts = {};
    talk.stop();
    state.voice = { log: [], status: null };
    assistant = makeAssistant();
    state.bankData = { account: null, activity: [], beneficiaries: [] };
    state.ui.confirmReset = false;
    resetFlow();
    applyPrefs();
    go('welcome');
  },
};

// ---------- Talk screen: tap anywhere ----------

// Any tap on the Talk screen that is not on a link, form or the details toggle goes to the
// conversation. This is what makes "tap anywhere" true, with or without a screen reader.
document.addEventListener('click', (e) => {
  // "Skip to content" must not change the address: the address is the router.
  if (e.target.closest('.skip-link')) { e.preventDefault(); focusElement(document.getElementById('page-title') ?? main); return; }
  if (!['talk', 'welcome'].includes(parseRoute().name)) return;
  if (e.target.closest('a, input, select, textarea, summary, details, form, nav')) return;
  // On the start page, the explanation below the fold is for reading, not tapping.
  if (e.target.closest('.landing-more, .app-footer')) return;
  e.preventDefault();
  // Tapping the "Try it now" band brings the big button back into view, so its state is visible.
  if (e.target.closest('.landing-cta')) window.scrollTo({ top: 0 });
  talk.tap();
});

// ---------- Event wiring ----------

const main = document.getElementById('main');

main.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  FORMS[form.dataset.form]?.(form);
});

main.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  e.preventDefault();
  ACTIONS[el.dataset.action]?.(el);
});

let pinTimer;
main.addEventListener('input', (e) => {
  const t = e.target;
  // Changing the number or bank invalidates a found name.
  if ((t.id === 'account' || t.id === 'bank') && state.lookup.result) {
    state.lookup.result = null;
    state.lookup.lookalike = null;
    document.getElementById('lookup-result')?.remove();
  }
  if (t.hasAttribute('data-pin-count')) {
    clearTimeout(pinTimer);
    pinTimer = setTimeout(() => announce(`${t.value.length} of 4 digits entered.`), 400);
  }
});

main.addEventListener('change', (e) => {
  const t = e.target;
  if (!t.closest('form[data-form="settings"]')) return;
  const p = state.prefs;
  let message;
  if (t.name === 'textSize') {
    p.textSize = t.value;
    message = `Text size set to ${t.nextElementSibling.textContent}.`;
  } else {
    p[t.name] = t.checked;
    message = `${t.nextElementSibling.textContent} ${t.checked ? 'on' : 'off'}.`;
  }
  applyPrefs();
  prefsStore.save(p);
  announce(`${message} Saved for this session.`);
});

// ---------- Start ----------

applyPrefs();
state.biometric.available = await biometricAvailable();
// Still signed in from earlier in this tab (the server keeps the session for 30 minutes).
if (auth.token()) {
  try {
    await refreshBankData();
    state.signedIn = true;
    state.auth = { method: 'voice' };
  } catch { /* session over: sign in by voice again */ }
}
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) history.replaceState(null, '', '#welcome');
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}
