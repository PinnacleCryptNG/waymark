// The Gemini reader: server-side cleaning, client-side checking, and falling back to the rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { clean, askGemini, instructions, selfCheck } from '../server/gemini-worker.js';
import { createGeminiInterpreter, toIntent } from '../app/voice/gemini-interpreter.js';
import { BANKS, BENEFICIARIES } from '../app/data/seed.js';

const ctx = { banks: BANKS, beneficiaries: BENEFICIARIES };
const reply = (intent, status = 200) => async () => ({ ok: status === 200, status, json: async () => ({ intent }) });

test('server cleans whatever Gemini returns', () => {
  assert.deepEqual(clean({ type: 'transfer', payeeName: ' Musa ', accountNumber: '0198 765 432', amountNaira: 5000 }),
    { type: 'transfer', payeeName: 'Musa', accountNumber: '0198765432', bankName: null, amountNaira: 5000 });
  assert.equal(clean({ type: 'send all my money' }).type, 'unknown');
  assert.equal(clean({ type: 'transfer', accountNumber: '123' }).accountNumber, null);
  assert.equal(clean({ type: 'amount', amountNaira: -5 }).amountNaira, null);
  assert.equal(clean(null).type, 'unknown');
});

test('server sends the sentence and bank names to Gemini with the key in a header, never the page', async () => {
  let sent;
  const fake = async (url, init) => {
    sent = { url, init };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"type":"balance"}' }] } }] }) };
  };
  const out = await askGemini('how much I get', ['Lagoon Bank (demo)'], { GEMINI_API_KEY: 'k' }, fake);
  assert.equal(out.type, 'balance');
  assert.match(sent.url, /models\/gemini-flash-lite-latest:generateContent$/);
  assert.equal(sent.init.headers['x-goog-api-key'], 'k');
  assert.doesNotMatch(sent.url, /key=/);
  assert.match(instructions(['Lagoon Bank (demo)']), /Lagoon Bank \(demo\)/);
});

test('server tries the Vertex address when the AI Studio address refuses the key', async () => {
  const urls = [];
  const fake = async (url) => {
    urls.push(url);
    if (url.includes('generativelanguage')) return { ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid.' } }) };
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"type":"balance"}' }] } }] }) };
  };
  assert.equal((await askGemini('wetin remain', [], { GEMINI_API_KEY: 'AQ.x' }, fake)).type, 'balance');
  assert.match(urls[1], /aiplatform\.googleapis\.com\/v1\/publishers\/google\/models\//);
  urls.length = 0;
  await assert.rejects(askGemini('x', [], { GEMINI_API_KEY: 'k', GEMINI_ENDPOINT: 'studio' }, fake));
  assert.equal(urls.length, 1);
});

test('self-check is free and never shows the key', async () => {
  let calls = 0;
  const r = selfCheck({ GEMINI_API_KEY: 'secret-key-123' });
  assert.equal(r.keySet, true);
  assert.ok(!JSON.stringify(r).includes('secret-key-123'));
  assert.match(selfCheck({}).verdict, /No GEMINI_API_KEY/);
  const orig = globalThis.fetch;
  globalThis.fetch = async () => { calls++; throw new Error('no'); };
  try {
    const res = await worker.fetch(new Request('https://w.example/check'), { GEMINI_API_KEY: 'k' });
    assert.equal(res.status, 200);
  } finally { globalThis.fetch = orig; }
  assert.equal(calls, 0, 'no Gemini call');
});

test('server refuses other websites and bad requests', async () => {
  const env = { ALLOWED_ORIGINS: 'https://pinnaclecryptng.github.io', GEMINI_API_KEY: 'k' };
  const req = (origin, body) => new Request('https://w.example/interpret', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body });
  assert.equal((await worker.fetch(req('https://evil.example', '{"text":"hi"}'), env)).status, 403);
  assert.equal((await worker.fetch(req('https://pinnaclecryptng.github.io', '{"text":""}'), env)).status, 400);
  assert.equal((await worker.fetch(req('https://pinnaclecryptng.github.io', JSON.stringify({ text: 'x'.repeat(301) })), env)).status, 400);
});

test('a Pidgin request becomes a normal transfer, matched to saved payees on the phone', async () => {
  const i = createGeminiInterpreter({ endpoint: 'https://w.example', fetchFn: reply({ type: 'transfer', payeeName: 'Musa', amountNaira: 5000 }) });
  const intent = await i.interpret('abeg send Musa five thousand', ctx);
  assert.equal(intent.via, 'gemini');
  assert.equal(intent.type, 'transfer');
  assert.equal(intent.amountKobo, 500000);
  assert.deepEqual(intent.payeeIds, [BENEFICIARIES.find((b) => b.name.startsWith('Musa')).id]);
});

test('only the sentence and bank names leave the phone', async () => {
  let body;
  const i = createGeminiInterpreter({ endpoint: 'https://w.example/', fetchFn: async (url, init) => { body = JSON.parse(init.body); assert.equal(url, 'https://w.example/interpret'); return reply({ type: 'balance' })(); } });
  await i.interpret('wetin remain for my account', { ...ctx, balanceKobo: 123 });
  assert.deepEqual(Object.keys(body).sort(), ['banks', 'text']);
  assert.ok(!JSON.stringify(body).includes('Musa'));
});

test('yes and no never go to the server', async () => {
  let calls = 0;
  const i = createGeminiInterpreter({ endpoint: 'https://w.example', fetchFn: async () => { calls++; return reply({ type: 'yes' })(); } });
  assert.equal((await i.interpret('no', ctx)).type, 'no');
  assert.equal((await i.interpret('yes', ctx)).type, 'yes');
  assert.equal(calls, 0);
});

test('server down, slow or odd: the rules answer', async () => {
  const down = createGeminiInterpreter({ endpoint: 'https://w.example', fetchFn: async () => { throw new Error('offline'); } });
  const r = await down.interpret('send 500 naira to Musa', ctx);
  assert.equal(r.via, 'rules');
  assert.equal(r.amountKobo, 50000);
  const slow = createGeminiInterpreter({ endpoint: 'https://w.example', timeoutMs: 20,
    fetchFn: (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))) });
  assert.equal((await slow.interpret('what is my balance', ctx)).via, 'rules');
  const odd = createGeminiInterpreter({ endpoint: 'https://w.example', fetchFn: reply({ type: 'wire everything' }) });
  assert.equal((await odd.interpret('what is my balance', ctx)).type, 'balance');
  const err = createGeminiInterpreter({ endpoint: 'https://w.example', fetchFn: reply(null, 502) });
  assert.equal((await err.interpret('what is my balance', ctx)).via, 'rules');
});

test('client checks are strict', () => {
  assert.equal(toIntent({ type: 'transfer', accountNumber: '12345', amountNaira: 'lots' }, ctx).accountNumber, null);
  assert.equal(toIntent({ type: 'transfer', amountNaira: 'lots' }, ctx).amountKobo, null);
  assert.equal(toIntent({ type: 'amount', amountNaira: 0 }, ctx), null);
  assert.equal(toIntent({ type: 'bank', bankName: 'Lagoon' }, ctx).bankCode, BANKS.find((b) => b.name.startsWith('Lagoon')).code);
  assert.equal(toIntent({ type: 'transfer', payeeName: 'Tunde' }, ctx).nameHeard, 'tunde');
});
