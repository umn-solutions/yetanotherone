import { SiteApi, SystemError, ContextStore } from '../libs/nofbiz/nofbiz.base.js';
import { FULL_SCAN } from './sp-paging.js';

const listApi = new SiteApi().list('SavingsTargets');

/**
 * Computes derived totals from a flat target item's savings fields.
 * Maintains the existing consumer contract: { hardTotal, softTotal, total }.
 * @param {object} target - Parsed target item (from parseItem or getTargetByYear/getAllTargets)
 * @returns {{ hardTotal: number, softTotal: number, total: number }}
 */
export function computeTargetTotals(target) {
  const hardTotal = parseFloat(target && target.HardSavingsTarget) || 0;
  const softTotal = parseFloat(target && target.SoftSavingsTarget) || 0;
  return { hardTotal, softTotal, total: hardTotal + softTotal };
}

/**
 * Parses a raw SP item into a normalized target object.
 * @param {object} raw
 * @returns {object}
 */
function parseItem(raw) {
  return {
    ...raw,
    ImplementedTarget: parseInt(raw.ImplementedTarget, 10) || 0,
    HardSavingsTarget: parseFloat(raw.HardSavingsTarget) || 0,
    SoftSavingsTarget: parseFloat(raw.SoftSavingsTarget) || 0,
  };
}

/**
 * Returns all savings target rows, sorted by year descending.
 * @returns {Promise<Array>}
 */
export async function getAllTargets() {
  const items = await listApi.getItems(undefined, FULL_SCAN);
  return items
    .map(parseItem)
    .sort((a, b) => Number(b.Title) - Number(a.Title));
}

/**
 * Returns a single target by year (Title field), or null if absent.
 * @param {string|number} year
 * @returns {Promise<object|null>}
 */
export async function getTargetByYear(year) {
  const [item] = await listApi.getItemByTitle(String(year));
  return item ? parseItem(item) : null;
}

/**
 * Creates a new savings target for the given year.
 * Throws SystemError('DuplicateYear', ..., { breaksFlow: false }) if the year already exists.
 * @param {{ year: string|number, implementedTarget: number, hardSavingsTarget: number, softSavingsTarget: number }} payload
 * @returns {Promise<void>}
 */
export async function createTarget({ year, implementedTarget, hardSavingsTarget, softSavingsTarget }) {
  const existing = await getTargetByYear(year);
  if (existing) {
    throw new SystemError(
      'DuplicateYear',
      `Já existe um objectivo para o ano ${year}.`,
      { breaksFlow: false }
    );
  }

  const currentUser = ContextStore.get('currentUser');
  const now = new Date().toISOString();

  await listApi.createItem({
    Title: String(year),
    ImplementedTarget: String(implementedTarget),
    HardSavingsTarget: String(hardSavingsTarget),
    SoftSavingsTarget: String(softSavingsTarget),
    LastModifiedBy: currentUser
      ? JSON.stringify({ email: currentUser.get('email'), displayName: currentUser.get('displayName') })
      : '',
    LastModifiedByEmail: currentUser ? currentUser.get('email') : '',
    LastModifiedDate: now,
  });
}

/**
 * Updates an existing savings target row (partial MERGE).
 * @param {number} id
 * @param {{ implementedTarget?: number, hardSavingsTarget?: number, softSavingsTarget?: number }} fields
 * @param {string} etag
 * @returns {Promise<void>}
 */
export async function updateTarget(id, fields, etag) {
  const currentUser = ContextStore.get('currentUser');
  const now = new Date().toISOString();

  const payload = {};
  if (fields.implementedTarget !== undefined) payload.ImplementedTarget = String(fields.implementedTarget);
  if (fields.hardSavingsTarget !== undefined) payload.HardSavingsTarget = String(fields.hardSavingsTarget);
  if (fields.softSavingsTarget !== undefined) payload.SoftSavingsTarget = String(fields.softSavingsTarget);
  payload.LastModifiedBy = currentUser
    ? JSON.stringify({ email: currentUser.get('email'), displayName: currentUser.get('displayName') })
    : '';
  payload.LastModifiedByEmail = currentUser ? currentUser.get('email') : '';
  payload.LastModifiedDate = now;

  await listApi.updateItem(id, payload, etag);
}

/**
 * Deletes a savings target row.
 * @param {number} id
 * @param {string} etag
 * @returns {Promise<void>}
 */
export async function deleteTarget(id, etag) {
  await listApi.deleteItem(id, etag);
}
