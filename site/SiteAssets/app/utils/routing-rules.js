import { getGestorMap, pickTeamHead } from './org-hierarchy-api.js';
import { GESTOR_CATEGORIES } from './constants.js';

const EXEC = 'Executive';
const TOP_MGMT = 'Top Management';
const MGMT = 'Management';

/**
 * Scans ancestors from startIdx downward (toward CEO/root) and returns the first
 * node whose Category is in GESTOR_CATEGORIES. Falls back to ancestors[0].
 * @param {Array} ancestors - ordered CEO(root) -> self(last)
 * @param {number} startIdx - index to begin scanning (inclusive)
 */
function firstGestorFrom(ancestors, startIdx) {
  for (let i = startIdx; i >= 0; i--) {
    if (GESTOR_CATEGORIES.includes(ancestors[i].Category)) return ancestors[i];
  }
  return ancestors[0] || null;
}

function directManager(ancestors) {
  // ancestors[length-2] is the immediate parent (ancestors[length-1] is self)
  return ancestors[ancestors.length - 2] || null;
}

function findBase(responsible, ancestors) {
  const role = responsible.Category;
  if (role === EXEC || role === TOP_MGMT) return responsible;
  if (role === MGMT) return directManager(ancestors);
  // skip self (last element) when climbing to first management node
  return firstGestorFrom(ancestors, ancestors.length - 2);
}

/**
 * Scans ancestors from startIdx downward and returns the first Executive-category
 * node, stopping BEFORE the root/CEO (index 0) which is never a valid target.
 * @param {Array} ancestors - ordered CEO(root) -> self(last)
 * @param {number} startIdx - index to begin scanning (inclusive)
 * @returns {object|null} null -> caller falls back to comexFallback
 */
function firstExecFrom(ancestors, startIdx) {
  for (let i = startIdx; i >= 1; i--) {
    if (ancestors[i].Category === EXEC) return ancestors[i];
  }
  return null;
}

/**
 * Never returns the root/CEO (ancestors[0]); demotes to the highest non-root ancestor.
 * @param {object|null} winner
 * @param {Array} ancestors - ordered CEO(root) -> self(last)
 * @returns {object|null} null -> caller falls back to comexFallback
 */
function excludeRoot(winner, ancestors) {
  if (winner && ancestors[0] && winner.Title === ancestors[0].Title) {
    return ancestors[1] || null; // null -> caller falls back to comexFallback
  }
  return winner;
}

/**
 * Determines which Gestor should validate based on routing rules.
 *
 * Normal initiatives: routes to the team's immediate accountability node (base).
 *
 * High-tier initiatives (>= 10 000 annualised OR Hard Cost): routes to the nearest
 * Executive-category ancestor scanning upward from self (inclusive), excluding the
 * root/CEO (index 0). If no Executive-category node exists above the impacted team
 * (other than root), falls back to comexFallback -- itself a non-root exec-level
 * direct report of root.
 *
 * @param {string} savingType
 * @param {string|number} savingEstimate - Already-annualized EUR total
 * @param {string} impactedTeamOUID
 * @returns {Promise<{ email: string, displayName: string } | null>}
 */
export async function getAssignedGestor(savingType, savingEstimate, impactedTeamOUID) {
  if (!impactedTeamOUID) return null;
  // Tier is decided on the magnitude of the saving: a large loss is as material
  // as a large gain, so route on the absolute value. Math.abs is explicit here
  // (the strip regex already drops the sign, but do not rely on that side effect).
  const value = Math.abs(parseFloat(String(savingEstimate).replace(/[^\d.]/g, '')) || 0);
  const isHighTier = savingType === 'Hard Cost' || value >= 10000;

  const { byId, byOUID, comexFallback } = await getGestorMap();
  const responsible = pickTeamHead(byOUID.get(impactedTeamOUID));
  if (!responsible) {
    // Impacted team is not present in OrgHierarchy (missing/dropped OU). Do NOT
    // silently route to a cross-line executive -- leave unassigned so it surfaces.
    console.warn('[getAssignedGestor] impacted team not found in OrgHierarchy -- gestor left unassigned', { impactedTeamOUID });
    return null;
  }

  const ancestors = (responsible.AncestorPath || responsible.Title)
    .split('|')
    .map(id => byId.get(id))
    .filter(Boolean);
  if (ancestors.length === 0) {
    console.warn('[getAssignedGestor] impacted team head has no resolvable ancestor chain -- gestor left unassigned', { impactedTeamOUID, responsible: responsible.Title });
    return null;
  }

  const base = findBase(responsible, ancestors);
  const rawWinner = isHighTier
    ? firstExecFrom(ancestors, ancestors.length - 1)
    : base;
  const winner = excludeRoot(rawWinner, ancestors);
  if (!winner) {
    // No valid in-line validator above the impacted team (e.g. CEO-office
    // initiative with no manager above root, or high-tier branch with no
    // in-line Executive). Escalate to the top-level exec fallback -- logged,
    // never silent.
    console.warn('[getAssignedGestor] no in-line validator resolved -- escalating to comexFallback', { impactedTeamOUID, isHighTier, responsible: responsible.Title });
    return comexFallback;
  }
  return { email: winner.Email, displayName: winner.ShortName };
}
