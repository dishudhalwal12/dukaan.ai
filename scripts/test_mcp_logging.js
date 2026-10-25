import assert from 'assert';
import { hashId, toolLogLine, redact } from '../mcp/logging.js';

console.log('--- RUNNING MCP LOGGING TESTS ---');
const hash = hashId('11111111-1111-4111-8111-111111111111');
assert.match(hash, /^[0-9a-f]{12}$/);
assert.notStrictEqual(hash, hashId('22222222-2222-4222-8222-222222222222'));
assert.strictEqual(hashId(''), null);
console.log('✓ 1: user ids are one-way hashed');

const line = toolLogLine({ tool: 'place_order', userId: '11111111-1111-4111-8111-111111111111', durationMs: 42, ok: true });
const parsed = JSON.parse(line);
assert.strictEqual(parsed.tool, 'place_order');
assert.strictEqual(parsed.user, hash);
assert.strictEqual(parsed.ms, 42);
assert.strictEqual(parsed.ok, true);
assert(!line.includes('11111111-1111-4111-8111-111111111111'), 'raw user id is not logged');
console.log('✓ 2: log lines carry a hash, tool name, duration, and outcome');

assert.strictEqual(redact('call 9876543210 or asha@example.com'), 'call [phone] or [email]');
assert.strictEqual(redact('12 MG Road, Jaipur'), '12 MG Road, Jaipur', 'addresses are not rewritten');
console.log('✓ 3: phone numbers and emails can be redacted from free text');

console.log('\nAll MCP logging checks passed.');
