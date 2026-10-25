import assert from 'assert';
import { CHECKOUT_URI, checkoutResourceContents } from '../mcp/apps/checkout.js';

console.log('--- RUNNING MCP APP RESOURCE TESTS ---');
assert.strictEqual(CHECKOUT_URI, 'ui://dukaan/checkout.html');
const contents = checkoutResourceContents();
assert.strictEqual(contents.contents.length, 1);
assert.strictEqual(contents.contents[0].uri, CHECKOUT_URI);
assert.strictEqual(contents.contents[0].mimeType, 'text/html;profile=mcp-app');
assert.match(contents.contents[0].text, /<html/i);
assert(contents.contents[0]._meta?.ui?.csp, 'CSP metadata is attached to the content item');
assert.strictEqual(contents.contents[0]._meta.ui.prefersBorder, false);
console.log('✓ 1: the checkout resource has the MCP App MIME type and a CSP');
console.log('\nAll MCP App resource checks passed.');
