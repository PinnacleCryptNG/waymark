// Drives a spoken conversation with the assistant: speak, then listen, then speak again,
// with no swiping and no screen reader needed. One tap anywhere starts, interrupts,
// or (when asked) approves with a fingerprint.
//
// Turn-taking: WAYMARK never listens while it is talking, so it does not hear itself.
// A tap always wins: it stops speech or listening at once and moves on.

import { RECOGNITION_MESSAGES } from '../voice/speech.js';

export const TALK_STATUS = {
  ready: 'Tap anywhere and WAYMARK will speak to you',
  idle: 'Ready when you are',
  listening: 'Listening… speak now',
  speaking: 'Speaking. Tap to interrupt.',
  working: 'One moment…',
  tap: 'Tap anywhere, then touch your fingerprint sensor',
};

/**
 * deps: { assistant: () => assistant, speak(text) -> Promise, stopSpeaking(), startListening() -> { done, abort },
 *         tone(kind), vibrate(ms), log(who, text), status(text) }
 */
export function createTalkDriver(deps) {
  let generation = 0;
  let listening = null;

  const current = (g) => g === generation;

  function rest() {
    deps.status(deps.assistant().wantsTap() ? TALK_STATUS.tap : TALK_STATUS.idle);
  }

  async function say(text) {
    if (!text) return;
    deps.log('waymark', text);
    deps.status(TALK_STATUS.speaking);
    await deps.speak(text);
  }

  async function listen(g) {
    if (!current(g)) return;
    deps.status(TALK_STATUS.listening);
    deps.tone('start');
    deps.vibrate(40);
    listening = deps.startListening();
    const heard = await listening.done;
    listening = null;
    if (!current(g) || heard.reason === 'aborted') return;
    deps.tone(heard.ok ? 'stop' : 'error');
    const a = deps.assistant();
    if (heard.ok) {
      deps.log('you', heard.transcript);
      deps.status(TALK_STATUS.working);
      await run(await a.hear(heard.transcript), g);
      return;
    }
    if (heard.reason === 'no-speech') { await run(a.silence(), g); return; }
    await run({ say: RECOGNITION_MESSAGES[heard.reason] ?? "Sorry, I couldn't listen just now. Tap anywhere to try again.", then: 'idle' }, g);
  }

  async function run(result, g, { autoListen = true } = {}) {
    if (!current(g)) return;
    if (!result) { if (autoListen) await listen(g); else rest(); return; }
    await say(result.say);
    if (!current(g)) return;
    if (result.then === 'listen' && autoListen) { await listen(g); return; }
    rest();
  }

  /** Stop whatever is happening (speech or listening) and start a new turn. */
  function interrupt() {
    generation += 1;
    deps.stopSpeaking();
    listening?.abort();
    listening = null;
    return generation;
  }

  return {
    /** A tap anywhere on the Talk screen. Must be called straight from the click (fingerprint needs it). */
    async tap() {
      const g = interrupt();
      const a = deps.assistant();
      if (!a.started()) { deps.status(TALK_STATUS.working); await run(await a.begin(), g); return; }
      if (a.wantsTap()) { deps.status(TALK_STATUS.working); await run(await a.tapped(), g); return; }
      await listen(g);
    },

    /** A typed command: same conversation, but no automatic listening afterwards. */
    async typed(text) {
      const g = interrupt();
      const a = deps.assistant();
      if (!a.started()) await run(await a.begin(), g, { autoListen: false });
      if (!current(g)) return;
      deps.log('you', text);
      await run(await a.hear(text), g, { autoListen: false });
    },

    /** Speak a short "working on it" line straight away, e.g. "Sending." */
    progress: (text) => say(text),

    /** Leave the conversation (for example when switching to the screens). */
    stop() {
      interrupt();
      deps.status(TALK_STATUS.idle);
    },
  };
}
