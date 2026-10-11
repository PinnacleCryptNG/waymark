// Listening and speaking. WAYMARK speaks for itself, so a screen reader is not required.
// Every state has a non-visual signal: a tone when listening starts and stops, a short
// vibration, and spoken replies.
//
// Privacy: in Chrome, the browser's speech recognition sends audio to Google. Say so in Help.

export const recognitionSupported = () =>
  typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

export const speechOutputSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/**
 * Start listening for one command. Returns { done, abort } where done resolves to
 * { ok: true, transcript } or { ok: false, reason } ('no-speech', 'not-allowed', 'network',
 * 'unsupported', 'aborted' or another browser code). Gives up after `timeoutMs`.
 */
export function startListening({ lang = 'en-NG', timeoutMs = 12000 } = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return { done: Promise.resolve({ ok: false, reason: 'unsupported' }), abort() {} };
  let r;
  let finish;
  const done = new Promise((resolve) => {
    let settled = false;
    let timer;
    finish = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    r = new Recognition();
    // Never leave the user stuck on "Listening": give up after a while and say so.
    timer = setTimeout(() => { try { r.abort(); } catch { /* already stopped */ } finish({ ok: false, reason: 'no-speech' }); }, timeoutMs);
    r.lang = lang;
    r.interimResults = false;
    r.continuous = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => finish({ ok: true, transcript: e.results[0][0].transcript });
    r.onerror = (e) => finish({ ok: false, reason: e.error || 'error' });
    r.onend = () => finish({ ok: false, reason: 'no-speech' });
    try { r.start(); } catch { finish({ ok: false, reason: 'error' }); }
  });
  return {
    done,
    abort() {
      finish({ ok: false, reason: 'aborted' });
      try { r.abort(); } catch { /* already stopped */ }
    },
  };
}

export const listenOnce = (opts) => startListening(opts).done;

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'en-NG')
    ?? voices.find((v) => v.lang === 'en-GB')
    ?? voices.find((v) => v.lang?.startsWith('en'))
    ?? null;
}

/**
 * Speak with the phone's own voice. Resolves when finished or cancelled, so the app never
 * listens while it is still talking (it would hear itself).
 */
export function speak(text) {
  if (!text || !speechOutputSupported()) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const end = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
    // Safety net: some browsers never fire 'end'. Allow roughly normal speaking speed.
    const timer = setTimeout(end, 2000 + text.length * 90);
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) u.voice = voice;
      u.lang = voice?.lang ?? 'en-NG';
      u.rate = 1;
      u.onend = end;
      u.onerror = end;
      window.speechSynthesis.speak(u);
    } catch {
      end();
    }
  });
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* nothing to stop */ }
}

/** Kept for the screen-reader path: speak without waiting. */
export function speakAloud(text) {
  stopSpeaking();
  speak(text);
}

let audio;
/** Short tones: 'start' rises (now listening), 'stop' falls (finished listening), 'error' is low. */
export function tone(kind) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const [from, to, ms] = { start: [660, 990, 140], stop: [990, 660, 140], error: [260, 200, 260] }[kind];
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const t = audio.currentTime;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.linearRampToValueAtTime(to, t + ms / 1000);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + ms / 1000);
  } catch { /* no audio: spoken replies still work */ }
}

export const RECOGNITION_MESSAGES = {
  'no-speech': "I didn't hear anything. Tap anywhere and speak after the tone.",
  'not-allowed': 'The microphone is blocked for this website. In Chrome, open the menu, then Site settings, then Microphone, and allow it.',
  'service-not-allowed': 'The microphone is blocked for this website. In Chrome, open the menu, then Site settings, then Microphone, and allow it.',
  network: 'Voice needs an internet connection in this browser. Check your connection and tap anywhere to try again.',
  unsupported: 'This browser cannot listen. Please use Chrome on Android.',
};
