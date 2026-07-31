/**
 * Single-flight guard preventing duplicate overlay opens from rapid double-clicks
 * during the async pre-open fetch window. One overlay may be in its opening phase
 * at a time; the lock releases as soon as that overlay is rendered/opened (NOT held
 * until close -- nested confirm dialogs opened from a side panel must not be blocked).
 */
let _opening = false;

/**
 * Acquires the exclusive overlay-open lock.
 * Returns a release function if the lock was acquired, or null if already locked.
 * @returns {(() => void) | null}
 */
export function acquireOverlayOpen() {
  if (_opening) return null;
  _opening = true;
  return () => { _opening = false; };
}
