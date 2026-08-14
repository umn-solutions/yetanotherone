import { getGestorMap, pickTeamHead } from './org-hierarchy-api.js';
import { GESTOR_CATEGORIES } from './constants.js';

const EXEC = 'EXECUTIVE';
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
  if (role === EXEC) return responsible;
  if (role === MGMT) return directManager(ancestors);
  // skip self (last element) when climbing to first management node
  return firstGestorFrom(ancestors, ancestors.length - 2);
}

/**
 * Scans ancestors from startIdx downward and returns the first Executive-category
 * node, stopping BEFORE the root/CEO (index 0) which is never a valid target.
 * @param {Array} ancestors - ordered CEO(root) -> self(last)
 * @param {number} startIdx - index to begin scanning (inclusive)
 * @returns {object|null} null -> high-tier gestor left unassigned (no in-line Executive)
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
 * @returns {object|null} null -> caller leaves the gestor unassigned
 */
function excludeRoot(winner, ancestors) {
  if (winner && ancestors[0] && winner.Title === ancestors[0].Title) {
    return ancestors[1] || null; // null -> caller leaves the gestor unassigned
  }
  return winner;
}

/**
 * Determines which Gestor should validate based on routing rules.
 *
 * Normal initiatives: routes to the team's immediate accountability node (base).
 *
 * High-tier initiatives (>= 10 000 annualised OR Hard Cost): routes to the nearest
 * Executive-category ancestor in the impacted team's OWN line, scanning upward from
 * self (inclusive) and excluding the root/CEO (index 0). If the line has no Executive
 * between the impacted team and the CEO, the gestor is left UNASSIGNED (returns null)
 * -- it is never routed cross-branch.
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

  const { byId, byOUID } = await getGestorMap();
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

  // High-tier: the validator MUST be an Executive. Find the closest Executive in the
  // impacted team's OWN line, above the management tier, excluding the root/CEO. If
  // there is no Executive between the impacted team and the CEO, leave the gestor
  // UNASSIGNED (null) -- never fall back cross-branch.
  if (isHighTier) {
    const exec = firstExecFrom(ancestors, ancestors.length - 1);
    if (!exec) {
      console.warn('[getAssignedGestor] high-tier initiative has no in-line Executive between the impacted team and the CEO -- gestor left unassigned', { impactedTeamOUID, responsible: responsible.Title });
      return null;
    }
    return { email: exec.Email, displayName: exec.ShortName };
  }

  // Normal tier: route to the team's accountability node (base), never the root/CEO.
  // If nothing in-line resolves (e.g. CEO-office single-node chain), leave the gestor
  // UNASSIGNED (null) -- never route cross-branch.
  const winner = excludeRoot(findBase(responsible, ancestors), ancestors);
  if (!winner) {
    console.warn('[getAssignedGestor] no in-line validator resolved for normal-tier initiative -- gestor left unassigned', { impactedTeamOUID, responsible: responsible.Title });
    return null;
  }
  return { email: winner.Email, displayName: winner.ShortName };
}
