/**
 * Core implementation for bucket-split.
 *
 * We use a 32-bit FNV-1a hash rather than a cryptographic one because A/B
 * assignment only needs a uniform-ish, stable mapping from subject id to
 * integer. FNV-1a is tiny, dependency-free, and has good avalanche for this
 * purpose. A cryptographic hash would be overkill and would pull in either a
 * native binding (out of scope for a zero-dependency library) or a large
 * pure-JS implementation.
 */

/**
 * Compute a 32-bit FNV-1a hash of a string and return it as an unsigned 32-bit
 * integer in the range [0, 2^32 - 1].
 *
 * We coerce non-strings to strings before hashing so callers do not need to
 * pre-format numbers or booleans. This is the only implicit conversion the
 * library performs.
 *
 * @param {string} subject - The subject identifier to hash.
 * @returns {number} Unsigned 32-bit hash value.
 */
export function hashSubject(subject) {
  if (typeof subject !== 'string') {
    if (subject === null || subject === undefined) {
      throw new TypeError('subject must be a non-null, non-undefined value');
    }
    subject = String(subject);
  }

  // FNV-1a constants for the 32-bit variant.
  const FNV_OFFSET = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;

  let hash = FNV_OFFSET;

  for (let i = 0; i < subject.length; i++) {
    // charCodeAt returns a UTF-16 code unit. For the ASCII-range identifiers
    // this library is designed for, code units and code points coincide.
    // Using codePointAt would alter the hash for multi-byte characters; we
    // pick code units deliberately so the hash is well-defined and cheap.
    hash ^= subject.charCodeAt(i);
    // Multiply by FNV_PRIME mod 2^32. The `>>> 0` coerces back to an unsigned
    // 32-bit integer, which is how we keep the accumulator in range without
    // bignum arithmetic.
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash >>> 0;
}

/**
 * Convert a list of bucket sizes into cumulative thresholds expressed as a
 * fraction of the total, in the range [0, 1).
 *
 * Each threshold is the upper bound (exclusive) of that bucket. A subject
 * whose normalised hash falls below buckets[0]'s threshold lands in bucket 0,
 * and so on. The last threshold is always exactly 1, but we treat the range
 * as [0, 1) so a subject with the maximum possible hash still lands in the
 * final bucket.
 *
 * We validate inputs strictly because a malformed bucket list (negative sizes,
 * empty list, all-zero sizes) silently produces meaningless assignments and
 * that is worse than a thrown error.
 *
 * @param {number[]} buckets - Positive bucket sizes.
 * @returns {number[]} Cumulative thresholds, length === buckets.length, each
 *   in [0, 1], last element exactly 1.
 */
export function bucketsToThresholds(buckets) {
  if (!Array.isArray(buckets) || buckets.length === 0) {
    throw new TypeError('buckets must be a non-empty array of positive numbers');
  }

  let total = 0;
  for (let i = 0; i < buckets.length; i++) {
    const size = buckets[i];
    if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
      throw new TypeError('each bucket size must be a positive finite number');
    }
    total += size;
  }

  // We compare hashes against thresholds using strict <, and the maximum
  // normalised hash is strictly less than 1, so the final bucket catches
  // everything above the penultimate threshold. Setting the last threshold to
  // 1 documents that intent.
  const thresholds = new Array(buckets.length);
  let cumulative = 0;
  for (let i = 0; i < buckets.length; i++) {
    cumulative += buckets[i];
    thresholds[i] = i === buckets.length - 1 ? 1 : cumulative / total;
  }

  return thresholds;
}

/**
 * Assign a subject to a bucket deterministically.
 *
 * The subject is hashed, the hash is normalised to [0, 1), and the first
 * bucket whose cumulative threshold exceeds the normalised value wins.
 *
 * We normalise with (hash + 1) / 2^32 so that the result is in (0, 1) — never
 * zero. This matters because a threshold of 0 (which can happen if the first
 * bucket has size 0 after validation... but we forbid that) would otherwise
 * swallow everything. More importantly, using (hash + 1) avoids a hard zero
 * that could land a subject in an unexpected bucket under future refactors.
 *
 * @param {string} subject - Identifier to assign.
 * @param {number[]} buckets - Positive relative sizes, e.g. [1, 1] for 50/50.
 * @returns {number} The index of the assigned bucket (0-based).
 */
export function assign(subject, buckets) {
  const thresholds = bucketsToThresholds(buckets);
  const hash = hashSubject(subject);
  const normalised = (hash + 1) / 4294967296; // (hash + 1) / 2^32, in (0, 1]

  // Linear scan is fine: bucket counts are small (typically < 20). Binary
  // search would add complexity without measurable benefit here.
  for (let i = 0; i < thresholds.length; i++) {
    if (normalised < thresholds[i]) {
      return i;
    }
  }

  // Unreachable given the last threshold is exactly 1 and normalised is in
  // (0, 1], but we return the last bucket defensively in case of future
  // changes to threshold construction.
  return thresholds.length - 1;
}
