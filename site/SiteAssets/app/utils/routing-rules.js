import { getGestorMap, pickTeamHead } from './org-hierarchy-api.js';
import { annualizeSavings, GESTOR_CATEGORIES } from './constants.js';

const EXEC = 'Executive';
const TOP_MGMT = 'Top Management';
const MGMT = 'Management';

function climbToFirstMgmt(ancestors) {
  // ancestors ordered CEO -> self; skip self (last) and climb upward
  for (let i = ancestors.length - 2; i >= 0; i--) {
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
  return climbToFirstMgmt(ancestors);
}

function escalate(base, ancestors) {
  if (!base) return null;
  if (base.Category === EXEC) return base;
  const idx = ancestors.findIndex(a => a.Title === base.Title);
  return ancestors[idx - 1] || base;
}

/**
 * Determines which Gestor should validate based on routing rules.
 * @param {string} savingType
 * @param {string|number} savingEstimate
 * @param {string} impactedTeamOUID
 * @param {string} [timePeriod='Anual'] - Time period for annualization
 * @returns {Promise<{ email: string, displayName: string } | null>}
 */
export async function getAssignedGestor(savingType, savingEstimate, impactedTeamOUID, timePeriod) {
  if (!impactedTeamOUID) return null;
  const value = annualizeSavings(savingEstimate, timePeriod || 'Anual');
  const isHighTier = savingType === 'Hard Cost' || value >= 10000;

  const { byId, byOUID, comexFallback } = await getGestorMap();
  const responsible = pickTeamHead(byOUID.get(impactedTeamOUID));
  if (!responsible) return comexFallback;

  const ancestors = (responsible.AncestorPath || responsible.Title)
    .split('|')
    .map(id => byId.get(id))
    .filter(Boolean);
  if (ancestors.length === 0) return comexFallback;

  const base = findBase(responsible, ancestors);
  const winner = isHighTier ? escalate(base, ancestors) : base;
  if (!winner) return comexFallback;
  return { email: winner.Email, displayName: winner.ShortName };
}
