import assert from 'assert';
import { normalisePhone, normalisePincode, normaliseName } from '../mcp/validation.js';

console.log('--- RUNNING MCP VALIDATION TESTS ---');
assert.strictEqual(normalisePhone('98765 43210'), '+919876543210');
assert.strictEqual(normalisePhone('09876543210'), '+919876543210');
assert.strictEqual(normalisePhone('919876543210'), '+919876543210');
assert.strictEqual(normalisePhone('+91 98765 43210'), '+919876543210');
assert.strictEqual(normalisePhone('12345'), null);
assert.strictEqual(normalisePhone('not a phone'), null);
assert.strictEqual(normalisePhone(''), null);
console.log('✓ 1: Indian phone numbers are normalised to E.164');

assert.strictEqual(normalisePincode('302001'), '302001');
assert.strictEqual(normalisePincode('302 001'), '302001');
assert.strictEqual(normalisePincode('30200'), null);
assert.strictEqual(normalisePincode('abcdef'), null);
console.log('✓ 2: pincodes are six digits or rejected');

assert.strictEqual(normaliseName('  Asha  Sharma '), 'Asha Sharma');
assert.strictEqual(normaliseName('A'), null);
assert.strictEqual(normaliseName('x'.repeat(81)), null);
console.log('✓ 3: names are trimmed and bounded');

console.log('\nAll MCP validation checks passed.');
