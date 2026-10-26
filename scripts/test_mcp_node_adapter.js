import assert from 'assert';
import { EventEmitter } from 'node:events';
import { sendWebResponse } from '../mcp/nodeAdapter.js';

/**
 * `sendWebResponse` piped the response body straight into the socket and called
 * `res.destroy()` on any stream error. When the body fails before a byte is
 * written, that destroy is what the customer's MCP client reports as
 *
 *   ECONNRESET: The socket connection was closed unexpectedly
 *
 * with no JSON-RPC error to explain it. If nothing has been flushed yet we can
 * still answer; only a stream that already wrote must be torn down.
 */
console.log('--- RUNNING MCP NODE-ADAPTER TESTS ---');
let n = 0;
const ok = (m) => console.log(`✓ ${++n}: ${m}`);

/** Minimal ServerResponse stand-in: tracks writes, headersSent, and destroy. */
function fakeRes() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = new Map();
  res.headersSent = false;
  res.writableEnded = false;
  res.destroyed = false;
  res.body = '';
  res.setHeader = (key, value) => res.headers.set(String(key).toLowerCase(), value);
  res.write = (chunk) => {
    res.headersSent = true;
    res.body += String(chunk);
    return true;
  };
  res.end = (chunk) => {
    res.headersSent = true;
    res.writableEnded = true;
    if (chunk) res.body += String(chunk);
    res.emit('finish');
    return res;
  };
  res.destroy = () => {
    res.destroyed = true;
    return res;
  };
  return res;
}

/**
 * `emitFirst: false` fails before any byte is produced.
 * `emitFirst: true` hands over one chunk, lets the pipe write it, then breaks —
 * the only way to reach the "headers already sent" branch, because a stream that
 * enqueues and errors in the same tick is never flushed to the socket.
 */
const failingStream = ({ emitFirst }) => {
  let pulls = 0;
  return new ReadableStream({
    pull(controller) {
      pulls += 1;
      if (!emitFirst) {
        controller.error(new Error('upstream body broke'));
        return;
      }
      if (pulls === 1) {
        controller.enqueue(new TextEncoder().encode('{"partial":'));
        setTimeout(() => {
          try {
            controller.error(new Error('upstream body broke'));
          } catch {
            // The consumer may already have closed the stream.
          }
        }, 5);
      }
      // Later pulls wait for the scheduled error rather than ending the stream.
      return new Promise(() => {});
    },
  });
};

// ── 1. Nothing written yet: answer with a JSON-RPC error ───────────────────
{
  const res = fakeRes();
  await sendWebResponse(res, new Response(failingStream({ emitFirst: false }), { status: 200 }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(res.destroyed, false, 'do not reset a socket we can still answer on');
  assert.strictEqual(res.statusCode, 500);
  assert.strictEqual(res.headers.get('content-type'), 'application/json; charset=utf-8');
  const payload = JSON.parse(res.body);
  assert.strictEqual(payload.error.data.code, 'stream_error');
  ok('a body that fails before any write becomes a 500 JSON-RPC error');
}

// ── 2. Already streaming: teardown is the only honest option ───────────────
{
  const res = fakeRes();
  await sendWebResponse(res, new Response(failingStream({ emitFirst: true }), { status: 200 }));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.strictEqual(res.destroyed, true, 'a half-written response must be torn down');
  ok('a body that fails mid-stream still tears the socket down');
}

console.log(`\nAll ${n} node-adapter checks passed.`);
