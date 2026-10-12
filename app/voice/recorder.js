// Records one short voice clip for the server's voice check.
// Stops by itself about a second after the person stops talking, or after maxMs.

export const recordingSupported = () =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';

export function recordClip({ maxMs = 8000, silenceMs = 1200, minMs = 1500 } = {}) {
  let stop = () => {};
  let aborted = false;
  const done = (async () => {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      return { ok: false, reason: e?.name === 'NotAllowedError' ? 'not-allowed' : 'audio-capture' };
    }
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t));
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    // Simple loudness watch: end the clip after a pause that follows speech.
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const started = performance.now();
    let heardSpeech = false;
    let lastLoud = started;

    const finished = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(250);
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buf);
      const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
      const now = performance.now();
      if (rms > 0.02) { heardSpeech = true; lastLoud = now; }
      const elapsed = now - started;
      if (elapsed > maxMs || (heardSpeech && elapsed > minMs && now - lastLoud > silenceMs)) stop();
    }, 100);
    stop = () => { clearInterval(timer); if (recorder.state !== 'inactive') recorder.stop(); };

    await finished;
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
    if (aborted) return { ok: false, reason: 'aborted' };
    if (!heardSpeech) return { ok: false, reason: 'no-speech' };
    return { ok: true, audio: new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }) };
  })();
  return { done, abort: () => { aborted = true; stop(); } };
}
