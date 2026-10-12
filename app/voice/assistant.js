// The voice assistant: WAYMARK from the first moment to the last, by talking.
// It speaks for itself, so no screen reader is needed. It covers sign-up (phone number, code,
// fingerprint), sign-in, balance, activity, paying, and status checks.
//
// Rules that keep money safe:
// - Understanding what was said only produces a request (interpreter + dialog.js).
// - What is read back before paying is built here from the bank's own figures, never by an AI.
// - Sending always needs a tap and a fingerprint. "Yes" alone never sends money.
//
// Each method returns { say, then } where then is 'listen' (listen for the next thing) or
// 'idle' (wait for a tap). The UI driver does the speaking and listening.

import { respond, afterLookup, newDialog, EXAMPLES } from './dialog.js';
import { normalise } from './intent.js';
import { validatePhone } from '../domain/validation.js';
import { spokenNaira, spokenReference, spokenAccountEnding } from '../domain/spoken.js';
import { STATES, createTransfer, transition, isUnresolved } from '../domain/transfer.js';
import { findLookalike } from '../domain/directory.js';
import { DEMO_OTP } from '../data/seed.js';

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
 *   biometric          { available: boolean, register(), verify(credentialId) }
 *   credential         { get(), save(id) }
 *   session            { signedIn(), authMethod(), signIn(method), refresh(), context() }
 *   transfers          { send(processingAttempt), check(attempt) }
 *   progress(text)     speak a short "working on it" line straight away (async)
 *   switchToScreens()  leave voice for the screens
 *   openReview(payee, amountKobo)  hand a payment to the Review screen (pin users)
 */
export function createAssistant(deps) {
  const s = {
    phase: 'start',
    dialog: newDialog(),
    pending: null, // transfer waiting for a fingerprint
    lastAttempt: null,
    lastSay: '',
    silences: 0,
    phone: null,
  };

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

  // ---------- start ----------

  async function begin() {
    if (s.phase !== 'start') return null;
    if (deps.session.signedIn()) return remember(await ready('WAYMARK here.'));
    if (deps.credential.get() && deps.biometric.available) {
      s.phase = 'signin-tap';
      return remember(say('Welcome back to WAYMARK. To sign in, tap anywhere on the screen, then confirm with your phone lock: fingerprint, face or PIN.'));
    }
    s.phase = 'phone';
    return remember(say(
      'Welcome to WAYMARK, banking you can do by voice. This is a demo, so no real money moves. '
      + 'Your phone may ask to use the microphone; please allow it. '
      + "Let's set you up. Say your mobile number."));
  }

  // ---------- sign-up by voice ----------

  function hearPhone(text) {
    const digits = extractDigits(text);
    const checked = validatePhone(digits);
    if (!checked.ok) {
      return say(digits
        ? `I heard ${spellDigits(digits)}. That is not a Nigerian mobile number. Please say all 11 digits, for example 0 8 0 3, 1 2 3, 4 5 6 7.`
        : 'Please say your mobile number, for example 0 8 0 3, 1 2 3, 4 5 6 7.');
    }
    s.phone = checked.number;
    s.phase = 'code';
    return say(`Thank you. A real bank would now text a code to your number ending ${spellDigits(s.phone.slice(-4))}. In this demo, the code is ${spellDigits(DEMO_OTP)}. Please say the code.`);
  }

  function hearCode(text) {
    const digits = extractDigits(text);
    if (digits !== DEMO_OTP) {
      return say(`I heard ${digits ? spellDigits(digits) : 'nothing I could use'}. The demo code is ${spellDigits(DEMO_OTP)}. Please say it again.`);
    }
    if (deps.biometric.available) {
      s.phase = 'secure-tap';
      return say("That's right. Now let's protect your payments with your phone lock, so you never have to say a pin out loud. Tap anywhere on the screen, then confirm with your phone lock: fingerprint, face or PIN.");
    }
    s.phase = 'no-fingerprint';
    return say("That's right. This phone has no screen lock WAYMARK can use, and payments need one to be safe by voice. Say screens to finish setting up with a pin on the screens.");
  }

  // ---------- paying ----------

  async function prepareReview(payee, amountKobo) {
    if (deps.session.authMethod() !== 'biometric') {
      deps.openReview(payee, amountKobo);
      s.phase = 'ready';
      return say(`Opening the review screen to send ${spokenNaira(amountKobo)} to ${payee.name}. Enter your pin there to send it.`, 'idle');
    }
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
    s.phase = 'confirm-tap';
    return say(`Send ${spokenNaira(quote.amountKobo)} to ${payee.name}, ${bankName(payee.bankCode)}, ${spokenAccountEnding(payee.accountNumber)}. `
      + `The fee is ${spokenNaira(quote.feeKobo)}, so ${spokenNaira(quote.totalKobo)} in total. `
      + "To send it, tap anywhere on the screen, then confirm with your phone lock: fingerprint, face or PIN. To stop, say cancel.");
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
    if (!t) return remember(say("I didn't catch that. Please say it again."));
    if (is.repeat(t) && s.lastSay) return say(s.lastSay, s.phase === 'idle' ? 'idle' : 'listen');
    if (is.screens(t)) {
      deps.switchToScreens();
      return remember(say('Switching to the screens.', 'idle'));
    }

    switch (s.phase) {
      case 'start':
        return remember(await begin());
      case 'phone':
        return remember(hearPhone(rawText));
      case 'code':
        return remember(hearCode(rawText));
      case 'secure-tap':
      case 'signin-tap':
        return remember(say("Tap anywhere on the screen, then confirm with your phone lock: fingerprint, face or PIN. If you keep having trouble, say screens."));
      case 'no-fingerprint':
        return remember(say('Say screens to finish setting up on the screens.'));
      case 'confirm-tap':
        if (is.cancel(t)) {
          s.pending = transition(s.pending, STATES.CANCELLED);
          s.pending = null;
          s.phase = 'ready';
          return remember(say('Cancelled. Nothing was sent. What else would you like to do?'));
        }
        return remember(say("To send it, tap anywhere on the screen, then confirm with your phone lock: fingerprint, face or PIN. To stop, say cancel."));
      default:
        break;
    }

    // Signed in: ready or idle.
    s.phase = 'ready';
    if (is.stop(t)) { s.phase = 'idle'; return remember(say('Okay. Tap anywhere when you need me.', 'idle')); }
    if (is.status(t)) return remember(await checkStatus());
    if (is.help(t)) return remember(say(EXAMPLES));
    return remember(await banking(rawText));
  }

  async function tapped() {
    switch (s.phase) {
      case 'secure-tap': {
        const reg = await deps.biometric.register();
        if (!reg.ok) return remember(say("That didn't work. Tap anywhere on the screen, then confirm with your phone lock: fingerprint, face or PIN. If you keep having trouble, say screens."));
        deps.credential.save(reg.credentialId);
        await deps.session.signIn('biometric');
        const ctx = deps.session.context();
        return remember(await ready(`You're all set. Your demo balance is ${spokenNaira(ctx.balanceKobo)}. You can say things like: what is my balance, or send 5,000 naira to Musa.`));
      }
      case 'signin-tap': {
        const v = await deps.biometric.verify(deps.credential.get());
        if (!v.ok) return remember(say("That didn't work. Tap anywhere on the screen, then confirm with your phone lock: fingerprint, face or PIN."));
        await deps.session.signIn('biometric');
        return remember(await ready("You're signed in."));
      }
      case 'confirm-tap': {
        const v = await deps.biometric.verify(deps.credential.get());
        if (!v.ok) return remember(say('Not confirmed. Nothing was sent. Tap anywhere to try again, or say cancel.'));
        await deps.progress('Sending.');
        const processing = transition(s.pending, STATES.PROCESSING);
        s.pending = null;
        const result = await deps.transfers.send(processing);
        s.lastAttempt = result;
        s.phase = 'ready';
        await deps.session.refresh();
        return remember(say(`${outcomeSpeech(result, deps.session.context().balanceKobo)} What else would you like to do?`));
      }
      default:
        return null; // nothing waiting for a tap: the driver just listens
    }
  }

  /** Nothing was heard. In tap phases, wait quietly; otherwise prompt once, then rest. */
  function silence() {
    if (['secure-tap', 'signin-tap', 'confirm-tap'].includes(s.phase)) return say('', 'idle');
    s.silences += 1;
    if (s.silences >= 2) {
      if (s.phase === 'ready') s.phase = 'idle';
      return say('I will wait. Tap anywhere when you need me.', 'idle');
    }
    return say("I didn't hear anything. Please say that again.");
  }

  return {
    begin: async () => remember(await begin()),
    hear,
    tapped,
    silence,
    wantsTap: () => ['secure-tap', 'signin-tap', 'confirm-tap'].includes(s.phase),
    started: () => s.phase !== 'start',
    get phase() { return s.phase; },
  };
}
