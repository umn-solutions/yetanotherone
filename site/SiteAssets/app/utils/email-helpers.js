/**
 * Shared email comparison utilities.
 *
 * Email values in this application can arrive in different casings depending
 * on their source:
 *   - Creation path: currentUser.get('email') (session casing from SP profile)
 *   - Assignment/transfer path: PeoplePicker -> UserIdentity.email (AD/claims casing)
 *
 * SharePoint CAML queries already compare case-insensitively on the server side,
 * so ListApi.getItems({ SubmittedByEmail: email }) will always find the right item.
 * However, client-side JavaScript === comparisons are case-sensitive, which causes
 * fetched items to be wrongly excluded when the stored email casing differs from
 * the current user's session email casing.
 *
 * Use emailEquals() for ALL client-side email comparisons involving list field values.
 * Do NOT use it for CAML query objects or object-literal payload assignments.
 */

/**
 * Normalizes an email address for comparison: trims whitespace and lowercases.
 * Returns an empty string for non-string or blank inputs.
 *
 * @param {*} value - The value to normalize.
 * @returns {string} Normalized email string, or '' if input is invalid/blank.
 */
export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Compares two email addresses case-insensitively.
 * Returns false if either value normalizes to an empty string -- a missing or
 * blank email must NOT match another blank to avoid false positives.
 *
 * @param {*} a - First email value.
 * @param {*} b - Second email value.
 * @returns {boolean} True if both are non-empty and equal after normalization.
 */
export function emailEquals(a, b) {
  const na = normalizeEmail(a);
  const nb = normalizeEmail(b);
  if (!na || !nb) return false;
  return na === nb;
}
