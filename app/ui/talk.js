// Drives a spoken conversation with the assistant: speak, then listen, then speak again,
// with no swiping and no screen reader needed. One tap anywhere starts, interrupts,
// or (when asked) starts a voice check: WAYMARK says some numbers, then records them being said.
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
  tap: 'Tap anywhere, then say the numbers',
  recording: 'Recording… say the numbers now',
  checking: 'Checking your voice…',
};

/**
 * deps: { assistant: () => assistant, speak(text) -> Promise, stopSpeaking(), startListening() -> { done, abort },
 *         record() -> { done, abort }, tone(kind), vibrate(ms), log(who, text), status(text) }
 */
export function createTalkDriver(deps) {
  let generation = 0;
  let listening = null;
  let recording = null;

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

  /** Record a clip for the voice check (no speech-to-text in the browser: the server checks it). */
  async function record(g) {
    if (!current(g)) return;
    deps.status(TALK_STATUS.recording);
    deps.tone('start');
    deps.vibrate(40);
    recording = deps.record();
    const clip = await recording.done;
    recording = null;
    if (!current(g) || clip.reason === 'aborted') return;
    deps.tone(clip.ok ? 'stop' : 'error');
    if (clip.ok) deps.log('you', '(voice sample recorded)');
    deps.status(TALK_STATUS.checking);
    await run(await deps.assistant().recorded(clip), g);
  }

  async function run(result, g, { autoListen = true } = {}) {
    if (!current(g)) return;
    if (!result) { if (autoListen) await listen(g); else rest(); return; }
    await say(result.say);
    if (!current(g)) return;
    if (result.then === 'record') { await record(g); return; }
    if (result.then === 'listen' && autoListen) { await listen(g); return; }
    rest();
  }

  /** Stop whatever is happening (speech or listening) and start a new turn. */
  function interrupt() {
    generation += 1;
    deps.stopSpeaking();
    listening?.abort();
    listening = null;
    recording?.abort();
    recording = null;
    return generation;
  }

  return {
    /** A tap anywhere on the Talk screen. Called straight from the click, so audio can start. */
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
