import { SiteApi, generateUUIDv4, ContextStore } from '../libs/nofbiz/nofbiz.base.js';
import { FULL_SCAN } from './sp-paging.js';

const siteApi = new SiteApi();
const listApi = siteApi.list('Comments');

/**
 * Fetches all comments for a specific initiative.
 * @param {string} initiativeUUID
 * @returns {Promise<Array>}
 */
export async function getByInitiative(initiativeUUID) {
  return listApi.getItems({ InitiativeUUID: initiativeUUID }, FULL_SCAN);
}

/**
 * Creates a new comment on an initiative.
 * @param {string} initiativeUUID
 * @param {string} body
 * @returns {Promise<unknown>}
 */
function buildCommentTitle(body) {
  const flat = String(body || '').replace(/\s+/g, ' ').trim();
  if (!flat) return 'Comment';
  return flat.length > 100 ? flat.slice(0, 97) + '...' : flat;
}

export async function createComment(initiativeUUID, body) {
  const user = ContextStore.get('currentUser');
  return listApi.createItem({
    Title: buildCommentTitle(body),
    UUID: generateUUIDv4(),
    InitiativeUUID: initiativeUUID,
    CommentAuthor: { email: user.get('email'), displayName: user.get('displayName') },
    Body: body,
    CommentDate: new Date().toISOString(),
  });
}

/**
 * Hard-deletes a comment record.
 * @param {number} id
 * @param {string} etag
 * @returns {Promise<unknown>}
 */
export async function deleteItem(id, etag) {
  return listApi.deleteItem(id, etag);
}

/**
 * Fetches all comments and returns a Map keyed by InitiativeUUID (1-to-many).
 * @returns {Promise<Map<string, Array>>}
 */
export async function getAllAsMap() {
  const items = await listApi.getItems(undefined, FULL_SCAN);
  const map = new Map();
  for (const item of items) {
    const key = item.InitiativeUUID;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}
