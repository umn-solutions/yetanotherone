import { SiteApi, SystemError, ContextStore, fromFieldValue } from '../libs/nofbiz/nofbiz.base.js';
import { SAVING_CATEGORIES, NO_FINANCIALS_CATEGORIES, HARD_CATEGORIES, SOFT_CATEGORIES } from './constants.js';
import { FULL_SCAN } from './sp-paging.js';

const listApi = new SiteApi().list('SavingsTargets');

/**
 * Financial saving categories (those with actual € targets).
 * Derived at runtime so it stays in sync with constants.js taxonomy.
 */
export const FINANCIAL_CATEGORIES = SAVING_CATEGORIES.filter(
  (c) => !NO_FINANCIALS_CATEGORIES.includes(c)
);

/**
 * Returns the saving type label for a category.
 * @param {string} category
 * @returns {'Hard Cost' | 'Soft Cost'}
 */
export function getCategoryType(category) {
  if (HARD_CATEGORIES.includes(category)) return 'Hard Cost';
  return 'Soft Cost';
}

/**
 * Computes derived totals from a categoryTargets object.
 * Reused by both the table rows and the dialog live summary.
 * @param {Record<string, number>} categoryTargets
 * @returns {{ hardTotal: number, softTotal: number, total: number }}
 */
export function computeTargetTotals(categoryTargets) {
  if (!categoryTargets || typeof categoryTargets !== 'object') {
    return { hardTotal: 0, softTotal: 0, total: 0 };
  }
  let hardTotal = 0;
  let softTotal = 0;
  for (const [cat, val] of Object.entries(categoryTargets)) {
    const num = parseFloat(val) || 0;
    if (HARD_CATEGORIES.includes(cat)) {
      hardTotal += num;
    } else if (SOFT_CATEGORIES.includes(cat)) {
      softTotal += num;
    }
  }
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
    FTETarget: parseFloat(raw.FTETarget) || 0,
    CategoryTargets: fromFieldValue(raw.CategoryTargets) || {},
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
 * @param {{ year: string|number, fteTarget: number, categoryTargets: Record<string, number> }} payload
 * @returns {Promise<void>}
 */
export async function createTarget({ year, fteTarget, categoryTargets }) {
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
    FTETarget: String(fteTarget),
    CategoryTargets: JSON.stringify(categoryTargets),
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
 * @param {{ fteTarget?: number, categoryTargets?: Record<string, number> }} fields
 * @param {string} etag
 * @returns {Promise<void>}
 */
export async function updateTarget(id, fields, etag) {
  const currentUser = ContextStore.get('currentUser');
  const now = new Date().toISOString();

  const payload = {};
  if (fields.fteTarget !== undefined) payload.FTETarget = String(fields.fteTarget);
  if (fields.categoryTargets !== undefined) payload.CategoryTargets = JSON.stringify(fields.categoryTargets);
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
