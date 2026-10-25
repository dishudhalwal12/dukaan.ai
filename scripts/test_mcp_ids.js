import assert from 'assert';
import { mcpOrderId } from '../mcp/ids.js';

console.log('--- RUNNING MCP ID TESTS ---');
const fixed = new Date(Date.UTC(2026, 9, 26, 12, 0, 0));
const id = mcpOrderId(fixed, () => Buffer.from('a1b2c3', 'hex'));
assert.match(id, /^MCP-20261026-[0-9A-F]{6}$/);
assert.strictEqual(id, 'MCP-20261026-A1B2C3');
const other = mcpOrderId(fixed, () => Buffer.from('ffffff', 'hex'));
assert.notStrictEqual(id, other);
console.log('✓ 1: order ids are dated, readable, and unique per random draw');
console.log('\nAll MCP id checks passed.');
