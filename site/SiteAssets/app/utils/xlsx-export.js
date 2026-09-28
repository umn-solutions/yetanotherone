/**
 * Shared XLSX serialization helpers. Used by the generic initiative export
 * (initiatives-export.js) and the Power BI workbook export (powerbi-export.js).
 */

/**
 * Derives XLSX columns from the keys of the first data row.
 * Safe when data is empty -- returns an empty array.
 * @param {Object[]} data
 * @returns {{ header: string, key: string }[]}
 */
export function columnsFromData(data) {
  if (!data || data.length === 0) return [];
  return Object.keys(data[0]).map((k) => ({ header: k, key: k }));
}

/**
 * Coerces any value to a Power BI-safe scalar (string, number, or boolean).
 * Arrays are joined with "; ". Objects have their most meaningful sub-field
 * extracted, falling back to a plain string representation.
 * @param {*} v
 * @returns {string|number|boolean}
 */
export function toScalar(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    return v.map((item) => {
      if (item === null || item === undefined) return '';
      if (typeof item === 'object') return item.displayName || item.label || item.email || item.value || JSON.stringify(item);
      return String(item);
    }).join('; ');
  }
  // Object: extract the most meaningful readable field
  if (typeof v === 'object') {
    return v.displayName || v.label || v.email || v.name || v.value || v.Title || String(v);
  }
  return String(v);
}

/**
 * Applies toScalar to every value in a row object.
 * Guarantees Power BI table compatibility (no nested objects/arrays).
 * @param {Object} row
 * @returns {Object}
 */
export function scalarizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = toScalar(v);
  }
  return out;
}
