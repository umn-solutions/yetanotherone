import { SiteApi, SystemError, ContextStore } from '../libs/nofbiz/nofbiz.base.js';
import { emailEquals } from './email-helpers.js';
import { FULL_SCAN } from './sp-paging.js';

const listApi = new SiteApi().list('MentorTeams');

// ---------------------------------------------------------------------------
// Internal cache (module-level, shared between getMentorForTeam and findTeamConflicts)
// ---------------------------------------------------------------------------

let _allCache = null;

/**
 * Returns all MentorTeams records, using the module-level cache.
 * @returns {Promise<Array>}
 */
async function fetchAll() {
  if (_allCache) return _allCache;
  const items = await listApi.getItems(undefined, FULL_SCAN);
  _allCache = items.map(parseItem);
  return _allCache;
}

/**
 * Invalidates the getMentorForTeam / findTeamConflicts shared cache.
 * Must be called after any create, update, or delete.
 */
export function invalidateMentorTeamsCache() {
  _allCache = null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Normalizes a Teams field value to string[].
 * ListApi auto-parses stored JSON, so the value may already be an array or
 * collapsed scalar (single-element numeric array collapses to a number).
 * Calling fromFieldValue on an already-parsed value double-parses and corrupts
 * single-element numeric arrays (["1001"] -> 1001 -> breaks Array.isArray checks).
 * This function handles all possible shapes defensively.
 * @param {*} value
 * @returns {string[]}
 */
function normalizeTeams(value) {
  if (value === null || value === undefined || value === '') return [];
  // Still a raw JSON string (not yet auto-parsed by ListApi)
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeTeams(parsed);
    } catch (err) {
      console.warn('[mentor-teams-api/normalizeTeams] JSON.parse failed, wrapping raw value', { value, err });
      return value ? [String(value)] : [];
    }
  }
  // Already an array (normal case after auto-parse)
  if (Array.isArray(value)) {
    return value.map(String);
  }
  // Collapsed scalar (e.g. number 1001 from single-element numeric array bug)
  return [String(value)];
}

/**
 * Normalizes a Mentor field value to a plain object.
 * @param {*} value
 * @returns {object}
 */
function normalizeMentor(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) || {};
    } catch (err) {
      console.warn('[mentor-teams-api/normalizeMentor] JSON.parse failed, using empty object', { value, err });
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

/**
 * Parses a raw SP item into a normalized MentorTeams record.
 * Teams is always string[], Mentor is always a plain object.
 * @param {object} raw
 * @returns {object}
 */
function parseItem(raw) {
  return {
    ...raw,
    Mentor: normalizeMentor(raw.Mentor),
    Teams: normalizeTeams(raw.Teams),
  };
}

// ---------------------------------------------------------------------------
// LastModified stamping (mirrors savings-targets-api pattern)
// ---------------------------------------------------------------------------

function buildLastModifiedPayload() {
  const currentUser = ContextStore.get('currentUser');
  const now = new Date().toISOString();
  return {
    LastModifiedBy: currentUser
      ? JSON.stringify({ email: currentUser.get('email'), displayName: currentUser.get('displayName') })
      : '',
    LastModifiedByEmail: currentUser ? currentUser.get('email') : '',
    LastModifiedDate: now,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns all MentorTeams records (Teams as string[], Mentor as object).
 * @returns {Promise<Array>}
 */
export async function getAllMentorTeams() {
  const items = await listApi.getItems(undefined, FULL_SCAN);
  return items.map(parseItem);
}

/**
 * Returns the MentorTeams record for a given mentor email, or null if absent.
 * @param {string} email
 * @returns {Promise<object|null>}
 */
export async function getMentorTeamsByEmail(email) {
  const [item] = await listApi.getItemByTitle(email);
  return item ? parseItem(item) : null;
}

/**
 * Creates a new MentorTeams record.
 * Throws SystemError('DuplicateMentor', ..., { breaksFlow: false }) if a record
 * for that mentor email already exists.
 * @param {{ mentor: { email: string, displayName: string }, teams: string[] }} payload
 * @returns {Promise<void>}
 */
export async function createMentorTeams({ mentor, teams }) {
  const existing = await getMentorTeamsByEmail(mentor.email);
  if (existing) {
    throw new SystemError(
      'DuplicateMentor',
      `Já existe uma configuração de equipas para o mentor ${mentor.displayName}.`,
      { breaksFlow: false }
    );
  }

  await listApi.createItem({
    Title: mentor.email,
    MentorEmail: mentor.email,
    Mentor: JSON.stringify({ email: mentor.email, displayName: mentor.displayName }),
    Teams: JSON.stringify(teams),
    ...buildLastModifiedPayload(),
  });

  invalidateMentorTeamsCache();
}

/**
 * Updates an existing MentorTeams record (partial MERGE — teams only).
 * @param {number} id
 * @param {{ teams: string[] }} fields
 * @param {string} etag
 * @returns {Promise<void>}
 */
export async function updateMentorTeams(id, { teams }, etag) {
  await listApi.updateItem(id, {
    Teams: JSON.stringify(teams),
    ...buildLastModifiedPayload(),
  }, etag);

  invalidateMentorTeamsCache();
}

/**
 * Deletes a MentorTeams record.
 * @param {number} id
 * @param {string} etag
 * @returns {Promise<void>}
 */
export async function deleteMentorTeams(id, etag) {
  await listApi.deleteItem(id, etag);
  invalidateMentorTeamsCache();
}

/**
 * Returns the mentor assigned to a given team OUID, or null if none.
 * Uses the shared module-level cache; invalidate with invalidateMentorTeamsCache()
 * after any write.
 * @param {string} ouid
 * @returns {Promise<{ email: string, displayName: string } | null>}
 */
export async function getMentorForTeam(ouid) {
  if (!ouid) return null;
  try {
    const all = await fetchAll();
    const record = all.find(r => Array.isArray(r.Teams) && r.Teams.includes(ouid));
    if (!record || !record.Mentor || !record.Mentor.email) return null;
    return { email: record.Mentor.email, displayName: record.Mentor.displayName || record.Mentor.email };
  } catch (err) {
    console.warn('[mentor-teams-api/getMentorForTeam] lookup failed, returning null', { ouid, err });
    return null;
  }
}

/**
 * Returns which of the requested team OUIDs are already claimed by a DIFFERENT mentor.
 * Used by the admin UI for uniqueness enforcement before saving.
 * @param {string[]} teams - OUIDs being requested
 * @param {string} excludeEmail - Mentor email to exclude from conflict detection (the one being edited)
 * @returns {Promise<Array<{ ouid: string, mentorEmail: string, mentorName: string }>>}
 */
export async function findTeamConflicts(teams, excludeEmail) {
  if (!teams || teams.length === 0) return [];
  const all = await fetchAll();
  const conflicts = [];
  for (const ouid of teams) {
    const record = all.find(r =>
      !emailEquals(r.MentorEmail, excludeEmail) &&
      Array.isArray(r.Teams) &&
      r.Teams.includes(ouid)
    );
    if (record) {
      conflicts.push({
        ouid,
        mentorEmail: record.MentorEmail,
        mentorName: record.Mentor?.displayName || record.MentorEmail,
      });
    }
  }
  return conflicts;
}
