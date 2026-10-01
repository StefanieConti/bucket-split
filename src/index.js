/**
 * Bucket Split — stable hash-based A/B assignment.
 *
 * Exports a single function `assign` plus the lower-level `hashSubject` and
 * `bucketsToThresholds` helpers, all defined in `./core.js`.
 *
 * The public surface is deliberately tiny; everything not exported is
 * implementation detail.
 */

import { assign, hashSubject, bucketsToThresholds } from './core.js';

export { assign, hashSubject, bucketsToThresholds };
export default assign;
