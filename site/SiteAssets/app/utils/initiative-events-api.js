import { SiteApi, SystemError, generateUUIDv4, ContextStore } from '../libs/nofbiz/nofbiz.base.js';
import { FULL_SCAN } from './sp-paging.js';
import { EVENT_TYPES } from './constants.js';

const siteApi = new SiteApi();
const listApi = siteApi.list('InitiativeEvents');

const VALID_EVENT_TYPES = new Set(Object.values(EVENT_TYPES));

function assertValidEventType(value) {
  if (value === undefined || value === null || value === '') return;
  if (!VALID_EVENT_TYPES.has(value)) {
    throw new SystemError(
      'InvalidEventType',
      `Invalid EventType value: "${value}". Must be one of: ${[...VALID_EVENT_TYPES].join(', ')}.`,
    );
  }
}

function buildEventTitle(eventType, fromStatus, toStatus) {
  if (fromStatus && toStatus && fromStatus !== toStatus) {
    return `${eventType}: ${fromStatus} -> ${toStatus}`;
  }
  return eventType;
}

/**
 * Creates a new initiative event record.
 * @param {string} initiativeUUID
 * @param {string} eventType - One of EVENT_TYPES values
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {string} [comment='']
 * @param {Object} [extraFields={}] - Additional fields to persist on the event (e.g. ValidationLabel)
 * @returns {Promise<unknown>}
 */
export async function createEvent(initiativeUUID, eventType, fromStatus, toStatus, comment = '', extraFields = {}) {
  assertValidEventType(eventType);
  const user = ContextStore.get('currentUser');
  return listApi.createItem({
    Title: buildEventTitle(eventType, fromStatus, toStatus),
    UUID: generateUUIDv4(),
    InitiativeUUID: initiativeUUID,
    EventType: eventType,
    FromStatus: fromStatus || '',
    ToStatus: toStatus || '',
    Comment: comment,
    Actor: { email: user.get('email'), displayName: user.get('displayName') },
    ActorEmail: user.get('email'),
    Date: new Date().toISOString(),
    ...extraFields,
  });
}

/**
 * Fetches all events for a specific initiative.
 * @param {string} initiativeUUID
 * @returns {Promise<Array>}
 */
export async function getByInitiative(initiativeUUID) {
  return listApi.getItems({ InitiativeUUID: initiativeUUID }, FULL_SCAN);
}

/**
 * Fetches all events of a specific type.
 * @param {string} eventType
 * @returns {Promise<Array>}
 */
export async function getByEventType(eventType) {
  return listApi.getItems({ EventType: eventType }, FULL_SCAN);
}

/**
 * Fetches events for a specific initiative filtered by event type.
 * @param {string} initiativeUUID
 * @param {string} eventType
 * @returns {Promise<Array>}
 */
export async function getByInitiativeAndType(initiativeUUID, eventType) {
  return listApi.getItems({ InitiativeUUID: initiativeUUID, EventType: eventType }, FULL_SCAN);
}

/**
 * Fetches events of a specific type performed by a specific actor.
 * Both filter columns are indexed.
 * @param {string} eventType
 * @param {string} actorEmail
 * @returns {Promise<Array>}
 */
export async function getByEventTypeAndActor(eventType, actorEmail) {
  return listApi.getItems({ EventType: eventType, ActorEmail: actorEmail }, FULL_SCAN);
}

/**
 * Hard-deletes an event record.
 * @param {number} id
 * @param {string} etag
 * @returns {Promise<unknown>}
 */
export async function deleteItem(id, etag) {
  return listApi.deleteItem(id, etag);
}

/**
 * Fetches all events and returns a Map keyed by InitiativeUUID (1-to-many).
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
