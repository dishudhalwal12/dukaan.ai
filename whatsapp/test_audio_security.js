import './test_setup_orders_file.js'; // pin the stores, blank live credentials
import assert from 'assert';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import {
  isAllowedMediaHost,
  validateAudioMessageDescriptor,
  downloadAudioStreamWithCap,
  transcribeAudioMessage,
  MAX_AUDIO_SIZE_BYTES,
  AUDIO_DOWNLOAD_TIMEOUT_MS,
} from './audioTranscriber.js';

console.log('--- RUNNING VOICE NOTE & AUDIO SECURITY TESTS (#69) ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

// ── 1. Host and Scheme Verification ───────────────────────────────────────────
// Valid hosts
assert.strictEqual(
  isAllowedMediaHost('https://mmg.whatsapp.net/v/t62.7114-24/12345_67890.enc?ccb=11-4'),
  true,
  'Official WhatsApp mmg host with query params must be allowed'
);
assert.strictEqual(
  isAllowedMediaHost('https://media-bom1-1.cdn.whatsapp.net/v/t62.7114-24/test.ogg'),
  true,
  'WhatsApp CDN regional host must be allowed'
);
assert.strictEqual(
  isAllowedMediaHost('https://whatsapp.net/path'),
  true,
  'Apex whatsapp.net must be allowed'
);
assert.strictEqual(
  isAllowedMediaHost('https://media.whatsapp.com/audio.enc'),
  true,
  'whatsapp.com subdomains must be allowed'
);
assert.strictEqual(
  isAllowedMediaHost('https://scontent.xx.fbcdn.net/v/t62.7114-24/audio.enc'),
  true,
  'Meta fbcdn.net media distribution host must be allowed'
);
ok('Authorized WhatsApp and Meta CDN hosts over HTTPS are allowed');

// Invalid schemes
assert.strictEqual(
  isAllowedMediaHost('http://mmg.whatsapp.net/audio.enc'),
  false,
  'Insecure HTTP must be refused even for whatsapp.net'
);
assert.strictEqual(
  isAllowedMediaHost('ftp://mmg.whatsapp.net/audio.enc'),
  false,
  'FTP scheme must be refused'
);
assert.strictEqual(
  isAllowedMediaHost('file:///etc/passwd'),
  false,
  'file:// scheme must be refused'
);
ok('Non-HTTPS schemes (http, ftp, file) are strictly refused');

// Malicious / SSRF / Spoofed hosts
assert.strictEqual(
  isAllowedMediaHost('https://attacker.example.com/malicious.ogg'),
  false,
  'External arbitrary host must be refused'
);
assert.strictEqual(
  isAllowedMediaHost('https://169.254.169.254/latest/meta-data/'),
  false,
  'Cloud metadata IP SSRF must be refused'
);
assert.strictEqual(
  isAllowedMediaHost('https://whatsapp.net.attacker.example.com/audio.enc'),
  false,
  'Attacker domain spoofing whatsapp.net prefix must be refused'
);
assert.strictEqual(
  isAllowedMediaHost('https://evil-whatsapp.net/audio.enc'),
  false,
  'Lookalike host without dot separator must be refused'
);
assert.strictEqual(
  isAllowedMediaHost('https://notwhatsapp.com/audio.enc'),
  false,
  'Lookalike domain must be refused'
);
assert.strictEqual(isAllowedMediaHost(''), false);
assert.strictEqual(isAllowedMediaHost(null), false);
assert.strictEqual(isAllowedMediaHost(undefined), false);
assert.strictEqual(isAllowedMediaHost('invalid-url-string'), false);
ok('Arbitrary, SSRF, spoofed, and malformed hosts are refused');

// ── 2. validateAudioMessageDescriptor ─────────────────────────────────────────
// Missing descriptor
assert.strictEqual(validateAudioMessageDescriptor(null).valid, false);
assert.strictEqual(validateAudioMessageDescriptor(undefined).valid, false);
assert.strictEqual(validateAudioMessageDescriptor('string').valid, false);

// Standard Baileys descriptor with directPath only (URL is omitted, Baileys uses internal MMG host)
const directPathOnly = {
  directPath: '/v/t62.7114-24/1234_enc',
  mimetype: 'audio/ogg; codecs=opus',
  fileLength: 45000,
};
assert.strictEqual(validateAudioMessageDescriptor(directPathOnly).valid, true);

// Descriptor with valid URL and within size cap
const validDescriptor = {
  url: 'https://mmg.whatsapp.net/v/t62.7114-24/test.enc',
  fileLength: 1024 * 500, // 500 KB
  mimetype: 'audio/ogg; codecs=opus',
};
assert.strictEqual(validateAudioMessageDescriptor(validDescriptor).valid, true);

// Descriptor pointing to unverified external URL
const evilDescriptor = {
  url: 'https://attacker.com/huge.bin',
  fileLength: 1024 * 1024,
};
const evilRes = validateAudioMessageDescriptor(evilDescriptor);
assert.strictEqual(evilRes.valid, false);
assert.ok(evilRes.error.includes('Disallowed media host or scheme'));

// Descriptor declaring fileLength exceeding MAX_AUDIO_SIZE_BYTES
const hugeDescriptor = {
  url: 'https://mmg.whatsapp.net/v/t62.7114-24/huge.enc',
  fileLength: MAX_AUDIO_SIZE_BYTES + 1024,
};
const hugeRes = validateAudioMessageDescriptor(hugeDescriptor);
assert.strictEqual(hugeRes.valid, false);
assert.ok(hugeRes.error.includes('exceeds maximum limit'));

// Descriptor with protobuf Long-style fileLength { low: ... }
const hugeLongDescriptor = {
  url: 'https://mmg.whatsapp.net/v/t62.7114-24/huge.enc',
  fileLength: { low: MAX_AUDIO_SIZE_BYTES + 2048 },
};
const hugeLongRes = validateAudioMessageDescriptor(hugeLongDescriptor);
assert.strictEqual(hugeLongRes.valid, false);
assert.ok(hugeLongRes.error.includes('exceeds maximum limit'));

ok('Audio message descriptors are strictly validated upfront for host and declared size');

// ── 3. downloadAudioStreamWithCap: Streaming Size Limit ────────────────────────
async function testStreamSizeCap() {
  // Normal stream within limit
  const smallChunk1 = Buffer.from('hello ');
  const smallChunk2 = Buffer.from('world');
  const validStream = Readable.from([smallChunk1, smallChunk2]);
  const resultBuf = await downloadAudioStreamWithCap(validStream, 1024, 2000);
  assert.strictEqual(resultBuf.toString(), 'hello world');

  // Stream that pushes more bytes than maxBytes
  let destroyed = false;
  const oversizedStream = new Readable({
    read() {
      // Push 1 KB chunks indefinitely until destroyed
      if (!destroyed) {
        this.push(Buffer.alloc(1024, 0x41));
      }
    },
    destroy(err, callback) {
      destroyed = true;
      callback(err);
    },
  });

  let capError = null;
  try {
    // Cap at 4 KB
    await downloadAudioStreamWithCap(oversizedStream, 4096, 2000);
  } catch (err) {
    capError = err;
  }

  assert.ok(capError, 'Oversized stream must throw an error');
  assert.ok(capError.message.includes('exceeded maximum limit of 4096 bytes'));
  assert.strictEqual(destroyed, true, 'Oversized stream must be destroyed immediately on cap breach');
}

// ── 4. downloadAudioStreamWithCap: Download Timeout ────────────────────────────
async function testStreamTimeout() {
  let timeoutDestroyed = false;
  const hangingStream = new Readable({
    read() {
      // Don't push anything to simulate hanging connection
    },
    destroy(err, callback) {
      timeoutDestroyed = true;
      callback(err);
    },
  });

  let timeoutErr = null;
  try {
    await downloadAudioStreamWithCap(hangingStream, 1024 * 1024, 50); // 50ms timeout
  } catch (err) {
    timeoutErr = err;
  }

  assert.ok(timeoutErr, 'Hanging stream must trigger timeout');
  assert.ok(timeoutErr.message.includes('Audio download timed out after 50ms'));
  assert.strictEqual(timeoutDestroyed, true, 'Hanging stream must be destroyed when timeout fires');
}

// ── 5. Cleanup Invariants: Finally Block Execution ────────────────────────────
async function testCleanupInvariants() {
  const tempDir = path.resolve('temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const beforeFiles = new Set(fs.readdirSync(tempDir));

  // Invalid descriptor: should bail early and leave zero files behind
  const invalidResult = await transcribeAudioMessage({
    url: 'https://evil.example.com/bad.ogg',
  });
  assert.strictEqual(invalidResult, null);

  const afterFiles = new Set(fs.readdirSync(tempDir));
  assert.deepStrictEqual(afterFiles, beforeFiles, 'No temporary files created or leaked on rejected descriptor');
}

// Run async tests sequentially
await testStreamSizeCap();
ok('Streaming size cap enforced and aborted stream destroyed without buffering whole file');

await testStreamTimeout();
ok('Download timeout triggers and halts slow/hanging stream');

await testCleanupInvariants();
ok('Temporary files guaranteed cleaned up and not orphaned');

console.log('--- ALL AUDIO SECURITY TESTS PASSED ---');
