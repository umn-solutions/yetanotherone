import { emailEquals, normalizeEmail } from './email-helpers.js';
import { isMentorUser } from './roles.js';
import { getGestorMap, getManagementChainEmails } from './org-hierarchy-api.js';

/**
 * Determines whether a confidential initiative is visible to the current user
 * based on any of these carve-outs:
 *   (a) mentor or mentor-manager role (cross-team visibility)
 *   (b) initiative owner (SubmittedByEmail)
 *   (c) assigned gestor (GestorValidatorEmail)
 *   (d) explicit shared access (opts.sharedUUIDs or opts.sharedEmails)
 *   (e) direct manager or any ancestor manager of the impacted team (org chain)
 *
 * Fails closed: if org hierarchy data cannot be loaded the confidential item is hidden.
 *
 * @param {Object[]} items - Raw initiative items from SharePoint.
 * @param {string} currentEmail - Current user's email (from ContextStore currentUser).
 * @param {{
 *   sharedUUIDs?: Set<string>,
 * }} [opts]
 * @returns {Promise<Object[]>} Items the current user may see.
 */
export async function filterVisibleInitiatives(items, currentEmail, opts = {}) {
  // Fast path: mentors/mentor-managers see everything.
  if (isMentorUser()) return items;

  const { sharedUUIDs } = opts;
  const normalizedCurrentEmail = normalizeEmail(currentEmail);

  // Separate confidential from non-confidential to avoid warming the gestor map
  // when there are no confidential items at all.
  const confidentialItems = items.filter(
    (i) => i.IsConfidential === true || i.IsConfidential === 'true'
  );

  if (confidentialItems.length === 0) return items;

  // Warm the gestor map once for all confidential items (it is cached after first call).
  let gestorMapReady = false;
  try {
    await getGestorMap();
    gestorMapReady = true;
  } catch (err) {
    console.error('[filterVisibleInitiatives] getGestorMap failed -- failing closed on all confidential items', err);
  }

  // Build per-OUID chain-email sets (dedupe OUIDs so we only walk each path once).
  const chainCache = new Map(); // OUID -> Set<string>

  async function chainContains(ouid) {
    if (!ouid) return false;
    if (chainCache.has(ouid)) return chainCache.get(ouid).has(normalizedCurrentEmail);
    if (!gestorMapReady) {
      chainCache.set(ouid, new Set());
      return false;
    }
    const emails = await getManagementChainEmails(ouid);
    chainCache.set(ouid, emails);
    return emails.has(normalizedCurrentEmail);
  }

  const visibleItems = [];
  for (const item of items) {
    const isConfidential = item.IsConfidential === true || item.IsConfidential === 'true';
    if (!isConfidential) {
      visibleItems.push(item);
      continue;
    }

    // Carve-out (b): initiative owner
    if (emailEquals(item.SubmittedByEmail, currentEmail)) {
      visibleItems.push(item);
      continue;
    }

    // Carve-out (c): assigned gestor
    if (emailEquals(item.GestorValidatorEmail, currentEmail)) {
      visibleItems.push(item);
      continue;
    }

    // Carve-out (d): explicitly shared with this user
    if (sharedUUIDs && sharedUUIDs.size > 0 && item.UUID && sharedUUIDs.has(item.UUID)) {
      visibleItems.push(item);
      continue;
    }

    // Carve-out (e): user is in the management chain of the impacted team
    if (item.ImpactedTeamOUID) {
      let inChain = false;
      try {
        inChain = await chainContains(item.ImpactedTeamOUID);
      } catch (err) {
        console.warn('[filterVisibleInitiatives] chain lookup failed for OUID, hiding item', {
          ouid: item.ImpactedTeamOUID,
          uuid: item.UUID,
          err,
        });
      }
      if (inChain) {
        visibleItems.push(item);
        continue;
      }
    }

    // Fail closed: item not accessible to this user.
  }

  return visibleItems;
}
