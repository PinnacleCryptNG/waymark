// Screen templates. Each returns { title, nav, html }. One H1 per screen, given id="page-title".
// Visible amounts use dual() so screen readers hear the exact spoken form.
//
// Fewer swipes: each key screen opens with one sentence that says everything that matters,
// followed straight away by the main action. Full details come after, for sighted readers.

import { esc, dual, money, signedMoney, errorSummary, textField, errorFor } from './dom.js';
import { FEE_KOBO } from '../domain/money.js';
import {
  spokenAccountEnding, maskAccount, spokenReference, spokenDate, spokenDateTime,
} from '../domain/spoken.js';
import { STATUS_LABEL } from '../domain/transfer.js';
import { BANKS, bankName, DEMO_OTP } from '../data/seed.js';
import { hapticsSupported } from './haptics.js';
import { EXAMPLES } from '../voice/dialog.js';
import { TALK_STATUS } from './talk.js';
import { AI_ENDPOINT } from '../config.js';
import { recognitionSupported } from '../voice/speech.js';

const h1 = (text) => `<h1 id="page-title" tabindex="-1">${esc(text)}</h1>`;
const h1Html = (html) => `<h1 id="page-title" tabindex="-1">${html}</h1>`;
const accountEnding = (n) => dual(maskAccount(n), spokenAccountEnding(n));
// Screen readers spell an all-capitals "PIN" letter by letter; say it as a word.
const PIN = dual('PIN', 'pin');

const statusTag = (status) =>
  `<span class="status status--${esc(status)}">${esc(STATUS_LABEL[status] ?? status)}</span>`;

const sep = '<span class="sr-only">, </span>';
const row = (k, v) => `<div class="kv"><dt>${esc(k)}</dt><dd>${v}</dd></div>`;

function txItem(t) {
  return `<li class="tx">
    <a class="tx__link" href="#tx/${esc(t.id)}">
      <span class="tx__desc">${esc(t.description)}</span>${sep}
      <span class="tx__date">${esc(spokenDate(t.occurredAt))}</span>${sep}
      <span class="tx__amount tx__amount--${t.direction}">${signedMoney(t.direction, t.amountKobo)}</span>${sep}
      ${statusTag(t.status)}
    </a>
  </li>`;
}

/** One-tap "pay this person" buttons. */
const payeeButtons = (beneficiaries) => `<ul class="choice-list">
  ${beneficiaries.map((b) => `<li><button type="button" class="choice" data-action="pay-to" data-id="${esc(b.id)}">
    <span class="choice__title">Pay ${esc(b.name)}</span>${sep}
    <span class="choice__hint">${esc(bankName(b.bankCode))}, ${accountEnding(b.accountNumber)}</span>
  </button></li>`).join('')}
</ul>`;

// ---------- Entry and sign-in ----------

export function welcome(state) {
  const quick = state.biometric.available && state.biometric.credentialId;
  return {
    title: 'Welcome',
    html: `${h1('WAYMARK')}
      ${errorSummary(state.ui.errors)}
      <p class="lede">Pay anyone, and hear exactly who you are paying, without asking someone to read your screen.</p>
      <div class="actions">
        ${quick ? '<button type="button" class="button" id="bio-signin" data-action="biometric-signin">Sign in with fingerprint</button>' : ''}
        <a class="button${quick ? ' button--secondary' : ''}" href="#signin">${quick ? 'Sign in another way' : 'Start the demo'}</a>
      </div>
      <section class="notice" aria-labelledby="demo-h">
        <h2 id="demo-h">This is a demo</h2>
        <ul>
          <li>Every name, account and amount is invented.</li>
          <li>No real money moves, and no real bank is connected.</li>
          <li>Never type your real ${PIN}, password or card details here.</li>
          <li>This is an independent prototype for Zecathon 6.0. It is not a Zenith Bank service.</li>
        </ul>
      </section>
      <p><a href="#help">Help</a></p>`,
  };
}

export function signin(state) {
  const errs = state.ui.errors;
  return {
    title: 'Sign in to the demo',
    html: `${h1('Sign in to the demo')}
      ${errorSummary(errs)}
      <p>Step 1 of 3.</p>
      <form data-form="phone" novalidate>
        ${textField({ id: 'phone', label: 'Mobile number', hint: 'Any Nigerian mobile number works in this demo, for example 0803 123 4567. It is not stored or sent anywhere.', error: errorFor(errs, 'phone'), value: state.form.phone ?? '', type: 'tel', inputmode: 'tel' })}
        <button class="button" type="submit">Continue</button>
      </form>`,
  };
}

export function otp(state) {
  const errs = state.ui.errors;
  const last4 = String(state.form.phoneNumber ?? '').slice(-4);
  return {
    title: 'Enter your code',
    html: `${h1('Enter your code')}
      ${errorSummary(errs)}
      <p>Step 2 of 3. A real bank would text a code to your number ending ${dual(last4, last4.split('').join(' '))}. In this demo the code is ${dual(DEMO_OTP, DEMO_OTP.split('').join(' '))}, and it does not expire.</p>
      <form data-form="otp" novalidate>
        ${textField({ id: 'otp', label: 'Code', hint: '6 digits.', error: errorFor(errs, 'otp'), value: state.form.otp ?? '', inputmode: 'numeric' })}
        <button class="button" type="submit">Continue</button>
      </form>`,
  };
}

export function secure(state) {
  const available = state.biometric.available;
  return {
    title: 'Approve payments',
    html: `${h1('How do you want to approve payments?')}
      ${errorSummary(state.ui.errors)}
      ${available
        ? `<p>Step 3 of 3. Your fingerprint is the fastest and most private way. One touch approves a payment, and nothing is spoken or typed, so nobody nearby can hear it.</p>
           <div class="actions">
             <button type="button" class="button" id="bio-setup" data-action="setup-biometric">Use my fingerprint</button>
             <a class="button button--secondary" href="#create-pin"><span>Use a ${PIN} instead</span></a>
           </div>`
        : `<p>Step 3 of 3. This phone or browser cannot use a fingerprint here, so you will create a demo ${PIN} instead.</p>
           <div class="actions"><a class="button" href="#create-pin"><span>Create a ${PIN}</span></a></div>`}`,
  };
}

export function createPin(state) {
  const errs = state.ui.errors;
  return {
    title: 'Create a demo pin',
    html: `${h1Html(`Create a demo ${PIN}`)}
      ${errorSummary(errs)}
      <p class="warning"><strong>Do not use your real bank ${PIN}.</strong> Make up 4 digits for this demo. Your phone's keyboard may read keys aloud as you touch them, so use headphones if you can.</p>
      <form data-form="create-pin" novalidate>
        ${textField({ id: 'pin1', label: 'New demo PIN', hint: '4 digits.', error: errorFor(errs, 'pin1'), type: 'password', inputmode: 'numeric', autocomplete: 'off', extra: 'maxlength="4" aria-label="New demo pin"' })}
        ${textField({ id: 'pin2', label: 'Enter the demo PIN again', error: errorFor(errs, 'pin2'), type: 'password', inputmode: 'numeric', autocomplete: 'off', extra: 'maxlength="4" aria-label="Enter the demo pin again"' })}
        <button class="button" type="submit">Sign in</button>
      </form>`,
  };
}

// ---------- Home, activity, detail ----------

export function home(state) {
  const recent = state.bankData.activity.slice(0, 3);
  return {
    title: 'Home',
    nav: 'home',
    html: `${h1('Home')}
      ${state.ui.flash ? `<p class="flash" role="status">${esc(state.ui.flash)}</p>` : ''}
      <div class="actions"><a class="button button--talk" href="#talk">Talk to WAYMARK</a></div>
      <section class="balance" aria-labelledby="bal-h">
        <h2 id="bal-h">Balance</h2>
        <p class="balance__amount"><span class="sr-only">Demo balance, </span>${money(state.bankData.account.balanceKobo)}</p>
      </section>
      <section aria-labelledby="quick-h">
        <h2 id="quick-h">Pay again</h2>
        ${payeeButtons(state.bankData.beneficiaries)}
        <p><a href="#pay-new">Pay a new account</a></p>
      </section>
      <section aria-labelledby="recent-h">
        <h2 id="recent-h">Recent activity</h2>
        <ol class="tx-list">${recent.map(txItem).join('')}</ol>
        <p><a href="#activity">See all activity</a></p>
      </section>`,
  };
}

export function activityList(state) {
  const items = state.bankData.activity;
  return {
    title: 'Activity',
    nav: 'activity',
    html: `${h1('Activity')}
      <p>${items.length} transactions, newest first. Select one for details.</p>
      ${items.length
        ? `<ol class="tx-list">${items.map(txItem).join('')}</ol>`
        : '<p>No activity yet. When you pay someone, it will appear here.</p><p><a href="#pay">Pay someone</a></p>'}`,
  };
}

export function txDetail(state, id) {
  const t = state.bankData.activity.find((x) => x.id === id);
  if (!t) {
    return { title: 'Transaction not found', nav: 'activity', html: `${h1('Transaction not found')}<p>This transaction is not in your demo activity. It may have been removed by Reset demo.</p><p><a href="#activity">Back to activity</a></p>` };
  }
  return {
    title: t.description,
    nav: 'activity',
    html: `${h1(t.description)}
      <dl class="summary">
        ${row('Status', statusTag(t.status))}
        ${row('Amount', money(t.amountKobo))}
        ${row('Direction', t.direction === 'debit' ? 'Debit, money out' : 'Credit, money in')}
        ${row('Fee', t.feeKobo ? money(t.feeKobo) : 'No fee')}
        ${t.direction === 'debit' ? row('Total', money(t.amountKobo + t.feeKobo)) : ''}
        ${row('Date and time', esc(spokenDateTime(t.occurredAt)))}
        ${row('Reference', dual(t.reference, spokenReference(t.reference)))}
      </dl>
      ${t.status === 'unknown' || t.status === 'pending'
        ? `<p class="warning">This transfer is not final yet. Do not send it again. <a href="#outcome/${esc(t.transferId)}">Check its status</a>.</p>` : ''}
      <p><a href="#activity">Back to activity</a></p>`,
  };
}

// ---------- Paying ----------

export function pay(state) {
  return {
    title: 'Pay someone',
    nav: 'pay',
    html: `${h1('Pay someone')}
      ${payeeButtons(state.bankData.beneficiaries)}
      <ul class="choice-list">
        <li><a class="choice choice--plain" href="#pay-new"><span class="choice__title">Pay a new account</span>${sep}<span class="choice__hint">Type an account number. We will tell you whose account it is before you pay.</span></a></li>
      </ul>`,
  };
}

export function payNew(state) {
  const errs = state.ui.errors;
  const L = state.lookup;
  const bankError = errorFor(errs, 'bank');
  const bankDescribedBy = ['bank-hint', bankError && 'bank-error'].filter(Boolean).join(' ');
  const result = L.result
    ? `<section class="lookup-result${L.lookalike ? ' lookup-result--warn' : ''}" id="lookup-result" tabindex="-1" aria-labelledby="lookup-h">
        <h2 id="lookup-h">${L.lookalike ? 'Check carefully' : 'Account found'}</h2>
        ${L.lookalike ? `<p class="warning"><strong>This is not your saved ${esc(L.lookalike.name)}.</strong> The name is similar, but the account number is different.</p>` : ''}
        <p>Account name: <strong class="payee-name">${esc(L.result.name)}</strong>, ${esc(bankName(L.result.bankCode))}, ${accountEnding(L.result.accountNumber)}.</p>
        ${L.spelled ? `<p class="spelled" aria-hidden="true">${esc(L.spelled)}</p>` : ''}
        <div class="actions">
          <button type="button" class="button" data-action="confirm-payee">Yes, pay ${esc(L.result.name)}</button>
          <button type="button" class="button button--secondary" data-action="spell-name">Spell name</button>
          <button type="button" class="button button--secondary" data-action="clear-lookup">No, change details</button>
        </div>
      </section>`
    : '';
  return {
    title: 'Pay a new account',
    nav: 'pay',
    html: `${h1('Pay a new account')}
      ${errorSummary(errs)}
      <form data-form="lookup" novalidate>
        ${textField({ id: 'account', label: 'Account number', hint: '10 digits. Try 0198765432 at Lagoon Bank, or 5009988776 at Kola Microfinance to hear a warning.', error: errorFor(errs, 'account'), value: L.accountText, inputmode: 'numeric' })}
        <div class="field${bankError ? ' field--error' : ''}">
          <label for="bank">Bank</label>
          <p class="hint" id="bank-hint">All banks in this demo are invented.</p>
          ${bankError ? `<p class="field-error" id="bank-error"><span class="sr-only">Error: </span>${esc(bankError)}</p>` : ''}
          <select id="bank" name="bank" aria-required="true" aria-describedby="${bankDescribedBy}" ${bankError ? 'aria-invalid="true"' : ''}>
            <option value="">Choose a bank</option>
            ${BANKS.map((b) => `<option value="${b.code}"${L.bankCode === b.code ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}
          </select>
        </div>
        <button class="button" type="submit" ${L.loading ? 'disabled' : ''}>${L.loading ? 'Looking up account…' : 'Find account'}</button>
      </form>
      ${result}
      <p><a href="#pay">Back</a></p>`,
  };
}

export function amount(state) {
  const errs = state.ui.errors;
  const p = state.flow.payee;
  return {
    title: 'How much to send',
    nav: 'pay',
    html: `${h1(`How much to send to ${p.name}?`)}
      ${errorSummary(errs)}
      <form data-form="amount" novalidate>
        ${textField({ id: 'amount', label: 'Amount in naira', hint: `Fee ${money(FEE_KOBO)}. Available ${money(state.bankData.account.balanceKobo)}.`, error: errorFor(errs, 'amount'), value: state.flow.amountText ?? '', inputmode: 'decimal' })}
        <button class="button" type="submit">Review transfer</button>
        ${textField({ id: 'note', label: 'Note for the recipient', hint: 'Up to 30 characters.', error: errorFor(errs, 'note'), value: state.flow.note ?? '', required: false })}
      </form>
      <p><button type="button" class="link" data-action="cancel-transfer">Cancel transfer</button></p>`,
  };
}

const BEHAVIOURS = [
  ['normal', 'Normal: the bank completes it'],
  ['decline', 'The bank declines it'],
  ['hold', 'The bank holds it as pending'],
  ['drop', 'The connection drops after sending'],
];

export function review(state) {
  const errs = state.ui.errors;
  const t = state.flow.transfer;
  const p = t.payee;
  const biometric = state.auth.method === 'biometric';
  const busy = state.ui.submitting;
  const confirmLabel = busy ? 'Processing…' : biometric ? 'Confirm with fingerprint' : 'Confirm transfer';
  return {
    title: 'Review transfer',
    nav: 'pay',
    html: `${h1('Review transfer')}
      ${errorSummary(errs)}
      <p class="lede" id="review-summary">Send ${money(t.amountKobo)} to <strong>${esc(p.name)}</strong>, ${esc(bankName(p.bankCode))}, ${accountEnding(p.accountNumber)}. Fee ${money(t.feeKobo)}. Total ${money(t.totalKobo)}.${t.note ? ` Note: ${esc(t.note)}.` : ''} Nothing has been sent yet.</p>
      <form data-form="confirm" novalidate>
        ${biometric ? '' : `
          <p class="hint" id="pin-privacy">Your keyboard may read keys aloud as you touch them. Use headphones if you can.</p>
          ${textField({ id: 'pin', label: 'Demo PIN', error: errorFor(errs, 'pin'), type: 'password', inputmode: 'numeric', autocomplete: 'off', extra: 'maxlength="4" data-pin-count aria-label="Demo pin"' })}`}
        <button class="button" type="submit" id="confirm-btn" ${busy ? 'disabled aria-disabled="true"' : ''}>${confirmLabel}</button>
        <details class="demo-switch">
          <summary>Demo controls for judges</summary>
          <fieldset>
            <legend>Demo bank behaviour</legend>
            <p class="hint">Choose how the demo bank and network behave for this transfer. A real app has no such choice.</p>
            ${BEHAVIOURS.map(([v, label]) => `<div class="radio"><input type="radio" name="behaviour" id="behaviour-${v}" value="${v}"${state.flow.behaviour === v ? ' checked' : ''}><label for="behaviour-${v}">${label}</label></div>`).join('')}
          </fieldset>
        </details>
      </form>
      <div class="actions actions--inline">
        <button type="button" class="button button--secondary" data-action="edit-amount">Change amount</button>
        <button type="button" class="button button--secondary" data-action="change-payee">Change recipient</button>
        <button type="button" class="button button--secondary" data-action="cancel-transfer">Cancel transfer</button>
      </div>`,
  };
}

const OUTCOME_COPY = {
  completed: { h: 'Transfer completed', p: (t) => `You sent ${money(t.amountKobo)} to ${esc(t.payee.name)}.` },
  failed: { h: 'Transfer failed', p: () => 'No money left your demo balance.' },
  pending: { h: 'Transfer pending', p: () => 'The bank has not confirmed this transfer yet. Do not send it again.' },
  unknown: { h: 'We could not confirm this transfer yet', p: () => 'Do not send it again. It may already have gone through. Check its status first.' },
};

export function outcome(state, operationId) {
  const t = state.attempts[operationId];
  if (t === undefined) return { title: 'Checking transfer', nav: 'pay', html: `${h1('Checking transfer')}<p role="status">Asking the bank for the latest status…</p>` };
  if (!t) return { title: 'Transfer not found', nav: 'pay', html: `${h1('Transfer not found')}<p>The bank has no record of this transfer. It may have been cleared by Reset demo.</p><p><a href="#home">Go to Home</a></p>` };
  const copy = OUTCOME_COPY[t.state];
  const unresolved = t.state === 'pending' || t.state === 'unknown';
  const failureNote = {
    'insufficient-funds': ' The amount plus fee was more than your demo balance.',
    'not-received': ' The bank has no record of it, so the request never arrived.',
  }[t.failureReason] ?? '';
  let actions;
  if (unresolved) {
    actions = `<button type="button" class="button" data-action="check-status" ${state.ui.checking ? 'disabled' : ''}>${state.ui.checking ? 'Checking status…' : 'Check status'}</button>
      <a class="button button--secondary" href="#home">Go to Home</a>`;
  } else if (t.state === 'failed') {
    actions = `<button type="button" class="button" data-action="retry">Try again</button>
      <a class="button button--secondary" href="#home">Go to Home</a>`;
  } else {
    actions = `<a class="button" href="#home">Go to Home</a>
      <a class="button button--secondary" href="#activity">View activity</a>`;
  }
  return {
    title: copy.h,
    nav: 'pay',
    html: `<div class="outcome outcome--${t.state}">
        <p class="outcome__badge" aria-hidden="true">${esc(STATUS_LABEL[t.state])}</p>
        ${h1(copy.h)}
        <p class="lede">${copy.p(t)}${esc(failureNote)}</p>
      </div>
      ${state.ui.flash ? `<p class="warning" role="status">${esc(state.ui.flash)}</p>` : ''}
      <div class="actions">${actions}</div>
      <dl class="summary">
        ${row('Status', statusTag(t.state))}
        ${row('To', esc(t.payee.name))}
        ${row('Account', `${esc(bankName(t.payee.bankCode))}, ${accountEnding(t.payee.accountNumber)}`)}
        ${row('Amount', money(t.amountKobo))}
        ${row('Total debit', money(t.totalKobo))}
        ${row('Reference', t.reference ? dual(t.reference, spokenReference(t.reference)) : 'Not known yet')}
        ${state.bankData.account ? row('Demo balance now', money(state.bankData.account.balanceKobo)) : ''}
      </dl>`,
  };
}

export function cancelled() {
  return {
    title: 'Transfer cancelled',
    nav: 'pay',
    html: `${h1('Transfer cancelled')}
      <p class="lede">Nothing was sent. Your demo balance has not changed.</p>
      <div class="actions"><a class="button" href="#home">Go to Home</a></div>`,
  };
}

// ---------- Voice ----------

const voiceLogItem = (entry) =>
  `<li class="voice-log__item voice-log__item--${entry.who}"><span class="voice-log__who">${entry.who === 'you' ? 'You said:' : 'WAYMARK:'}</span> ${esc(entry.text)}${entry.via ? ` <span class="voice-log__via">(understood by ${entry.via === 'gemini' ? 'Gemini' : 'built-in rules'})</span>` : ''}</li>`;

export const voiceLogHtml = (log) =>
  log.length ? log.map(voiceLogItem).join('') : '<li class="muted">Nothing yet.</li>';

/**
 * The voice screen, and the first screen anyone sees. Almost the whole screen is one button:
 * tap anywhere to talk. WAYMARK speaks for itself, so no screen reader is needed; with
 * TalkBack on, a double-tap anywhere works the same way.
 */
export function talk(state) {
  const canListen = recognitionSupported();
  const status = !canListen
    ? 'This browser cannot listen. Use Chrome on Android, or type below.'
    : state.voice.status ?? TALK_STATUS.ready;
  return {
    title: 'Talk',
    nav: 'voice',
    focus: '#talk-btn',
    html: `<h1 id="page-title" tabindex="-1" class="talk-title">WAYMARK</h1>
      <button type="button" id="talk-btn" class="talk-target">
        <span class="talk-target__label">Tap anywhere to talk</span>
        <span class="talk-target__status" id="talk-status" aria-hidden="true">${esc(status)}</span>
      </button>
      <p class="talk-note">Demo only. No real money moves. ${AI_ENDPOINT ? 'Your words are sent to Google: Chrome turns speech into text, and Gemini works out what you meant. Your balance and saved payees stay on this phone.' : 'In Chrome, your speech is sent to Google to turn it into text.'}</p>
      <p><a href="${state.signedIn ? '#home' : '#start'}">Use the screens instead</a></p>
      <details class="talk-more">
        <summary>Conversation, and typing instead</summary>
        <ol class="voice-log" id="voice-log">${voiceLogHtml(state.voice.log)}</ol>
        <form data-form="talk-text" novalidate>
          ${textField({ id: 'talk-input', label: 'Type instead', required: false })}
          <button class="button button--secondary" type="submit">Send</button>
        </form>
      </details>`,
  };
}

// ---------- Help and settings ----------

export function help(state) {
  return {
    title: 'Help',
    nav: 'help',
    html: `${h1('Help')}
      <section aria-labelledby="h-demo"><h2 id="h-demo">About this demo</h2>
        <p>WAYMARK is a prototype. Every name, account and amount is invented, and no real money moves. ${state.signedIn ? '' : '<a href="#welcome">Back to the start</a>.'}</p></section>
      <section aria-labelledby="h-approve"><h2 id="h-approve">Approving payments</h2>
        <p>If you chose your fingerprint, one touch on the sensor approves a payment. Nothing is spoken or typed. If you chose a ${PIN}, your phone's keyboard may read keys aloud as you touch them, so use headphones. In this demo the phone confirms the fingerprint; a real bank would also check it on its own servers.</p></section>
      <section aria-labelledby="h-voice"><h2 id="h-voice">Talking to WAYMARK</h2>
        <p>WAYMARK starts by voice and speaks for itself, so you do not need a screen reader. Tap anywhere on the Talk screen and it speaks to you; after it finishes, a rising tone means it is listening and a falling tone means it has stopped. Tap at any time to interrupt. You can sign up, check your balance, hear recent activity and pay people by voice. ${esc(EXAMPLES)} Before sending, WAYMARK reads back who, how much and the fee; you send by tapping and touching your fingerprint sensor. Voice payments are limited to 50,000 naira. Say repeat to hear something again, or screens to use the screens. ${AI_ENDPOINT ? 'Your words are sent to Google: Chrome turns speech into text, and Gemini works out what you meant. Only the sentence is sent; your balance and saved payees stay on this phone. If Gemini cannot be reached, WAYMARK uses its built-in rules.' : 'In Chrome, your speech is sent to Google to turn it into text.'}</p></section>
      <section aria-labelledby="h-status"><h2 id="h-status">What each transfer status means</h2>
        <dl class="glossary">
          <dt>Completed</dt><dd>The money has gone. Your balance shows the debit once.</dd>
          <dt>Failed</dt><dd>The transfer did not happen. No money left your balance.</dd>
          <dt>Pending</dt><dd>The bank has not finished yet. Do not send it again. Use Check status.</dd>
          <dt>Outcome unknown</dt><dd>We lost contact before the bank answered. The money may or may not have gone. Do not send it again. Use Check status.</dd>
        </dl></section>
      <section aria-labelledby="h-pay"><h2 id="h-pay">Paying a new account safely</h2>
        <p>After you type an account number, WAYMARK tells you the account name before you pay. Use Spell name to hear it letter by letter. If the name looks like someone you have saved but the number is different, you will hear a warning.</p></section>
      <section aria-labelledby="h-back"><h2 id="h-back">Going back</h2>
        <p>Until you confirm, nothing is sent. Cancel transfer always tells you that nothing was sent.</p></section>
      <section aria-labelledby="h-vib"><h2 id="h-vib">Vibrations</h2>
        <p>On Android phones, the outcome screen vibrates: one short buzz for Completed, two long for Failed, three quick for Pending or Outcome unknown. iPhones do not allow websites to vibrate, so you will hear the heading only. Turn vibrations off in Settings.</p></section>
      <section aria-labelledby="h-support"><h2 id="h-support">Support</h2>
        <p>This prototype has no customer support line. For real banking help, contact your bank through its official channels.</p></section>`,
  };
}

export function settings(state) {
  const p = state.prefs;
  const sizes = [['standard', 'Standard'], ['large', 'Large'], ['xlarge', 'Extra large']];
  const supported = hapticsSupported();
  return {
    title: 'Settings',
    nav: 'settings',
    html: `${h1('Settings')}
      <p>Changes apply straight away and last for this session.</p>
      <form data-form="settings" novalidate>
        <fieldset class="field"><legend>Text size</legend>
          ${sizes.map(([v, l]) => `<div class="radio"><input type="radio" name="textSize" id="size-${v}" value="${v}"${p.textSize === v ? ' checked' : ''}><label for="size-${v}">${l}</label></div>`).join('')}
        </fieldset>
        <div class="check"><input type="checkbox" id="highContrast" name="highContrast"${p.highContrast ? ' checked' : ''}><label for="highContrast">High contrast</label></div>
        <div class="check"><input type="checkbox" id="reducedMotion" name="reducedMotion"${p.reducedMotion ? ' checked' : ''}><label for="reducedMotion">Reduce motion</label></div>
        <div class="check"><input type="checkbox" id="haptics" name="haptics" aria-describedby="haptics-hint"${p.haptics ? ' checked' : ''}><label for="haptics">Vibrate on transfer outcome</label>
          <p class="hint" id="haptics-hint">${supported ? 'A different vibration for each outcome. Never the only signal.' : 'This browser cannot vibrate, so this setting has no effect here.'}</p></div>
      </form>
      ${state.signedIn ? `<section aria-labelledby="reset-h" class="danger-zone"><h2 id="reset-h">Reset demo</h2>
        <p>Restores the starting balance and activity, removes fingerprint sign-in and your demo ${PIN}, and returns to the start.</p>
        ${state.ui.confirmReset
          ? `<p class="warning" id="reset-confirm" tabindex="-1">Are you sure? This cannot be undone.</p>
             <div class="actions actions--inline"><button type="button" class="button button--danger" data-action="reset-yes">Yes, reset demo</button>
             <button type="button" class="button button--secondary" data-action="reset-no">Keep my demo</button></div>`
          : '<button type="button" class="button button--secondary" data-action="reset-ask">Reset demo</button>'}
      </section>` : ''}`,
  };
}
