import { Text, Container, Button, UserIdentity, __dayjs } from '../libs/nofbiz/nofbiz.base.js';

/**
 * Parses a saving value string into a number.
 * Strips non-numeric characters except dots.
 * @param {string|number} val
 * @returns {number}
 */
export function parseSaving(val) {
  return parseFloat(String(val).replace(/[^\d.]/g, '')) || 0;
}

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
 * Extracts the text value from a ComboBox FormField.
 * Handles both object { key, text } and plain string values.
 * @param {import('../libs/nofbiz/nofbiz.base.js').FormField} field
 * @returns {string}
 */
export function getComboVal(field) {
  const val = field.value;
  if (val && typeof val === 'object') return val.text;
  return val || '';
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

/**
 * Builds a table header row from an array of column names.
 * @param {string[]} cols
 * @returns {Container}
 */
export function buildTableHeader(cols) {
  return new Container(
    cols.map(
      (col) => new Text(col, { type: 'span', class: 'pace-table-th' })
    ),
    { class: 'pace-table-row pace-table-row--header' }
  );
}

/**
 * Builds a collaboration stub section with a label and placeholder button.
 * @param {string} label
 * @returns {Container}
 */
export function buildCollabStub(label) {
  return new Container(
    [
      new Container(
        [
          new Text(label, { type: 'span' }),
          new Container([], { class: 'pace-split-divider' }),
        ],
        { class: 'pace-split-label' }
      ),
      new Container(
        [
          new Text('Nenhuma colaboração registada.', {
            type: 'p',
            class: 'pace-empty',
          }),
          new Button(`Gerir ${label}`, {
            variant: 'secondary',
            onClickHandler: () => {
              alert(`Colaboração ${label} (placeholder)`);
            },
          }),
        ],
        { class: 'pace-collab-stub' }
      ),
    ],
    { class: 'pace-collab-section' }
  );
}
