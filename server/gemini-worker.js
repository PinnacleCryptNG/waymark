// WAYMARK interpreter server: a Cloudflare Worker that asks Gemini what a spoken sentence means.
//
// It holds the Gemini API key (a Worker secret), so the key never reaches the web page.
// It only reads words. It cannot see balances, accounts or payees, and it cannot move money:
// it returns a request such as { type: 'transfer', payeeName: 'Musa', amountNaira: 5000 },
// and the app checks that request against its own rules before doing anything.
//
// Settings (see docs/AI-SETUP.md):
//   GEMINI_API_KEY   secret, required
//   GEMINI_MODEL     optional, default below
//   ALLOWED_ORIGINS  comma-separated list of sites allowed to call this server

export const DEFAULT_MODEL = 'gemini-flash-lite-latest';
export const MAX_TEXT = 300;
export const TYPES = ['balance', 'recent', 'help', 'yes', 'no', 'transfer', 'amount', 'bank', 'unknown'];

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    type: { type: 'STRING', enum: TYPES },
    payeeName: { type: 'STRING', nullable: true },
    accountNumber: { type: 'STRING', nullable: true },
    bankName: { type: 'STRING', nullable: true },
    amountNaira: { type: 'NUMBER', nullable: true },
  },
  required: ['type'],
};

export function instructions(banks) {
  return `You read one short sentence spoken to WAYMARK, a voice banking demo for blind customers in Nigeria.
Speech-to-text produced the sentence, so expect Nigerian English, Pidgin, mishearings and missing punctuation.
Return what the person wants, as JSON. Never invent details that were not said.

type:
- balance: asks how much money they have.
- recent: asks about recent payments or activity.
- help: asks what they can say or do.
- yes / no: a clear yes or no on its own (for example "yes", "na so", "no", "cancel"). If unsure, use unknown.
- transfer: wants to send, pay or transfer money, or names who to pay.
- amount: only says an amount (answering "how much?").
- bank: only names a bank (answering "which bank?").
- unknown: anything else.

Fields (null when not said):
- payeeName: the person's name as said, in normal spelling, without titles such as "my brother".
- accountNumber: exactly 10 digits if a full account number was said, digits only. Otherwise null.
- bankName: one of these demo banks if named: ${banks.join(', ') || 'none'}.
- amountNaira: the amount in naira as a number. "5k" is 5000, "two thousand five hundred" is 2500,
  "1.5 million" is 1500000. Kobo as decimals.`;
}

function cors(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** Keep only well-formed fields; anything odd becomes null or 'unknown'. */
export function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const digits = typeof r.accountNumber === 'string' ? r.accountNumber.replace(/\D/g, '') : '';
  const amount = Number(r.amountNaira);
  return {
    type: TYPES.includes(r.type) ? r.type : 'unknown',
    payeeName: str(r.payeeName, 60),
    accountNumber: digits.length === 10 ? digits : null,
    bankName: str(r.bankName, 60),
    amountNaira: r.amountNaira != null && Number.isFinite(amount) && amount > 0 && amount <= 1e9 ? amount : null,
  };
}

export async function askGemini(text, banks, env, fetchFn = fetch) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: instructions(banks) }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const data = await res.json();
  const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  return clean(JSON.parse(out));
}

export default {
  async fetch(request, env) {
    const headers = cors(request.headers.get('Origin'), env);
    if (!headers) return json({ error: 'origin not allowed' }, 403, {});
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/interpret') return json({ error: 'not found' }, 404, headers);
    if (!env.GEMINI_API_KEY) return json({ error: 'server not set up' }, 500, headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad request' }, 400, headers); }
    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (!text || text.length > MAX_TEXT) return json({ error: 'bad request' }, 400, headers);
    const banks = (Array.isArray(body.banks) ? body.banks : [])
      .filter((b) => typeof b === 'string').slice(0, 30).map((b) => b.slice(0, 60));

    try {
      return json({ intent: await askGemini(text, banks, env) }, 200, headers);
    } catch {
      // The app falls back to its own rules, so a failure here is never a dead end for the user.
      return json({ error: 'interpreter unavailable' }, 502, headers);
    }
  },
};
