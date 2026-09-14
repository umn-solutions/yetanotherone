import { Text, Container, UserIdentity, __dayjs } from '../libs/nofbiz/nofbiz.base.js';

/**
 * Extracts the owner display name from an item's Owner field.
 * @param {object} item
 * @returns {string}
 */
export function ownerName(item) {
  const id = UserIdentity.fromField(item.SubmittedBy);
  return id ? id.displayName : '---';
}

/**
 * Extracts the mentor display name from an item's Mentor field.
 * @param {object} item
 * @returns {string}
 */
export function mentorName(item) {
  const id = UserIdentity.fromField(item.Mentor);
  return id ? id.displayName : '---';
}

/**
 * Extracts the gestor display name from an item's GestorValidator field.
 * @param {object} item
 * @returns {string}
 */
export function gestorName(item) {
  const id = UserIdentity.fromField(item.GestorValidator);
  return id ? id.displayName : '---';
}

/**
 * Returns the number of days since the given date string.
 * @param {string} dateStr
 * @returns {number}
 */
export function daysPending(dateStr) {
  if (!dateStr) return 0;
  return __dayjs().diff(__dayjs(dateStr), 'day');
}

/**
 * Safely parses a JSON array string. Returns [] on failure.
 * Also handles values already parsed to arrays by ListApi.
 * @param {string|Array} val
 * @returns {Array}
 */
export function parseJsonArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.startsWith('[')) {
    try {
      return JSON.parse(val);
    } catch (_) {
      return [];
    }
  }
  return [];
}

/**
 * Builds a KPI card component.
 * @param {string} value
 * @param {string} label
 * @param {boolean} [highlight=false]
 * @returns {Container}
 */
export function buildKpi(value, label, highlight) {
  return new Container(
    [
      new Text(value, { type: 'span', class: 'pace-kpi-value' }),
      new Text(label, { type: 'span', class: 'pace-kpi-label' }),
    ],
    { class: highlight ? 'pace-kpi pace-kpi--highlight' : 'pace-kpi' }
  );
}

