// App shell: state, hash routing, focus management and event handling.

import { createLedger, submitTransfer, checkStatus } from '../domain/ledger.js';
import { STATES, createTransfer, transition } from '../domain/transfer.js';
import { FEE_KOBO } from '../domain/money.js';
import { lookupAccount, findLookalike } from '../domain/directory.js';
import { spellOut } from '../domain/spoken.js';
import {
  MESSAGES, validateAmount, validateAccountNumber, normaliseDigits, validatePinFormat, validateNote,
} from '../domain/validation.js';
import { ACCOUNT, TRANSACTIONS, BENEFICIARIES, DIRECTORY, DEMO_PHONE, DEMO_OTP } from '../data/seed.js';
import * as screens from './screens.js';
import { announce, focusElement } from './dom.js';
import * as store from './store.js';
import { playOutcome } from './haptics.js';

const PROCESSING_MS = 1200;
const LOOKUP_MS = 700;
const STATUS_CHECK_MS = 900;

const freshLookup = () => ({ accountText: '', bankCode: '', result: null, lookalike: null, loading: false, spelled: '' });
const freshFlow = () => ({ payee: null, amountText: '', note: '', transfer: null, outcome: 'completed' });

const saved = store.load();
const state = {
  signedIn: false,
  pin: null, // memory only, never stored
  ledger: saved?.ledger ?? createLedger({ account: ACCOUNT, transactions: TRANSACTIONS }),
  prefs: { ...store.DEFAULT_PREFS, ...saved?.prefs },
  form: {},
  lookup: freshLookup(),
  flow: freshFlow(),
  ui: { errors: null, focus: null, submitting: false, checking: false, flash: '', confirmReset: false },
};

const persist = () => store.save({ ledger: state.ledger, prefs: state.prefs });

// ---------- Routing ----------

const PUBLIC = new Set(['welcome', 'signin', 'otp', 'create-pin', 'help', 'settings']);

const SCREENS = {
  welcome: screens.welcome,
  signin: screens.signin,
  otp: screens.otp,
  'create-pin': screens.createPin,
  home: screens.home,
  activity: screens.activityList,
  tx: screens.txDetail,
  pay: screens.pay,
  'pay-new': screens.payNew,
  'pay-saved': screens.paySaved,
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
  if (state.signedIn && ['welcome', 'signin', 'otp', 'create-pin'].includes(name)) return 'home';
  if (name === 'otp' && !state.form.phoneOk) return 'signin';
  if (name === 'create-pin' && !state.form.otpOk) return 'signin';
  if (name === 'amount' && !state.flow.payee) return 'pay';
  if (name === 'review' && !state.flow.transfer) return state.flow.payee ? 'amount' : 'pay';
  return null;
}

const go = (route) => { location.hash = route; };

function render() {
  const route = parseRoute();
  const redirect = guard(route);
  if (redirect) { location.replace(`#${redirect}`); return; }

  const screen = SCREENS[route.name](state, route.param);
  const main = document.getElementById('main');
  main.innerHTML = screen.html;
  document.title = `${screen.title} · WAYMARK demo`;
  updateNav(screen.nav);

  const target = state.ui.focus;
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

function updateNav(current) {
  const nav = document.getElementById('app-nav');
  nav.hidden = !state.signedIn;
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.nav === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

window.addEventListener('hashchange', () => {
  state.ui.errors = null;
  state.ui.confirmReset = false;
  render();
});

// ---------- Helpers ----------

const val = (id) => document.getElementById(id)?.value ?? '';
const showErrors = (errors) => { state.ui.errors = errors; rerender('errors'); };
const resetFlow = () => { state.flow = freshFlow(); state.lookup = freshLookup(); };

function startReview() {
  const { flow } = state;
  const checked = validateAmount(flow.amountText, state.ledger.balanceKobo, FEE_KOBO);
  if (!checked.ok) { go('amount'); return; }
  const draft = createTransfer({ payee: flow.payee, amountKobo: checked.kobo, feeKobo: FEE_KOBO, note: flow.note.trim() });
  flow.transfer = transition(draft, STATES.REVIEW);
  go('review');
}

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
    const digits = normaliseDigits(state.form.phone);
    if (!digits) return showErrors([{ field: 'phone', message: MESSAGES.phoneBlank }]);
    if (digits !== DEMO_PHONE) return showErrors([{ field: 'phone', message: MESSAGES.phoneWrong }]);
    state.form.phoneOk = true;
    go('otp');
  },

  otp() {
    state.form.otp = val('otp');
    const digits = normaliseDigits(state.form.otp);
    if (!digits) return showErrors([{ field: 'otp', message: MESSAGES.otpBlank }]);
    if (digits !== DEMO_OTP) return showErrors([{ field: 'otp', message: MESSAGES.otpWrong }]);
    state.form.otpOk = true;
    go('create-pin');
  },

  'create-pin'() {
    const pin1 = val('pin1'), pin2 = val('pin2');
    const errors = [];
    const formatError = validatePinFormat(pin1);
    if (formatError) errors.push({ field: 'pin1', message: formatError });
    else if (pin1 !== pin2) errors.push({ field: 'pin2', message: MESSAGES.pinMismatch });
    if (errors.length) return showErrors(errors);
    state.pin = pin1;
    state.signedIn = true;
    state.form = {};
    state.ui.flash = 'You are signed in to the demo.';
    go('home');
  },

  lookup() {
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
    const btn = document.querySelector('[data-form="lookup"] button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Looking up account…';
    announce('Looking up account.');

    setTimeout(() => {
      L.loading = false;
      const found = lookupAccount(DIRECTORY, L.bankCode, normaliseDigits(L.accountText));
      if (!found.ok) return showErrors([{ field: 'account', message: MESSAGES.notFound }]);
      L.result = found.entry;
      L.lookalike = findLookalike(BENEFICIARIES, found.entry);
      state.ui.errors = null;
      rerender('#lookup-result');
    }, LOOKUP_MS);
  },

  saved() {
    const id = document.querySelector('input[name="payee"]:checked')?.value;
    if (!id) return showErrors([{ field: 'payee', message: MESSAGES.payeeBlank }]);
    state.flow.payee = { ...BENEFICIARIES.find((b) => b.id === id) };
    go('amount');
  },

  amount() {
    const { flow } = state;
    flow.amountText = val('amount');
    flow.note = val('note');
    const errors = [];
    const checked = validateAmount(flow.amountText, state.ledger.balanceKobo, FEE_KOBO);
    if (!checked.ok) errors.push({ field: 'amount', message: checked.message });
    const noteError = validateNote(flow.note);
    if (noteError) errors.push({ field: 'note', message: noteError });
    if (errors.length) return showErrors(errors);
    startReview();
  },

  confirm() {
    if (state.ui.submitting) return; // second tap while processing does nothing
    const { flow } = state;
    flow.outcome = document.querySelector('input[name="outcome"]:checked')?.value ?? 'completed';
    if (val('pin') !== state.pin) return showErrors([{ field: 'pin', message: MESSAGES.pinWrong }]);

    state.ui.submitting = true;
    const btn = document.getElementById('confirm-btn');
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = 'Processing…';
    announce('Processing your transfer. Please wait.');

    const processing = transition(flow.transfer, STATES.PROCESSING);
    flow.transfer = processing;
    setTimeout(() => {
      const result = submitTransfer(state.ledger, processing, flow.outcome);
      state.ledger = result.ledger;
      persist();
      state.ui.submitting = false;
      // Keep the details after a failure so Try again does not mean retyping.
      if (result.transfer.state === STATES.FAILED) flow.transfer = null;
      else resetFlow();
      go(`outcome/${encodeURIComponent(result.transfer.operationId)}`);
      playOutcome(result.transfer.state, state.prefs.haptics);
    }, PROCESSING_MS);
  },
};

// ---------- Buttons ----------

const ACTIONS = {
  'focus-field'(el) {
    const field = document.getElementById(el.dataset.field);
    if (field) { field.focus(); field.scrollIntoView({ block: 'center' }); }
  },

  'confirm-payee'() {
    const { result } = state.lookup;
    state.flow.payee = { id: null, name: result.name, bankCode: result.bankCode, accountNumber: result.accountNumber };
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
    if (t) transition(t, STATES.CANCELLED); // throws if it was already submitted
    resetFlow();
    go('cancelled');
  },

  'check-status'(el) {
    if (state.ui.checking) return;
    const id = parseRoute().param;
    state.ui.checking = true;
    el.disabled = true;
    el.textContent = 'Checking status…';
    announce('Checking status.');
    setTimeout(() => {
      const result = checkStatus(state.ledger, id);
      state.ledger = result.ledger;
      persist();
      state.ui.checking = false;
      rerender();
      playOutcome(result.transfer.state, state.prefs.haptics);
    }, STATUS_CHECK_MS);
  },

  retry() {
    if (!state.flow.payee) { go('pay'); return; }
    startReview();
  },

  'reset-ask'() { state.ui.confirmReset = true; rerender('#reset-confirm'); },
  'reset-no'() { state.ui.confirmReset = false; rerender(); },
  'reset-yes'() {
    store.clear();
    state.ledger = createLedger({ account: ACCOUNT, transactions: TRANSACTIONS });
    state.prefs = { ...store.DEFAULT_PREFS };
    state.signedIn = false;
    state.pin = null;
    state.form = {};
    state.ui.confirmReset = false;
    resetFlow();
    applyPrefs();
    persist();
    go('welcome');
  },
};

// ---------- Event wiring ----------

const main = document.getElementById('main');

main.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  FORMS[form.dataset.form]?.();
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
  persist();
  announce(`${message} Saved for this session.`);
});

// ---------- Start ----------

applyPrefs();
if (!location.hash) history.replaceState(null, '', '#welcome');
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });
}
