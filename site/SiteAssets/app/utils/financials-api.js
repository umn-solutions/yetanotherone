import { SiteApi, generateUUIDv4, ContextStore } from '../libs/nofbiz/nofbiz.base.js';
import { FULL_SCAN } from './sp-paging.js';

const siteApi = new SiteApi();
const listApi = siteApi.list('InitiativesFinancials');

/**
 * Fetches the financials record for an initiative (at most one per initiative).
 * @param {string} initiativeUUID
 * @returns {Promise<Object|null>}
 */
export async function getByInitiative(initiativeUUID) {
  const items = await listApi.getItems({ InitiativeUUID: initiativeUUID });
  return items.length > 0 ? items[0] : null;
}

/**
 * Creates a financials record for an initiative.
 * @param {string} initiativeUUID
 * @param {Record<string, unknown>} fields
 * @returns {Promise<unknown>}
 */
export async function create(initiativeUUID, fields) {
  const user = ContextStore.get('currentUser');
  return listApi.createItem({
    Title: `Financials: ${initiativeUUID}`,
    UUID: generateUUIDv4(),
    InitiativeUUID: initiativeUUID,
    ...fields,
    LastModifiedBy: { email: user.get('email'), displayName: user.get('displayName') },
    LastModifiedByEmail: user.get('email'),
    LastModifiedDate: new Date().toISOString(),
  });
}

/**
 * Fetches all financials records and returns a Map keyed by InitiativeUUID.
 * @returns {Promise<Map<string, Object>>}
 */
export async function getAllAsMap() {
  const items = await listApi.getItems(undefined, FULL_SCAN);
  const map = new Map();
  for (const item of items) {
    map.set(item.InitiativeUUID, item);
  }
  return map;
}

/**
 * Updates a financials record.
 * @param {number} id
 * @param {Record<string, unknown>} fields
 * @param {string} etag
 * @returns {Promise<unknown>}
 */
export async function update(id, fields, etag) {
  const user = ContextStore.get('currentUser');
  return listApi.updateItem(id, {
    ...fields,
    LastModifiedBy: { email: user.get('email'), displayName: user.get('displayName') },
    LastModifiedByEmail: user.get('email'),
    LastModifiedDate: new Date().toISOString(),
  }, etag);
}

/**
 * Hard-deletes a financials record.
 * @param {number} id
 * @param {string} etag
 * @returns {Promise<unknown>}
 */
export async function deleteItem(id, etag) {
  return listApi.deleteItem(id, etag);
}
