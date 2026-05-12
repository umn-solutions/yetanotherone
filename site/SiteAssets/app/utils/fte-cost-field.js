import {
  FormField,
  FieldLabel,
  NumberInput,
  Text,
} from '../libs/nofbiz/nofbiz.base.js';

import { hasAnyProfile } from './roles.js';
import { buildReadOnlyRow, formatEur } from './financial-forms.js';

/**
 * Single source of truth for the FTE annual cost field across modals.
 *
 * Visibility: only mentor/gestor see/persist the value. Colaborador never sees
 * the input or the read-only row, and never writes FTEAnnualCost on save.
 *
 * Three resolved states:
 *  - colaborador          : hidden, no field, totalsOpt = 0, save returns undefined
 *  - mentor/gestor + edit : NumberInput row, live FormField, totalsOpt = field, save returns string
 *  - mentor/gestor + view : read-only row, no field, totalsOpt = parsed number, save returns undefined
 */

/**
 * Role predicate. Anything other than colaborador-only sees the FTE cost.
 * @returns {boolean}
 */
export function canViewFteCost() {
  return hasAnyProfile(['mentor', 'gestor']);
}

/**
 * @typedef {Object} FteCostController
 * @property {FormField|null} field        Live FormField when editable, else null.
 * @property {FormField|number} totalsOpt  Pass directly to buildTotalsPanel as `fteAnnualCost`.
 * @property {import('../libs/nofbiz/nofbiz.base.js').HTMDElement|null} displayRow
 *   Render in the modal's shared section. Null when hidden.
 * @property {() => string|undefined} getSaveValue
 *   Stringified value for createItem/updateItem, or undefined to skip the field.
 * @property {() => void} dispose          Cleanup hook for the modal's onClose.
 */

/**
 * Builds the FTE cost field controller for a modal.
 *
 * @param {{ rawValue?: unknown, canEdit?: boolean }} opts
 *   - rawValue: existing FTEAnnualCost from the financials row (string|number|null)
 *   - canEdit:  true when the host modal is in an editing phase
 * @returns {FteCostController}
 */
export function buildFteCostController(opts = {}) {
  const { rawValue, canEdit = false } = opts;
  const parsed = parseFloat(rawValue) || 0;

  if (!canViewFteCost()) {
    return {
      field: null,
      totalsOpt: 0,
      displayRow: null,
      getSaveValue: () => undefined,
      dispose: () => {},
    };
  }

  if (canEdit) {
    const field = new FormField({ value: parsed });
    return {
      field,
      totalsOpt: field,
      displayRow: new FieldLabel(
        'Custo Anual por FTE (EUR)',
        new NumberInput(field, { placeholder: '0', min: 0 }),
      ),
      getSaveValue: () => String(parseFloat(field.value) || 0),
      dispose: () => field.dispose(),
    };
  }

  return {
    field: null,
    totalsOpt: parsed,
    displayRow: buildReadOnlyRow(
      'Custo Anual por FTE',
      new Text(formatEur(parsed), { type: 'span', class: 'pace-detail-value' }),
    ),
    getSaveValue: () => undefined,
    dispose: () => {},
  };
}
