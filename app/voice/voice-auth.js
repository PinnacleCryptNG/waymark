// Voice sign-up, sign-in and payment approval, against the WAYMARK server.
// The server picks random digits, the user says them, and the server checks the voice and the digits.

const PHONE_KEY = 'waymark.phone';
const TOKEN_KEY = 'waymark.session';

export function createVoiceAuth({ base = '', local = globalThis.localStorage, session = globalThis.sessionStorage } = {}) {
  const get = (store, key) => { try { return store?.getItem(key) ?? null; } catch { return null; } };
  const set = (store, key, value) => { try { if (value) store?.setItem(key, value); else store?.removeItem(key); } catch { /* private mode */ } };

  async function post(path, body, form = false) {
    const token = get(session, TOKEN_KEY);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    if (!form) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${path}`, { method: 'POST', headers, body: form ? body : JSON.stringify(body) });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return res.json();
  }

  function clip(challengeId, audio) {
    const form = new FormData();
    form.append('challengeId', challengeId);
    form.append('audio', audio, 'voice.webm');
    return form;
  }

  const keep = (r) => { if (r.ok && r.token) set(session, TOKEN_KEY, r.token); return r; };

  return {
    savedPhone: () => get(local, PHONE_KEY),
    token: () => get(session, TOKEN_KEY),
    async start(phone) {
      const r = await post('/api/auth/start', { phone });
      if (r.ok) set(local, PHONE_KEY, r.phone);
      return r;
    },
    challenge: (body) => post('/api/voice/challenge', body),
    enroll: async (challengeId, audio) => keep(await post('/api/voice/enroll', clip(challengeId, audio), true)),
    login: async (challengeId, audio) => keep(await post('/api/voice/login', clip(challengeId, audio), true)),
    approve: (challengeId, audio) => post('/api/voice/approve', clip(challengeId, audio), true),
    async signOut() {
      try { await post('/api/auth/logout', {}); } catch { /* signed out locally anyway */ }
      set(session, TOKEN_KEY, null);
    },
    forget() { set(local, PHONE_KEY, null); set(session, TOKEN_KEY, null); },
  };
}
