import { SiteApi, generateUUIDv4 } from '../libs/nofbiz/nofbiz.base.js';
import { FULL_SCAN } from './sp-paging.js';

const siteApi = new SiteApi();
const listApi = siteApi.list('InitiativesSharedAccess');

/**
 * Fetches all active shared access records for a specific user.
 * @param {string} email
 * @returns {Promise<Array>}
 */
export async function getSharedWithMe(email) {
  return listApi.getItems({ SharedWithEmail: email, Status: 'active' }, FULL_SCAN);
}

/**
 * Checks whether a specific user has active shared access to an initiative.
 * @param {string} initiativeUUID
 * @param {string} email
 * @returns {Promise<boolean>}
 */
export async function isSharedWith(initiativeUUID, email) {
  const records = await listApi.getItems({
    InitiativeUUID: initiativeUUID,
    SharedWithEmail: email,
    Status: 'active',
  });
  return records.length > 0;
}

/**
 * Returns the active share access type for a user on an initiative, or null if none.
 * @param {string} initiativeUUID
 * @param {string} email
 * @returns {Promise<'collaborate' | 'read' | null>}
 */
export async function getShareAccessType(initiativeUUID, email) {
  const records = await listApi.getItems({
    InitiativeUUID: initiativeUUID,
    SharedWithEmail: email,
    Status: 'active',
  });
  return records[0]?.Type || null;
}

/**
 * Shares an initiative with a user.
 * @param {string} initiativeUUID
 * @param {{ email: string, displayName: string }} sharedWith
 * @param {{ email: string, displayName: string }} sharedBy
 * @param {string} [type='read'] - 'read' or 'collaborate'
 * @returns {Promise<unknown>}
 */
export async function shareInitiative(initiativeUUID, sharedWith, sharedBy, type = 'read') {
  return listApi.createItem({
    Title: sharedWith.email || sharedWith.displayName,
    UUID: generateUUIDv4(),
    InitiativeUUID: initiativeUUID,
    SharedWith: sharedWith,
    SharedWithEmail: sharedWith.email,
    SharedBy: sharedBy,
    SharedByEmail: sharedBy.email,
    Type: type,
    Status: 'active',
    SharedDate: new Date().toISOString(),
  });
}

/**
 * Soft-revokes a sharing record (sets Status to 'revoked').
 * @param {number} id
 * @param {string} etag
 * @returns {Promise<unknown>}
 */
export async function revokeAccess(id, etag) {
  return listApi.updateItem(id, { Status: 'revoked' }, etag);
}

/**
 * Hard-deletes a sharing record.
 * @param {number} id
 * @param {string} etag
 * @returns {Promise<unknown>}
 */
export async function unshareInitiative(id, etag) {
  return listApi.deleteItem(id, etag);
}

/**
 * Fetches all sharing records for an initiative regardless of status or user (for cascade delete).
 * @param {string} initiativeUUID
 * @returns {Promise<Array>}
 */
export async function getAllByInitiative(initiativeUUID) {
  return listApi.getItems({ InitiativeUUID: initiativeUUID }, FULL_SCAN);
}
