import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assign, hashSubject, bucketsToThresholds } from '../src/index.js';

// --- hashSubject -----------------------------------------------------------

test('hashSubject is deterministic for the same input', () => {
  const a = hashSubject('user-42');
  const b = hashSubject('user-42');
  assert.equal(a, b);
});

test('hashSubject returns an unsigned 32-bit integer', () => {
  const h = hashSubject('anything');
  assert.ok(Number.isInteger(h));
  assert.ok(h >= 0);
  assert.ok(h < 4294967296);
});

test('hashSubject differs for different inputs', () => {
  // Not a collision-resistance proof, just a sanity check that we are not
  // returning a constant.
  const a = hashSubject('alice');
  const b = hashSubject('bob');
  assert.notEqual(a, b);
});

test('hashSubject rejects null and undefined', () => {
  assert.throws(() => hashSubject(null), TypeError);
  assert.throws(() => hashSubject(undefined), TypeError);
});

test('hashSubject coerces numbers to strings', () => {
  // 123 and '123' must produce the same hash. This is the documented
  // behaviour; we test exactly that.
  assert.equal(hashSubject(123), hashSubject('123'));
});

test('hashSubject is sensitive to the full string', () => {
  // Truncation bugs in the loop would make these collide.
  assert.notEqual(hashSubject('abc'), hashSubject('abcd'));
});

// --- bucketsToThresholds ---------------------------------------------------

test('bucketsToThresholds produces cumulative bounds', () => {
  const t = bucketsToThresholds([1, 1, 2]);
  // total = 4; cumulative 1/4, 2/4, then 1.
  assert.deepEqual(t, [0.25, 0.5, 1]);
});

test('bucketsToThresholds forces last threshold to 1', () => {
  const t = bucketsToThresholds([3, 7]);
  assert.equal(t[t.length - 1], 1);
});

test('bucketsToThresholds rejects empty array', () => {
  assert.throws(() => bucketsToThresholds([]), TypeError);
});

test('bucketsToThresholds rejects non-positive sizes', () => {
  assert.throws(() => bucketsToThresholds([0, 1]), TypeError);
  assert.throws(() => bucketsToThresholds([-1, 1]), TypeError);
});

test('bucketsToThresholds rejects non-numeric sizes', () => {
  assert.throws(() => bucketsToThresholds(['1', 1]), TypeError);
  assert.throws(() => bucketsToThresholds([NaN, 1]), TypeError);
});

// --- assign ----------------------------------------------------------------

test('assign is stable across calls', () => {
  const first = assign('subject-99', [1, 1]);
  const second = assign('subject-99', [1, 1]);
  assert.equal(first, second);
});

test('assign returns a valid bucket index', () => {
  const idx = assign('subject-1', [3, 7]);
  assert.ok(idx === 0 || idx === 1);
});

test('assign respects bucket weights for a large sample', () => {
  // Deterministic distribution check: 30% / 70% split over 10000 subjects.
  // We allow a tolerance of 2 percentage points — FNV-1a is not cryptographic,
  // so we do not demand exactness, but a correct implementation must be close.
  const buckets = [3, 7];
  const counts = [0, 0];
  for (let i = 0; i < 10000; i++) {
    const idx = assign('subj-' + i, buckets);
    counts[idx]++;
  }
  const ratio0 = counts[0] / 10000;
  assert.ok(ratio0 > 0.28 && ratio0 < 0.32, 'bucket 0 ratio out of range: ' + ratio0);
});

test('assign with a single bucket always returns 0', () => {
  for (let i = 0; i < 100; i++) {
    assert.equal(assign('x-' + i, [1]), 0);
  }
});

test('assign never returns an out-of-range index', () => {
  const buckets = [1, 1, 1, 1, 1];
  for (let i = 0; i < 1000; i++) {
    const idx = assign('edge-' + i, buckets);
    assert.ok(idx >= 0 && idx < buckets.length);
  }
});

test('assign throws on invalid buckets', () => {
  assert.throws(() => assign('s', []), TypeError);
  assert.throws(() => assign('s', [0, 1]), TypeError);
});
