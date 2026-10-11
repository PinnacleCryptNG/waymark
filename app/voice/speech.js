// Listening and speaking. Everything here has a non-visual signal: a tone when listening
// starts and stops, a short vibration, and replies announced to the screen reader.
//
// Privacy: in Chrome, the browser's speech recognition sends audio to Google. Say so in Help.

export const recognitionSupported = () =>
  typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

/**
 * Listen for one command. Resolves { ok: true, transcript } or { ok: false, reason }
 * where reason is 'no-speech', 'not-allowed', 'network', 'unsupported' or another browser code.
 */
export function listenOnce({ lang = 'en-NG', timeoutMs = 12000 } = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return Promise.resolve({ ok: false, reason: 'unsupported' });
  return new Promise((resolve) => {
    const r = new Recognition();
    let done = false;
    let timer;
    const finish = (value) => { if (!done) { done = true; clearTimeout(timer); resolve(value); } };
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
}

/** Speak a reply with the phone's own voice, for people not using a screen reader. */
export function speakAloud(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-NG';
    window.speechSynthesis.speak(u);
  } catch { /* speech output unavailable: the reply is still announced and shown */ }
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
  } catch { /* no audio: the spoken announcement still says "Listening" */ }
}

export const RECOGNITION_MESSAGES = {
  'no-speech': "I didn't hear anything. Double-tap Start talking and speak after the tone.",
  'not-allowed': 'The microphone is blocked. Allow microphone access for this site in your browser settings, or type instead.',
  'service-not-allowed': 'The microphone is blocked. Allow microphone access for this site in your browser settings, or type instead.',
  network: 'Voice needs an internet connection in this browser. Check your connection, or type instead.',
  unsupported: 'Voice input is not available in this browser. Use Chrome on Android, or type instead.',
};
