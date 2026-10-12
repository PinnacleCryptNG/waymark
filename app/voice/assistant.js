// The voice assistant: WAYMARK from the first moment to the last, by talking.
// It speaks for itself, so no screen reader is needed. It covers sign-up (phone number, then
// learning the person's voice), voice sign-in, balance, activity, paying, and status checks.
//
// Rules that keep money safe:
// - Understanding what was said only produces a request (interpreter + dialog.js).
// - What is read back before paying is built here from the bank's own figures, never by an AI.
// - Sending always needs a tap and a voice check: the server picks random digits, the person
//   says them, and the server checks it is their voice. "Yes" alone never sends money.
//
// Each method returns { say, then } where then is 'listen' (listen for words), 'record' (record a
// voice clip for the voice check) or 'idle' (wait for a tap). The UI driver does the rest.

import { respond, afterLookup, newDialog, EXAMPLES } from './dialog.js';
import { normalise } from './intent.js';
import { validatePhone } from '../domain/validation.js';
import { spokenNaira, spokenReference, spokenAccountEnding } from '../domain/spoken.js';
import { STATES, createTransfer, transition, isUnresolved } from '../domain/transfer.js';
import { findLookalike } from '../domain/directory.js';

const DIGIT_WORDS = { zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };

/** All digits said, in order: "0803 123 4567", "zero eight zero three…", "double five" -> "55". */
export function extractDigits(text) {
  const tokens = normalise(text).split(' ');
  let out = '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const repeat = t === 'double' ? 2 : t === 'triple' ? 3 : 0;
    if (repeat && tokens[i + 1] in DIGIT_WORDS) { out += DIGIT_WORDS[tokens[++i]].repeat(repeat); continue; }
    if (repeat && /^\d$/.test(tokens[i + 1] ?? '')) { out += tokens[++i].repeat(repeat); continue; }
    if (/^\d+$/.test(t)) out += t;
    else if (t in DIGIT_WORDS) out += DIGIT_WORDS[t];
  }
  return out;
}

const say = (text, then = 'listen') => ({ say: text, then });
const spellDigits = (digits) => digits.split('').join(' ');

const is = {
  repeat: (t) => /\b(repeat|say (that|it) again|what did you say|pardon|come again)\b/.test(t),
  stop: (t) => /^(stop|goodbye|bye|that s all|thats all|nothing|no thanks|i m done|im done)\b/.test(t),
  screens: (t) => /\b(screens?|switch to screen|use the screen)\b/.test(t),
  cancel: (t) => /^(no|cancel|stop|don t|dont|wrong)\b/.test(t),
  status: (t) => /\b(check status|status|did it go|did it work|has it gone)\b/.test(t),
  help: (t) => /\b(help|what can (you|i) (do|say))\b/.test(t),
};

/**
 * deps:
 *   interpreter        { interpret(text, ctx) }
 *   bank               the bank boundary (lookupName, quoteTransfer)
 *   banks              list of { code, name }
 *   auth               voice-auth.js: { savedPhone(), start(phone), challenge(body), enroll(id, audio),
 *                      login(id, audio), approve(id, audio), forget() }
 *   canRecord          boolean: this browser can record a voice clip
 *   session            { signedIn(), signIn(), refresh(), context() }
 *   transfers          { send(processingAttempt), check(attempt) }
 *   progress(text)     speak a short "working on it" line straight away (async)
 *   switchToScreens()  leave voice for the screens
 */
export function createAssistant(deps) {
  const s = {
    phase: 'start',
    dialog: newDialog(),
    pending: null, // transfer waiting for a voice check
    lastAttempt: null,
    lastSay: '',
    silences: 0,
    phone: null,
    challenge: null, // { challengeId, digits } waiting to be said
    quietClips: 0, // recordings in a row with no speech; after two, wait for a tap
  };

  const RECORD_PHASES = ['enroll-record', 'login-record', 'approve-record'];
  const TAP_PHASES = ['confirm', ...RECORD_PHASES];
  const spokenDigits = (digits) => digits.split('').join(', ');
  const sayDigits = () => `After the tone, say: ${spokenDigits(s.challenge.digits)}.`;
  const record = (text) => ({ say: text, then: 'record' });
  const offline = () => say('I could not reach WAYMARK. Please check your internet connection, then tap anywhere to try again.', 'idle');

  const bankName = (code) => deps.banks.find((b) => b.code === code)?.name ?? 'that bank';
  const remember = (r) => { if (r?.say) s.lastSay = r.say; s.silences = 0; return r; };

  function outcomeSpeech(a, balanceKobo) {
    switch (a.state) {
      case STATES.COMPLETED:
        return `Done. ${spokenNaira(a.amountKobo)} sent to ${a.payee.name}. ${spokenReference(a.reference)}. Your balance is now ${spokenNaira(balanceKobo)}.`;
      case STATES.FAILED: {
        const why = a.failureReason === 'insufficient-funds' ? ' The amount and fee were more than your balance.'
          : a.failureReason === 'not-received' ? ' The bank never received it.' : '';
        return `The transfer failed. No money left your balance.${why}`;
      }
      case STATES.PENDING:
        return 'The bank is still working on it. Do not send it again. Say check status in a little while.';
      case STATES.UNKNOWN:
        return 'I could not confirm whether it went through. It may already have gone. Do not send it again. Say check status.';
      default:
        return '';
    }
  }

  async function ready(intro) {
    s.phase = 'ready';
    return say(`${intro} What would you like to do?`);
  }

  function askPhone(intro) {
    s.phase = 'phone';
    return say(`${intro}Say your mobile number.`);
  }

  // ---------- start ----------

  async function begin() {
    if (s.phase !== 'start') return null;
    if (deps.session.signedIn()) return ready('WAYMARK here.');
    if (!deps.canRecord) {
      s.phase = 'no-mic';
      return say('Welcome to WAYMARK. WAYMARK keeps your account safe with your voice, but this browser cannot record it. Please open WAYMARK in Chrome or Safari.', 'idle');
    }
    const saved = deps.auth.savedPhone();
    if (saved) {
      s.phone = saved;
      return askLogin('Welcome back to WAYMARK. To sign in, I will check your voice.');
    }
    return askPhone('Welcome to WAYMARK, banking you can do by voice. This is a demo, so no real money moves. '
      + 'Your phone may ask to use the microphone; please allow it. '
      + "Let's set you up. ");
  }

  // ---------- sign-up and sign-in by voice ----------

  async function hearPhone(text) {
    const digits = extractDigits(text);
    const checked = validatePhone(digits);
    if (!checked.ok) {
      return say(digits
        ? `I heard ${spellDigits(digits)}. That is not a Nigerian mobile number. Please say all 11 digits, for example 0 8 0 3, 1 2 3, 4 5 6 7.`
        : 'Please say your mobile number, for example 0 8 0 3, 1 2 3, 4 5 6 7.');
    }
    let r;
    try {
      r = await deps.auth.start(checked.number);
    } catch {
      return offline();
    }
    if (!r.ok) return say('That number did not work. Please say your mobile number again.');
    s.phone = r.phone;
    if (r.status === 'active') {
      return askLogin(`The number ending ${spellDigits(s.phone.slice(-4))} already has a WAYMARK account. To sign in, I will check your voice.`);
    }
    return askEnroll(`Thank you. Your number ending ${spellDigits(s.phone.slice(-4))} is set up. `
      + 'Now WAYMARK will learn your voice, so only you can get into this account and approve payments. '
      + 'I will give you five numbers to say, three times. Speak clearly in your normal voice. First one.');
  }

  async function askEnroll(intro) {
    let ch;
    try {
      ch = await deps.auth.challenge({ phone: s.phone, purpose: 'enroll' });
    } catch {
      return offline();
    }
    if (!ch.ok) return askPhone('Something went wrong setting up your voice. Let us start again. ');
    s.challenge = ch;
    s.phase = 'enroll-record';
    return record(`${intro} ${sayDigits()}`);
  }

  async function askLogin(intro) {
    let ch;
    try {
      ch = await deps.auth.challenge({ phone: s.phone, purpose: 'login' });
    } catch {
      return offline();
    }
    if (!ch.ok && ch.code === 'locked') {
      s.phase = 'locked';
      return say('This account is locked for 15 minutes after too many voice checks that did not match. Please try again later.', 'idle');
    }
    if (!ch.ok) {
      deps.auth.forget();
      return askPhone('I could not find your account. ');
    }
    s.challenge = ch;
    s.phase = 'login-record';
    return record(`${intro} ${sayDigits()}`);
  }

  const heardDigits = (r) => (r.heard ? `I heard ${spokenDigits(r.heard)}.` : 'I did not hear the numbers.');

  async function enrolled(audio) {
    const r = await deps.auth.enroll(s.challenge.challengeId, audio);
    if (r.ok && r.done) {
      await deps.session.signIn();
      const ctx = deps.session.context();
      return ready(`Your voice is saved. From now on, you sign in and approve payments by saying numbers like these. Your demo balance is ${spokenNaira(ctx.balanceKobo)}. You can say things like: what is my balance, or send 5,000 naira to Musa.`);
    }
    if (r.ok) return askEnroll(`Got it. ${r.samplesNeeded - r.samples === 1 ? 'One more' : 'Two more'}.`);
    const why = {
      'wrong-digits': `${heardDigits(r)} Let's try that again.`,
      'different-voice': 'That sounded like a different voice from before. Please say it yourself, somewhere quiet.',
      expired: 'That took a little too long. Here are new numbers.',
    }[r.code] ?? 'I could not hear that clearly. Please try again somewhere quiet.';
    return askEnroll(why);
  }

  async function loggedIn(audio) {
    const r = await deps.auth.login(s.challenge.challengeId, audio);
    if (r.ok) {
      await deps.session.signIn();
      return ready("Thank you, that's your voice. You're signed in.");
    }
    const why = {
      'wrong-digits': `${heardDigits(r)} Let's try again.`,
      'voice-mismatch': 'That voice did not match this account. Please try again, speaking clearly in your normal voice.',
      expired: 'That took a little too long. Here are new numbers.',
    }[r.code] ?? 'I could not hear that clearly. Please try again somewhere quiet.';
    return askLogin(why);
  }

  // ---------- paying ----------

  async function prepareReview(payee, amountKobo) {
    let quote;
    try {
      quote = await deps.bank.quoteTransfer({ amountKobo });
    } catch {
      return say('I could not reach the bank. Please try again.');
    }
    if (!quote.ok) {
      return say(quote.code === 'insufficient-funds'
        ? `That is more than your balance of ${spokenNaira(quote.balanceKobo)}, including the fee. Say a smaller amount.`
        : 'That amount did not work. Please say it again.');
    }
    const draft = createTransfer({ payee, amountKobo: quote.amountKobo, feeKobo: quote.feeKobo });
    s.pending = transition(draft, STATES.REVIEW);
    s.phase = 'confirm';
    return say(`Send ${spokenNaira(quote.amountKobo)} to ${payee.name}, ${bankName(payee.bankCode)}, ${spokenAccountEnding(payee.accountNumber)}. `
      + `The fee is ${spokenNaira(quote.feeKobo)}, so ${spokenNaira(quote.totalKobo)} in total. `
      + 'To send it, tap anywhere on the screen and say the numbers I give you. To stop, say cancel.');
  }

  async function askApproval(intro = '') {
    const p = s.pending;
    let ch;
    try {
      ch = await deps.auth.challenge({ purpose: 'approve', idempotencyKey: p.operationId, payee: p.payee, amountKobo: p.amountKobo });
    } catch {
      return say('I could not reach WAYMARK. Nothing was sent. Tap anywhere to try again, or say cancel.', 'idle');
    }
    if (!ch.ok) return say('Something went wrong. Nothing was sent. Tap anywhere to try again, or say cancel.', 'idle');
    s.challenge = ch;
    s.phase = 'approve-record';
    return record(`${intro}${sayDigits()}`);
  }

  async function approved(audio) {
    const r = await deps.auth.approve(s.challenge.challengeId, audio);
    if (!r.ok) {
      s.phase = 'confirm';
      const why = r.code === 'wrong-digits' ? heardDigits(r)
        : r.code === 'voice-mismatch' ? 'That voice did not match this account.' : 'I could not check your voice.';
      return say(`${why} Nothing was sent. Tap anywhere to try again, or say cancel.`, 'idle');
    }
    await deps.progress('Voice confirmed. Sending.');
    const processing = { ...transition(s.pending, STATES.PROCESSING), approvalToken: r.approvalToken };
    s.pending = null;
    const result = await deps.transfers.send(processing);
    s.lastAttempt = result;
    s.phase = 'ready';
    await deps.session.refresh();
    return say(`${outcomeSpeech(result, deps.session.context().balanceKobo)} What else would you like to do?`);
  }

  async function banking(text) {
    const ctx = deps.session.context();
    const intent = await deps.interpreter.interpret(text, ctx);
    let r = respond(s.dialog, intent, ctx);
    s.dialog = r.dialog;
    if (r.action?.type === 'lookup') {
      await deps.progress('Looking up the account.');
      const { accountNumber, bankCode, amountKobo } = r.action;
      let found;
      try {
        found = await deps.bank.lookupName({ bankCode, accountNumber });
      } catch {
        return say('I could not reach the bank. Please try again.');
      }
      const lookalike = found.ok ? findLookalike(ctx.beneficiaries, found) : null;
      r = afterLookup(found, lookalike, amountKobo, ctx);
      s.dialog = r.dialog;
    }
    if (r.action?.type === 'review') return prepareReview(r.action.payee, r.action.amountKobo);
    return say(r.reply);
  }

  async function checkStatus() {
    const a = s.lastAttempt;
    if (!a) return say('There is no transfer to check. What would you like to do?');
    if (!isUnresolved(a.state)) return say(`${outcomeSpeech(a, deps.session.context().balanceKobo)} What else would you like to do?`);
    await deps.progress('Checking with the bank.');
    const updated = await deps.transfers.check(a);
    s.lastAttempt = updated;
    await deps.session.refresh();
    if (updated === a) return say('I still could not reach the bank. Do not send it again. Say check status in a little while.');
    return say(`${outcomeSpeech(updated, deps.session.context().balanceKobo)} What else would you like to do?`);
  }

  // ---------- public ----------

  async function hear(rawText) {
    const t = normalise(rawText);
    s.silences = 0;
    if (!t) return say("I didn't catch that. Please say it again.");
    if (is.repeat(t) && s.lastSay) return { say: s.lastSay, then: RECORD_PHASES.includes(s.phase) ? 'record' : s.phase === 'idle' ? 'idle' : 'listen' };
    if (is.screens(t)) {
      deps.switchToScreens();
      return say('Switching to the screens.', 'idle');
    }

    switch (s.phase) {
      case 'start':
        return begin();
      case 'phone':
        return hearPhone(rawText);
      case 'no-mic':
      case 'locked':
        return say(s.lastSay, 'idle');
      case 'enroll-record':
      case 'login-record':
      case 'approve-record':
        return say(`Please say the numbers out loud: ${spokenDigits(s.challenge.digits)}. Tap anywhere when you are ready.`, 'idle');
      case 'confirm':
        if (is.cancel(t)) {
          s.pending = transition(s.pending, STATES.CANCELLED);
          s.pending = null;
          s.phase = 'ready';
          return say('Cancelled. Nothing was sent. What else would you like to do?');
        }
        return say('To send it, tap anywhere on the screen and say the numbers I give you. To stop, say cancel.');
      default:
        break;
    }

    // Signed in: ready or idle.
    s.phase = 'ready';
    if (is.stop(t)) { s.phase = 'idle'; return say('Okay. Tap anywhere when you need me.', 'idle'); }
    if (is.status(t)) return checkStatus();
    if (is.help(t)) return say(EXAMPLES);
    return banking(rawText);
  }

  /** A tap. While waiting to approve, it starts the voice check; in a recording step, it records again. */
  async function tapped() {
    if (s.phase === 'confirm') return askApproval();
    if (RECORD_PHASES.includes(s.phase)) return record(sayDigits());
    return null; // nothing waiting for a tap: the driver just listens
  }

  /** A voice clip came back from the recorder: { ok, audio } or { ok: false, reason }. */
  async function recorded(clip) {
    if (!RECORD_PHASES.includes(s.phase)) return null;
    if (!clip.ok) {
      if (clip.reason === 'not-allowed') return say('WAYMARK needs the microphone to check your voice. Please allow the microphone for this site, then tap anywhere.', 'idle');
      if (clip.reason === 'no-speech') {
        s.quietClips += 1;
        if (s.quietClips >= 2) { s.quietClips = 0; return say(`I still didn't hear you. Tap anywhere when you are ready, then say: ${spokenDigits(s.challenge.digits)}.`, 'idle'); }
        return record(`I didn't hear you. ${sayDigits()}`);
      }
      return say('I could not use the microphone just now. Tap anywhere to try again.', 'idle');
    }
    s.quietClips = 0;
    await deps.progress('Checking your voice.');
    try {
      if (s.phase === 'enroll-record') return await enrolled(clip.audio);
      if (s.phase === 'login-record') return await loggedIn(clip.audio);
      return await approved(clip.audio);
    } catch {
      if (s.phase === 'approve-record') { s.phase = 'confirm'; return say('I could not reach WAYMARK. Nothing was sent. Tap anywhere to try again, or say cancel.', 'idle'); }
      return say('I could not reach WAYMARK. Please check your internet connection, then tap anywhere to try again.', 'idle');
    }
  }

  /** Nothing was heard. In tap phases, wait quietly; otherwise prompt once, then rest. */
  function silence() {
    if (TAP_PHASES.includes(s.phase)) return say('', 'idle');
    s.silences += 1;
    if (s.silences >= 2) {
      if (s.phase === 'ready') s.phase = 'idle';
      return say('I will wait. Tap anywhere when you need me.', 'idle');
    }
    return say("I didn't hear anything. Please say that again.");
  }

  return {
    begin: async () => remember(await begin()),
    hear: async (text) => remember(await hear(text)),
    tapped: async () => remember(await tapped()),
    recorded: async (clip) => remember(await recorded(clip)),
    silence: () => { const r = silence(); if (r.say) s.lastSay = r.say; return r; },
    wantsTap: () => TAP_PHASES.includes(s.phase),
    started: () => s.phase !== 'start',
    get phase() { return s.phase; },
  };
}
