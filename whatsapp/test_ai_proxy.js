import './test_setup_orders_file.js'; // pin the stores, blank the live credentials
import assert from 'assert';
import {
  buildUpstreamRequest,
  OPENROUTER_ENDPOINT,
  DEFAULT_UPSTREAM_MODEL,
  resolveModelConfig,
} from './aiProxy.js';

console.log('--- RUNNING AI PROXY TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

const base = {
  body: { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
  apiKey: 'server-side-key',
  referer: 'https://dukaan-ai-beta.vercel.app',
};

// ── the key ──────────────────────────────────────────────────────────────────
{
  const { init } = buildUpstreamRequest(base);
  assert.strictEqual(init.headers.Authorization, 'Bearer server-side-key',
    'the provider key comes from the server env, never from the request');
  ok('the upstream call is authorised with the server-side key');
}

{
  const { init } = buildUpstreamRequest({
    ...base,
    body: { ...base.body, api_key: 'attacker-supplied-key' },
  });
  const sent = JSON.parse(init.body);
  assert.strictEqual(sent.api_key, undefined, 'a client-supplied key must be dropped');
  assert.strictEqual(init.headers.Authorization, 'Bearer server-side-key', 'the server key still wins');
  ok('a key supplied by the caller is discarded — the caller cannot choose whose quota is spent');
}

// ── the privacy flag ─────────────────────────────────────────────────────────
{
  const { init } = buildUpstreamRequest(base);
  const sent = JSON.parse(init.body);
  assert.strictEqual(sent.provider.data_collection, 'deny',
    'shop data must not be retained or trained on by the provider');
  ok('provider.data_collection defaults to deny');
}

{
  const { init } = buildUpstreamRequest({
    ...base,
    body: { ...base.body, provider: { data_collection: 'allow', order: ['x'] } },
  });
  const sent = JSON.parse(init.body);
  assert.strictEqual(sent.provider.data_collection, 'deny', 'the caller cannot re-enable data collection');
  assert.deepStrictEqual(sent.provider.order, ['x'], 'other provider options still pass through');
  ok('a caller asking for data collection is overruled, but its other options survive');
}

{
  const { init } = buildUpstreamRequest({ ...base, dataCollection: 'allow' });
  assert.strictEqual(JSON.parse(init.body).provider.data_collection, 'allow',
    'the operator can opt into data collection for a free model, explicitly');
  ok('AI_DATA_COLLECTION=allow is honoured when the operator sets it');
}

// ── the model ────────────────────────────────────────────────────────────────
{
  const { init } = buildUpstreamRequest({
    ...base,
    body: { ...base.body, model: 'expensive/model', models: ['a', 'b'] },
    model: 'server/chosen-model',
    models: ['server/fallback'],
  });
  const sent = JSON.parse(init.body);
  assert.strictEqual(sent.model, 'server/chosen-model',
    'the model comes from the server env, never from the caller');
  assert.deepStrictEqual(sent.models, ['server/fallback']);
  ok("a caller's model and fallback list are discarded in favour of the server's");
}

{
  const { init } = buildUpstreamRequest({ ...base, models: [] });
  assert.strictEqual(JSON.parse(init.body).models, undefined,
    'an empty fallback list must not send a bogus models field');
  ok('no fallback list means no models field at all');
}

{
  const cfg = resolveModelConfig({});
  assert.strictEqual(cfg.model, DEFAULT_UPSTREAM_MODEL, 'an unconfigured model falls back to a paid one');
  assert.strictEqual(cfg.dataCollection, 'deny', 'so the default privacy guarantee holds');
  assert.strictEqual(resolveModelConfig({ AI_DATA_COLLECTION: 'ALLOW' }).dataCollection, 'allow');
  assert.strictEqual(resolveModelConfig({ AI_DATA_COLLECTION: 'yes' }).dataCollection, 'deny');
  assert.deepStrictEqual(resolveModelConfig({ AI_MODEL_FALLBACKS: ' a , b , ' }).models, ['a', 'b']);
  assert.deepStrictEqual(
    resolveModelConfig({ AI_MODEL_FALLBACKS: 'a,b,c,d,e' }).models,
    ['a', 'b', 'c'],
    'more than three fallbacks must be truncated, not forwarded — OpenRouter 400s the whole call'
  );
  assert.strictEqual(resolveModelConfig({ OPENROUTER_MODEL: ' x/y ' }).model, 'x/y');
  ok('the env contract resolves exactly: model, fallbacks, and a fail-closed data policy');
}

// ── the payload ──────────────────────────────────────────────────────────────
{
  const { url, init } = buildUpstreamRequest({
    ...base,
    body: { ...base.body, stream: true },
  });
  assert.strictEqual(url, OPENROUTER_ENDPOINT);
  assert.ok(url.startsWith('https://'), 'the upstream is called over TLS');
  const sent = JSON.parse(init.body);
  assert.deepStrictEqual(sent.messages, base.body.messages);
  assert.strictEqual(sent.stream, true, 'the stream flag is preserved so SSE passes through');
  assert.strictEqual(init.method, 'POST');
  assert.strictEqual(init.headers['Content-Type'], 'application/json');
  ok('messages and the stream flag reach the provider, with the server-chosen model');
}

{
  const { init } = buildUpstreamRequest({ body: { prompt: 'x' }, apiKey: 'k' });
  assert.strictEqual(init.headers['HTTP-Referer'], undefined, 'no Referer header when none is given');
  assert.strictEqual(init.headers['X-Title'], 'Dukaan.AI');
  ok('a missing referer does not produce a bogus header');
}

{
  const { init } = buildUpstreamRequest();
  assert.doesNotThrow(() => JSON.parse(init.body), 'an empty request still builds a valid body');
  assert.strictEqual(init.headers.Authorization, 'Bearer ', 'an unconfigured key yields an empty bearer, not a crash');
  ok('an empty body and a missing key are handled without throwing');
}

console.log('\n========================================');
console.log(`🎉 ALL ${n} AI PROXY TESTS PASSED 🎉`);
console.log('========================================');
