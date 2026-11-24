import assert from 'node:assert/strict';
import { waitForPage } from './test-poll.mjs';
const page = { evaluate: (fn, arg) => fn(arg) };
let calls = 0;
assert.equal(await waitForPage(page, async limit => ++calls >= limit, 3, { interval: 1 }), true);
assert.equal(calls, 3, 'A resolved false Promise must be polled again');
await assert.rejects(waitForPage(page, async () => false, null, { timeout: 5, interval: 1 }), /Timed out/);
await assert.rejects(waitForPage(page, async () => { throw Error('browser error'); }), /browser error/);
console.log('PASS async browser predicates: await false values, retry, timeout and surfaced errors');
