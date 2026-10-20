import assert from 'assert';
import { buildUpiQrUrl, STORE_UPI_ID } from '../src/utils/upi.ts';

console.log('--- RUNNING UPI QR TESTS ---');

const url = buildUpiQrUrl({ id: 'DKN-1001', total: 580 });
assert.ok(url.startsWith('https://api.qrserver.com/v1/create-qr-code/'), 'the QR comes from the image service');

const encoded = new URL(url).searchParams.get('data');
assert.ok(encoded, 'the QR encodes a payload');
assert.ok(encoded.startsWith('upi://pay?'), 'the payload is a UPI payment intent');

const params = new URLSearchParams(encoded.slice('upi://pay?'.length));
assert.strictEqual(params.get('pa'), STORE_UPI_ID, 'payee is the store UPI id');
assert.strictEqual(params.get('am'), '580.00', 'the order total is fixed to two decimals');
assert.strictEqual(params.get('cu'), 'INR');
assert.strictEqual(params.get('tid'), 'DKN1001', 'the transaction id is alphanumeric');
assert.ok(params.get('tn').includes('DKN-1001'), 'the note names the order');

// The walkthrough demo uses the same builder, so it must produce a real code too.
const demo = buildUpiQrUrl({ id: 'DKN-DEMO-0001', total: 580 });
assert.notStrictEqual(demo, '', 'the demo has a QR');
assert.ok(new URL(demo).searchParams.get('data').includes('am=580.00'));

assert.strictEqual(buildUpiQrUrl(null), '', 'no order means no QR');

console.log('UPI QR tests passed.');
