import {
  Container,
  Text,
  NumberInput,
  ComboBox,
  FormField,
  FormSchema,
  FieldLabel,
  Button,
  TabGroup,
  View,
  SystemError,
  __zod,
} from '../libs/nofbiz/nofbiz.base.js';

import {
  ANNUALIZATION_FACTORS,
  SAVING_CATEGORIES,
  HARD_CATEGORIES,
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  CATEGORY_DIRECTIONS,
  CATEGORY_FIELD_NAMES,
  deriveSavingType,
} from './constants.js';

import { createTagsToggle, createSegmentedToggle } from './tags-toggle.js';

import { STATUS } from './status-helpers.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Label constants -- still useful in display code. */
export const FINANCIAL_TYPES = {
  EFICIENCIA: 'Eficiencia',
  PRODUCAO:   'Producao',
  GASTOS_GERAIS: 'GastosGerais',
};

/**
 * Per-category input field keys.
 * Eficiencia: vp (Volume processado), tu (Tempo tratamento unitario)
 * Producao:   vp (Volume), mu (Montante medio unitario), tt (Taxa de transformacao %)
 * Gastos:     v  (Volume), c  (Custo unitario)
 */
const INPUT_KEYS_BY_CATEGORY = {
  eficiencia: ['vp', 'tu'],
  producao:   ['vp', 'mu', 'tt'],
  gastos:     ['v', 'c'],
};

/** Human-readable labels for each input field, keyed by category then input key. */
const INPUT_LABELS_BY_CATEGORY = {
  eficiencia: {
    vp: 'Volume de Unidades Processadas',
    tu: 'Tempo Médio por Unidade (min)',
  },
  producao: {
    vp: 'Volume de Unidades',
    mu: 'Valor Médio por Unidade (EUR)',
    tt: 'Taxa de Transformação (%)',
  },
  gastos: {
    v: 'Volume de Unidades',
    c: 'Custo Unitário (EUR)',
  },
};

/** Per-input unit suffix. Empty string = no unit (raw counts/volumes). */
const INPUT_UNITS_BY_CATEGORY = {
  eficiencia: { vp: '',  tu: 'min' },
  producao:   { vp: '',  mu: 'Eur', tt: '%' },
  gastos:     { v:  '',  c:  'Eur' },
};

/** Per-category total unit. */
const CATEGORY_TOTAL_UNIT = {
  eficiencia: 'min',
  producao:   'Eur',
  gastos:     'Eur',
};

// ---------------------------------------------------------------------------
// Shared display helpers (exported -- reused by consumers)
// ---------------------------------------------------------------------------

/**
 * Formats a value for display. Returns '-' for empty/null values,
 * locale-formatted number for numeric values, or the raw string.
 * @param {*} val
 * @returns {string}
 */
export function displayValue(val) {
  if (val === null || val === undefined || val === '') return '-';
  const n = parseFloat(val);
  if (isNaN(n)) return String(val);
  return n.toLocaleString('pt-PT');
}

/**
 * Like displayValue, but appends a unit suffix (with leading space) when both
 * the value renders as something other than '-' and a non-empty unit is provided.
 * @param {*} val
 * @param {string} unit
 * @returns {string}
 */
export function displayValueWithUnit(val, unit) {
  const formatted = displayValue(val);
  if (formatted === '-' || !unit) return formatted;
  return formatted + ' ' + unit;
}

/**
 * Parses an existing stored value back to a number suitable for a NumberInput,
 * or returns empty string if not parseable.
 * @param {*} val
 * @returns {number|string}
 */
export function parseInitial(val) {
  if (val === null || val === undefined || val === '') return '';
  const n = parseFloat(val);
  return isNaN(n) ? '' : n;
}

/**
 * Wraps a FieldLabel around a label string and an input component.
 * @param {string} label
 * @param {import('../libs/nofbiz/nofbiz.base.js').HTMDElement} input
 * @returns {FieldLabel}
 */
export function buildEditableRow(label, input) {
  return new FieldLabel(label, input);
}

/**
 * Builds a read-only display row with a label and a value component.
 * @param {string} label
 * @param {import('../libs/nofbiz/nofbiz.base.js').HTMDElement|string} valueComponent
 * @param {string} [extraClass] - Optional modifier class (e.g. 'pace-detail-row--total')
 * @returns {Container}
 */
export function buildReadOnlyRow(label, valueComponent, extraClass) {
  const cls = extraClass ? `pace-detail-row ${extraClass}` : 'pace-detail-row';
  return new Container([
    new Text(label, { type: 'span', class: 'pace-detail-label' }),
    valueComponent,
  ], { class: cls });
}

/**
 * Returns the annualization factor for a given time period string,
 * or 0 if the period is not recognized.
 * @param {string} timePeriod
 * @returns {number}
 */
export function getAnnualizationFactor(timePeriod) {
  return ANNUALIZATION_FACTORS[timePeriod] || 0;
}

/**
 * Formats a decimal FTE value with 2 decimal places.
 * @param {number} val
 * @returns {string}
 */
export function formatFte(val) {
  if (!val || isNaN(val)) return '0,00';
  return val.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formats a EUR monetary value with 2 decimal places.
 * @param {number} val
 * @returns {string}
 */
export function formatEur(val) {
  if (!val || isNaN(val)) return '0,00 Eur';
  return val.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Eur';
}

/**
 * Extracts the plain string value from a ComboBox FormField.
 * Handles both { label, value } objects and plain strings.
 * @param {FormField} field
 * @returns {string}
 */
export function extractComboValue(field) {
  const val = field.value;
  if (val && typeof val === 'object' && !Array.isArray(val)) return String(val.value || '');
  return String(val || '');
}

/**
 * Extracts an array of label strings from a multi-select ComboBox FormField.
 * @param {FormField} field
 * @returns {string[]}
 */
export function extractCategoryLabels(field) {
  const val = field.value;
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  return arr.map(item => {
    if (item && typeof item === 'object') return item.label || item.value || '';
    return String(item || '');
  }).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Internal numeric helper
// ---------------------------------------------------------------------------

/** Coerces any value to a float, returning 0 for invalid input. */
function num(v) {
  return parseFloat(v) || 0;
}

// ---------------------------------------------------------------------------
// Per-category total formula
// ---------------------------------------------------------------------------

/**
 * Computes the raw period total for a single phase object belonging to a category.
 * @param {string} key - Category key ('eficiencia'|'producao'|'gastos')
 * @param {Object} phase - Phase object with FormField values (asIs/toBe sub-object)
 * @returns {number}
 */
function computePhaseTotal(key, phase) {
  if (key === 'eficiencia') return num(phase.vp.value) * num(phase.tu.value);
  if (key === 'producao')   return num(phase.vp.value) * num(phase.mu.value) * (num(phase.tt.value) / 100);
  if (key === 'gastos')     return num(phase.v.value) * num(phase.c.value);
  return 0;
}

// ---------------------------------------------------------------------------
// Lifecycle authority
// ---------------------------------------------------------------------------

/**
 * Single source of truth for which phases are editable at each initiative status.
 * Both asIs and toBe are editable across all non-locked statuses for users with
 * write access. toBe optionality (vs mandatory) is enforced at transition time
 * (declareSavings, resubmitInitiative), not here.
 *
 * @param {string} status - Current initiative status (STATUS.* constant)
 * @returns {{ asIs: boolean, toBe: boolean }}
 */
export function getPhaseEditability(status) {
  switch (status) {
    case STATUS.RASCUNHO:
    case STATUS.SUBMETIDO:
    case STATUS.VALIDADO_MENTOR:
    case STATUS.EM_EXECUCAO:
    case STATUS.EM_REVISAO:
      return { asIs: true, toBe: true };
    default:
      return { asIs: false, toBe: false };
  }
}

// Legacy compatibility: early records seeded the projected phase under
// `estimated` before the schema was finalized as `toBe`. Treat it as a
// transparent fallback so existing rows do not get stuck in EM_REVISAO.
function getToBePhase(payload) {
  if (!payload) return null;
  return payload.toBe || payload.estimated || null;
}

/**
 * Validates that every enabled category has a complete toBe phase
 * (all input fields present and > 0). Used as the gate for transitions
 * that mark savings as ready for validation (declareSavings, resubmit
 * targeting POR_VALIDAR).
 *
 * @param {Object|null} financials - Financials row from SP (auto-parsed)
 * @throws {SystemError} name='IncompleteFinancials', breaksFlow:false
 */
export function assertToBeComplete(financials) {
  if (!financials) return;
  const enabled = Array.isArray(financials.EnabledCategories) ? financials.EnabledCategories : [];
  if (enabled.length === 0) return;
  for (const key of enabled) {
    if (!CATEGORY_KEYS.includes(key)) continue;
    const fieldName = CATEGORY_FIELD_NAMES[key];
    const payload = financials[fieldName];
    const inputKeys = INPUT_KEYS_BY_CATEGORY[key] || [];
    const toBe = getToBePhase(payload);
    const incomplete = !toBe || inputKeys.some(ik => {
      const v = toBe[ik];
      return v == null || v === '' || !(parseFloat(v) > 0);
    });
    if (incomplete) {
      throw new SystemError(
        'IncompleteFinancials',
        'Preencha todos os valores To-Be da categoria "' + (CATEGORY_LABELS[key] || key) + '" antes de pedir validação.',
        { breaksFlow: false },
      );
    }
  }
}

/** Plain-payload variant of computePhaseTotal — operates on raw {vp,tu,...} object. */
function computeRawPhaseTotal(key, phaseObj) {
  if (!phaseObj) return 0;
  const v = (x) => parseFloat(x) || 0;
  if (key === 'eficiencia') return v(phaseObj.vp) * v(phaseObj.tu);
  if (key === 'producao')   return v(phaseObj.vp) * v(phaseObj.mu) * (v(phaseObj.tt) / 100);
  if (key === 'gastos')     return v(phaseObj.v)  * v(phaseObj.c);
  return 0;
}

/**
 * Computes the annualized toBe total in EUR across all enabled categories.
 * Used by routing rules to decide gestor assignment based on financial impact.
 *
 * @param {Object|null} financials - Financials row from SP (auto-parsed)
 * @returns {number} Annualized EUR total (0 if no data)
 */
export function computeAnnualizedToBeTotalEur(financials) {
  if (!financials) return 0;
  const enabled = Array.isArray(financials.EnabledCategories) ? financials.EnabledCategories : [];
  const factor = getAnnualizationFactor(financials.TimePeriod || '') || 1;
  const fteCost = parseFloat(financials.FTEAnnualCost) || 0;

  let totalEur = 0;
  for (const key of enabled) {
    if (!CATEGORY_KEYS.includes(key)) continue;
    const fieldName = CATEGORY_FIELD_NAMES[key];
    const payload = financials[fieldName];
    const raw = computeRawPhaseTotal(key, getToBePhase(payload));
    if (key === 'eficiencia') {
      // Eficiencia raw is minutes per period -> annualized minutes -> FTE-years -> EUR
      totalEur += ((raw * factor) / 120960) * fteCost;
    } else {
      totalEur += raw * factor;
    }
  }
  return totalEur;
}

// ---------------------------------------------------------------------------
// State factory
// ---------------------------------------------------------------------------

/**
 * Creates a category state object holding FormFields for both phases (asIs, toBe).
 * FormFields are always created (regardless of stored data) -- the serialize
 * step decides which phases to persist.
 *
 * @param {string} key - Category key ('eficiencia'|'producao'|'gastos')
 * @param {Object|null} storedPayload - Already-parsed JSON payload from SP (or null)
 * @param {{ asIs: boolean, toBe: boolean }} editability
 * @returns {CategoryState}
 */
export function createCategoryState(key, storedPayload, editability) {
  const payload = storedPayload || {};
  const inputKeys = INPUT_KEYS_BY_CATEGORY[key];

  function makePhase(phase) {
    const source = phase === 'toBe' ? getToBePhase(payload) : payload[phase];
    const obj = {};
    for (const ik of inputKeys) {
      obj[ik] = new FormField({ value: parseInitial(source && source[ik]) });
    }
    return obj;
  }

  const asIs = makePhase('asIs');
  const toBe = makePhase('toBe');

  const computed = {
    asIsTotal:      () => computePhaseTotal(key, asIs),
    toBeTotal:      () => computePhaseTotal(key, toBe),
    realizedSaving: () => {
      const dir = CATEGORY_DIRECTIONS[key];
      return dir === 'decrease'
        ? computed.asIsTotal() - computed.toBeTotal()
        : computed.toBeTotal() - computed.asIsTotal();
    },
  };

  function dispose() {
    [asIs, toBe].forEach(phase => {
      Object.values(phase).forEach(field => field.dispose());
    });
  }

  return { key, asIs, toBe, computed, dispose, editability };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serializes a category state to a JSON string for SP storage.
 * Returns '' if state is null/undefined (represents absent category).
 * Only phases with at least one non-empty input are written to the payload.
 *
 * @param {CategoryState|null|undefined} state
 * @returns {string}
 */
export function serializeCategory(state) {
  if (!state) return '';
  const payload = {};
  ['asIs', 'toBe'].forEach(phase => {
    const phaseObj = state[phase];
    const collected = {};
    let hasValue = false;
    Object.entries(phaseObj).forEach(([ik, field]) => {
      const n = num(field.value);
      collected[ik] = n;
      // A phase is included when any field has a non-empty, non-null string value
      // (even if that value happens to coerce to 0, we preserve explicit user input
      // that is a non-empty string -- but a literal 0 entered by the user still counts)
      if (field.value !== '' && field.value !== null && field.value !== undefined) {
        hasValue = true;
      }
    });
    if (hasValue) payload[phase] = collected;
  });
  return JSON.stringify(payload);
}

/**
 * True when at least one input field in the phase has a non-empty stored value.
 * Mirrors the predicate used inside serializeCategory.
 * @param {Object} phaseObj
 * @returns {boolean}
 */
function phaseHasValue(phaseObj) {
  return Object.values(phaseObj).some(f =>
    f.value !== '' && f.value !== null && f.value !== undefined
  );
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

/**
 * Builds a Map of category key -> CategoryState from a financials row.
 * Only categories listed in EnabledCategories are instantiated.
 *
 * @param {Object|null} financials - Financials row (auto-parsed by SPARC)
 * @param {{ asIs: boolean, toBe: boolean }} editability
 * @returns {Map<string, CategoryState>}
 */
export function hydrateCategoryStates(financials, editability) {
  const states = new Map();
  if (!financials) return states;
  const enabled = Array.isArray(financials.EnabledCategories) ? financials.EnabledCategories : [];
  for (const key of enabled) {
    if (!CATEGORY_KEYS.includes(key)) continue;
    const fieldName = CATEGORY_FIELD_NAMES[key];
    const raw = financials[fieldName];
    // raw is auto-parsed by SPARC's field-value layer when it starts with '{' -- it is already an object
    const payload = (raw && typeof raw === 'object') ? raw : null;
    states.set(key, createCategoryState(key, payload, editability));
  }
  return states;
}

// ---------------------------------------------------------------------------
// Per-phase builder helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Renders input rows for a single phase.
 * Returns { rows: HTMDElement[], unsubs: Function[] }.
 * @param {string} key
 * @param {Object} phase - Phase FormField object
 * @param {boolean} editable - Whether inputs should be editable
 * @param {string} [timePeriod] - Optional time period for annualisation
 */
function buildPhaseInputRows(key, phase, editable, timePeriod) {
  const unsubs = [];
  const rows = [];

  const inputKeys = INPUT_KEYS_BY_CATEGORY[key];
  const labels    = INPUT_LABELS_BY_CATEGORY[key];

  if (editable) {
    for (const ik of inputKeys) {
      rows.push(new FieldLabel(labels[ik], new NumberInput(phase[ik], { placeholder: '0', min: 0 })));
    }
  } else {
    for (const ik of inputKeys) {
      const unit = INPUT_UNITS_BY_CATEGORY[key][ik] || '';
      const txt = new Text(displayValueWithUnit(phase[ik].value, unit), { type: 'span', class: 'pace-detail-value' });
      const unsub = phase[ik].subscribe(v => { txt.children = displayValueWithUnit(v, unit); });
      unsubs.push(unsub);
      rows.push(buildReadOnlyRow(labels[ik], txt, 'pace-detail-row--indent'));
    }
  }

  return { rows, unsubs };
}

/**
 * Renders a total row (and optional annualised total row).
 * Returns { rows: HTMDElement[], unsubs: Function[] }.
 * @param {string} key
 * @param {Object} phase - Phase FormField object (to subscribe)
 * @param {Function} totalFn - Computed total getter
 * @param {string} [timePeriod]
 */
function buildTotalRows(key, phase, totalFn, timePeriod) {
  const unsubs = [];
  const rows = [];
  const unit = CATEGORY_TOTAL_UNIT[key] || '';

  const totalTxt = new Text(displayValueWithUnit(totalFn(), unit), { type: 'span', class: 'pace-detail-value' });
  const annTxt   = timePeriod
    ? new Text(displayValueWithUnit(totalFn() * getAnnualizationFactor(timePeriod), unit), { type: 'span', class: 'pace-detail-value' })
    : null;

  function refresh() {
    const t = totalFn();
    totalTxt.children = displayValueWithUnit(t, unit);
    if (annTxt) annTxt.children = displayValueWithUnit(t * getAnnualizationFactor(timePeriod), unit);
  }

  for (const field of Object.values(phase)) {
    unsubs.push(field.subscribe(refresh));
  }

  rows.push(buildReadOnlyRow('Total', totalTxt, 'pace-detail-row--total'));
  if (annTxt) rows.push(buildReadOnlyRow('Total Anual', annTxt, 'pace-detail-row--total'));

  return { rows, unsubs };
}

// ---------------------------------------------------------------------------
// Per-phase public builders
// ---------------------------------------------------------------------------

/**
 * Builds the As-Is form (editable or read-only based on editability).
 *
 * @param {CategoryState} state
 * @param {{ isMentorOrGestor?: boolean, timePeriod?: string, extraInputs?: HTMDElement[] }} [opts]
 * @returns {{ components: HTMDElement[], dispose: () => void }}
 */
export function buildCategoryAsIsForm(state, opts = {}) {
  const { timePeriod, extraInputs = [] } = opts;
  const editable = state.editability.asIs;
  const unsubs = [];

  const { rows: inputRows, unsubs: inputUnsubs } = buildPhaseInputRows(state.key, state.asIs, editable, timePeriod);
  unsubs.push(...inputUnsubs);

  const components = [
    new Container([...inputRows, ...extraInputs], { class: 'pace-form-row' }),
  ];

  return { components, dispose: () => { unsubs.forEach(u => u && u()); } };
}

/**
 * Builds the To-Be form (editable or read-only based on editability).
 * When editable, also shows the derived realizedSaving value (subscribed to
 * both asIs and toBe fields so it stays current).
 *
 * @param {CategoryState} state
 * @param {{ isMentorOrGestor?: boolean, timePeriod?: string }} [opts]
 * @returns {{ components: HTMDElement[], dispose: () => void }}
 */
export function buildCategoryToBeForm(state, opts = {}) {
  const { timePeriod } = opts;
  const editable = state.editability.toBe;
  const unsubs = [];

  const { rows: inputRows, unsubs: inputUnsubs } = buildPhaseInputRows(state.key, state.toBe, editable, timePeriod);
  unsubs.push(...inputUnsubs);

  const components = [
    new Container(inputRows, { class: 'pace-form-row' }),
  ];

  return { components, dispose: () => { unsubs.forEach(u => u && u()); } };
}

/**
 * Builds a read-only summary of both phases (asIs and toBe) for use in the detail side panel.
 * Subscribes to FormFields so values stay live.
 *
 * @param {CategoryState} state
 * @param {{ isMentorOrGestor?: boolean, timePeriod?: string, fteAnnualCost?: number }} [opts]
 * @returns {{ components: HTMDElement[], dispose: () => void }}
 */
export function buildCategoryDisplay(state, opts = {}) {
  const { timePeriod, fteAnnualCost = 0 } = opts;
  const unsubs = [];
  const sectionRows = [];

  function addPhaseSection(phaseLabel, phaseObj, totalFn) {
    const { rows: inputRows, unsubs: inputUnsubs } = buildPhaseInputRows(state.key, phaseObj, false, timePeriod);
    unsubs.push(...inputUnsubs);

    const { rows: totalRows, unsubs: totalUnsubs } = buildTotalRows(state.key, phaseObj, totalFn, timePeriod);
    unsubs.push(...totalUnsubs);

    sectionRows.push(
      new Text(phaseLabel, { type: 'h5', class: 'pace-form-section-title' }),
      ...inputRows,
      ...totalRows,
    );
  }

  addPhaseSection('As-Is', state.asIs, state.computed.asIsTotal);
  const showToBe = phaseHasValue(state.toBe);
  if (showToBe) {
    addPhaseSection('To-Be', state.toBe, state.computed.toBeTotal);
  }

  const components = [
    new Text(CATEGORY_LABELS[state.key], { type: 'h4', class: 'pace-form-section-title' }),
    ...sectionRows,
  ];

  if (showToBe) {
    const savingTxt = new Text(displayValue(state.computed.realizedSaving()), { type: 'span', class: 'pace-detail-value' });
    const refreshSaving = () => { savingTxt.children = displayValue(state.computed.realizedSaving()); };
    for (const field of [...Object.values(state.asIs), ...Object.values(state.toBe)]) {
      unsubs.push(field.subscribe(refreshSaving));
    }
    components.push(buildReadOnlyRow('Saving realizado', savingTxt));
  }

  // Eficiencia: surface the FTE annual cost when set (mentor/gestor input)
  if (state.key === 'eficiencia' && fteAnnualCost > 0) {
    const fteCostTxt = new Text(formatEur(fteAnnualCost), { type: 'span', class: 'pace-detail-value' });
    components.push(buildReadOnlyRow('Custo Anual por FTE', fteCostTxt));
  }

  return { components, dispose: () => { unsubs.forEach(u => u && u()); } };
}

// ---------------------------------------------------------------------------
// Totals panel
// ---------------------------------------------------------------------------

/**
 * Builds the totals panel (logic-only; styling is the caller's concern).
 * Renders two side-by-side blocks: per-period and annualised.
 * FTE rows appear only in the annualised block (FTE is a yearly concept).
 *
 * @param {Map<string, CategoryState>} categoryStates
 * @param {{
 *   phase: 'asIs'|'toBe'|'realized',
 *   timePeriod?: string|FormField,
 *   fteAnnualCost?: number|FormField,
 * }} opts
 * @returns {{ component: Container, refresh: () => void, dispose: () => void }}
 */
export function buildTotalsPanel(categoryStates, opts = {}) {
  const { phase = 'asIs' } = opts;
  const unsubs = [];

  // Detect whether timePeriod is a live FormField or a static string
  const timePeriodOpt = opts.timePeriod;
  const isTimePeriodField = timePeriodOpt != null
    && typeof timePeriodOpt === 'object'
    && typeof timePeriodOpt.subscribe === 'function';
  const getPeriod = isTimePeriodField
    ? () => extractComboValue(timePeriodOpt)
    : () => (timePeriodOpt || '');

  // Detect whether fteAnnualCost is a live FormField or a static number
  const fteOpt = opts.fteAnnualCost;
  const isFteField = fteOpt != null
    && typeof fteOpt === 'object'
    && typeof fteOpt.subscribe === 'function';
  const getFteCost = isFteField
    ? () => parseFloat(fteOpt.value) || 0
    : () => parseFloat(fteOpt) || 0;

  // Computed value accessors
  function getStateValue(key) {
    const state = categoryStates.get(key);
    if (!state) return 0;
    if (phase === 'realized') return state.computed.realizedSaving();
    if (phase === 'asIs')      return state.computed.asIsTotal();
    if (phase === 'toBe')      return state.computed.toBeTotal();
    return 0;
  }

  // -- Per-period block text nodes --
  const pEurProducaoTxt = new Text('', { type: 'span', class: 'pace-detail-value' });
  const pEurGastosTxt   = new Text('', { type: 'span', class: 'pace-detail-value' });
  const pEurTotalTxt    = new Text('', { type: 'span', class: 'pace-detail-value' });
  const pTimeTxt        = new Text('', { type: 'span', class: 'pace-detail-value' });
  const pFteTxt         = new Text('', { type: 'span', class: 'pace-detail-value' });
  const pFteCostTxt     = new Text('', { type: 'span', class: 'pace-detail-value' });

  // -- Annualised block text nodes --
  const aEurProducaoTxt = new Text('', { type: 'span', class: 'pace-detail-value' });
  const aEurGastosTxt   = new Text('', { type: 'span', class: 'pace-detail-value' });
  const aEurTotalTxt    = new Text('', { type: 'span', class: 'pace-detail-value' });
  const aTimeTxt        = new Text('', { type: 'span', class: 'pace-detail-value' });
  const fteTxt          = new Text('', { type: 'span', class: 'pace-detail-value' });
  const fteCostTxt      = new Text('', { type: 'span', class: 'pace-detail-value' });

  // -- Period header label text node (updates when timePeriod field changes) --
  const periodHeaderTxt = new Text('', { type: 'h4', class: 'pace-totals-title' });

  function refresh() {
    const period = getPeriod();
    const factor = getAnnualizationFactor(period) || 1;
    const fteCost = getFteCost();

    const rawProducao   = getStateValue('producao');
    const rawGastos     = getStateValue('gastos');
    const rawEficiencia = getStateValue('eficiencia');

    // Per-period values (no factor)
    const pProducao = rawProducao;
    const pGastos   = rawGastos;
    const pTime     = rawEficiencia;
    const pEficienciaEur = (pTime * fteCost) / 120960;
    const pEurTotal = pProducao + pGastos + pEficienciaEur;

    // Annualised values (multiply by factor)
    const aProducao  = rawProducao   * factor;
    const aGastos    = rawGastos     * factor;
    const aTime      = rawEficiencia * factor;
    const fte        = aTime / 120960;
    const aEficienciaEur = fte * fteCost;
    const aEurTotal  = aProducao + aGastos + aEficienciaEur;

    // Period header
    const periodLabel = period || 'sem período';
    periodHeaderTxt.children = 'Totais (' + periodLabel + ')';

    // Per-period block
    pEurProducaoTxt.children = formatEur(pProducao);
    pEurGastosTxt.children   = formatEur(pGastos);
    pEurTotalTxt.children    = formatEur(pEurTotal);
    pTimeTxt.children        = displayValue(pTime) + ' min';
    pFteTxt.children         = formatFte(fte);
    pFteCostTxt.children     = formatEur(pEficienciaEur);

    // Annualised block
    aEurProducaoTxt.children = formatEur(aProducao);
    aEurGastosTxt.children   = formatEur(aGastos);
    aEurTotalTxt.children    = formatEur(aEurTotal);
    aTimeTxt.children        = displayValue(aTime) + ' min';
    fteTxt.children          = formatFte(fte);
    fteCostTxt.children      = formatEur(aEficienciaEur);
  }

  // Subscribe to all FormFields across enabled categories
  for (const state of categoryStates.values()) {
    for (const phaseObj of [state.asIs, state.toBe]) {
      for (const field of Object.values(phaseObj)) {
        unsubs.push(field.subscribe(refresh));
      }
    }
  }

  // Subscribe to live timePeriod field if provided
  if (isTimePeriodField) {
    unsubs.push(timePeriodOpt.subscribe(refresh));
  }

  // Subscribe to live fteAnnualCost field if provided
  if (isFteField) {
    unsubs.push(fteOpt.subscribe(refresh));
  }

  // -- Per-period block children (only show rows for enabled categories) --
  const hasEficiencia = categoryStates.has('eficiencia');
  const showEficienciaEurRow = hasEficiencia && (isFteField || parseFloat(fteOpt) > 0);
  const hasEur = categoryStates.has('producao') || categoryStates.has('gastos') || showEficienciaEurRow;

  const pEurBlockChildren = [
    new Container([
      new Text('Impacto Financeiro', { type: 'span', class: 'pace-detail-label' }),
      pEurTotalTxt,
    ], { class: 'pace-detail-row pace-detail-row--total' }),
  ];
  if (categoryStates.has('producao')) {
    pEurBlockChildren.push(new Container([
      new Text('Produção', { type: 'span', class: 'pace-detail-label' }),
      pEurProducaoTxt,
    ], { class: 'pace-detail-row pace-detail-row--indent' }));
  }
  if (categoryStates.has('gastos')) {
    pEurBlockChildren.push(new Container([
      new Text('Gastos Gerais', { type: 'span', class: 'pace-detail-label' }),
      pEurGastosTxt,
    ], { class: 'pace-detail-row pace-detail-row--indent' }));
  }
  if (showEficienciaEurRow) {
    pEurBlockChildren.push(new Container([
      new Text('Eficiência (Custo FTE)', { type: 'span', class: 'pace-detail-label' }),
      pFteCostTxt,
    ], { class: 'pace-detail-row pace-detail-row--indent' }));
  }

  const pTimeBlockChildren = [];
  if (hasEficiencia) {
    pTimeBlockChildren.push(
      new Container([
        new Text('Tempo Recuperado', { type: 'span', class: 'pace-detail-label' }),
        pTimeTxt,
      ], { class: 'pace-detail-row pace-detail-row--total' }),
      new Container([
        new Text('FTE equivalente', { type: 'span', class: 'pace-detail-label' }),
        pFteTxt,
      ], { class: 'pace-detail-row pace-detail-row--indent' }),
    );
  }

  const periodBlockChildren = [];
  if (hasEur) {
    periodBlockChildren.push(new Container(pEurBlockChildren, { class: 'pace-totals-block-inner' }));
  }
  if (pTimeBlockChildren.length > 0) {
    periodBlockChildren.push(new Container(pTimeBlockChildren, { class: 'pace-totals-block-inner' }));
  }

  // -- Annualised block children --
  const aEurBlockChildren = [
    new Container([
      new Text('Impacto Financeiro', { type: 'span', class: 'pace-detail-label' }),
      aEurTotalTxt,
    ], { class: 'pace-detail-row pace-detail-row--total' }),
  ];
  if (categoryStates.has('producao')) {
    aEurBlockChildren.push(new Container([
      new Text('Produção', { type: 'span', class: 'pace-detail-label' }),
      aEurProducaoTxt,
    ], { class: 'pace-detail-row pace-detail-row--indent' }));
  }
  if (categoryStates.has('gastos')) {
    aEurBlockChildren.push(new Container([
      new Text('Gastos Gerais', { type: 'span', class: 'pace-detail-label' }),
      aEurGastosTxt,
    ], { class: 'pace-detail-row pace-detail-row--indent' }));
  }
  if (showEficienciaEurRow) {
    aEurBlockChildren.push(new Container([
      new Text('Eficiência (Custo FTE)', { type: 'span', class: 'pace-detail-label' }),
      fteCostTxt,
    ], { class: 'pace-detail-row pace-detail-row--indent' }));
  }

  const aTimeBlockChildren = [];
  if (hasEficiencia) {
    aTimeBlockChildren.push(
      new Container([
        new Text('Tempo Recuperado', { type: 'span', class: 'pace-detail-label' }),
        aTimeTxt,
      ], { class: 'pace-detail-row pace-detail-row--total' }),
      new Container([
        new Text('FTE equivalente', { type: 'span', class: 'pace-detail-label' }),
        fteTxt,
      ], { class: 'pace-detail-row pace-detail-row--indent' }),
    );
  }

  const annualBlockChildren = [];
  if (hasEur) {
    annualBlockChildren.push(new Container(aEurBlockChildren, { class: 'pace-totals-block-inner' }));
  }
  if (aTimeBlockChildren.length > 0) {
    annualBlockChildren.push(new Container(aTimeBlockChildren, { class: 'pace-totals-block-inner' }));
  }

  // -- Assemble the two-block layout --
  const panelChildren = [
    new Container([
      new Container([
        periodHeaderTxt,
        ...periodBlockChildren,
      ], { class: 'pace-totals-block pace-totals-block-period' }),
      new Container([
        new Text('Totais Anuais', { type: 'h4', class: 'pace-totals-title' }),
        ...annualBlockChildren,
      ], { class: 'pace-totals-block pace-totals-block-annual' }),
    ], { class: 'pace-totals-blocks-row' }),
  ];

  const component = new Container(panelChildren, { class: 'pace-totals-panel' });

  // Initial render
  refresh();

  return {
    component,
    refresh,
    dispose: () => { unsubs.forEach(u => u && u()); },
  };
}

// ---------------------------------------------------------------------------
// Shared financial schema factory (DRY across modals)
// ---------------------------------------------------------------------------

const TIME_PERIOD_LABELS = {
  Diario: 'Diário',
  Mensal: 'Mensal',
};
const SAVING_CAT_LABELS = {
  'Outros Benefícios Qualitativos': 'Outros Benefícios Qualitativos',
  'Redução de custos': 'Redução de custos',
  'Aumento de receita': 'Aumento de receita',
  'Redução de risco': 'Redução de risco',
  'Custos e riscos evitados': 'Custos e riscos evitados',
  'Melhoria de qualidade': 'Melhoria de qualidade',
};
const TIME_PERIOD_OPTIONS = Object.keys(ANNUALIZATION_FACTORS).map(k => ({ label: TIME_PERIOD_LABELS[k] || k, value: k }));

/**
 * Builds the shared financial schema (TimePeriod, SavingCategory, optional FTEAnnualCost).
 * Returns a pre-wired schema, the field-label components, and a dispose function.
 * Hydrates from an existing financials row when provided.
 *
 * @param {Object|null} financials - Existing financials row, or null for new
 * @param {{ isMentorOrGestor?: boolean, readOnly?: boolean }} [opts]
 * @returns {{ schema: FormSchema, components: HTMDElement[], dispose: () => void }}
 */
export function buildSharedFinancialSchema(financials, opts = {}) {
  const { isMentorOrGestor = false, readOnly = false } = opts;
  const z = __zod;

  // TimePeriod -- empty for new initiatives so financials remain opt-in;
  // pre-fills from existing financials on edit.
  const existingPeriod = financials?.TimePeriod || '';
  const timePeriodField = new FormField({
    value: existingPeriod
      ? { label: TIME_PERIOD_LABELS[existingPeriod] || existingPeriod, value: existingPeriod }
      : '',
  });

  // SavingCategory -- empty for new initiatives (no auto-touch of financials).
  const rawCats = financials?.SavingCategory;
  const existingCats = Array.isArray(rawCats) ? rawCats : (rawCats ? [rawCats] : []);
  const initialCats = financials ? existingCats.slice() : [];
  const savingCategoryField = new FormField({
    value: initialCats,
  });

  const schemaFields = { timePeriod: timePeriodField, savingCategory: savingCategoryField };

  // FTEAnnualCost -- mentor/gestor only
  let fteField = null;
  if (isMentorOrGestor) {
    fteField = new FormField({ value: parseInitial(financials?.FTEAnnualCost) });
    schemaFields.fteAnnualCost = fteField;
  }

  const schema = new FormSchema(schemaFields);

  const components = [];

  // Inferred SavingType (Hard Cost / Soft Cost / Outros) -- derived from selected categories
  const savingTypeTxt = new Text(deriveSavingType(initialCats), { type: 'span', class: 'pace-detail-value pace-saving-type-value' });
  const inferredUnsubs = [];

  if (readOnly) {
    components.push(
      buildReadOnlyRow('Período', new Text((existingPeriod && (TIME_PERIOD_LABELS[existingPeriod] || existingPeriod)) || '-', { type: 'span', class: 'pace-detail-value' })),
      buildReadOnlyRow('Categorias de Savings', new Text(existingCats.map(c => SAVING_CAT_LABELS[c] || c).join(', ') || '-', { type: 'span', class: 'pace-detail-value' })),
      buildReadOnlyRow('Classificação do Tipo de Saving', savingTypeTxt),
    );
    // Note: Custo Anual por FTE is rendered inside the Eficiencia card by buildCategoryDisplay
  } else {
    components.push(
      new Container([
        new FieldLabel('Categorias de Savings', createTagsToggle(savingCategoryField, { items: SAVING_CATEGORIES, dangerItems: HARD_CATEGORIES }), { class: 'pace-required' }),
        new Container([
          buildReadOnlyRow('Classificação do Tipo de Saving', savingTypeTxt),
          new Text('Nota: "Outros Benefícios Qualitativos" pode não conter dados financeiros. Nesses casos, os campos quantitativos abaixo são opcionais.', { type: 'p', class: 'pace-field-callout' }),
        ], { class: 'pace-field-callout-row' }),
      ], { class: 'pace-saving-cat-group' }),
      new Container([], { as: 'hr', class: 'pace-form-divider' }),
      new Text('Dados Quantitativos', { type: 'h4', class: 'pace-form-section-title' }),
      new Container([
        new FieldLabel('Período de Medição', createSegmentedToggle(timePeriodField, TIME_PERIOD_OPTIONS), { class: 'pace-required' }),
        new Text('Período base sobre o qual os valores de eficiência, produção ou gastos são medidos. Define o factor de anualização (Diário x252, Mensal x12) usado para converter o impacto recorrente em ganho anual.', { type: 'p', class: 'pace-field-callout pace-field-callout--wide' }),
      ], { class: 'pace-field-callout-row pace-field-callout-row--center' }),
    );
    // Note: FTE Anual cost input is rendered inside the Eficiencia tab by buildCategoryTabbedSection

    inferredUnsubs.push(savingCategoryField.subscribe((v) => {
      const arr = Array.isArray(v) ? v : (v ? [v] : []);
      const labels = arr.map(o => (o && typeof o === 'object') ? (o.value || o.label) : o).filter(Boolean);
      savingTypeTxt.children = deriveSavingType(labels);
    }));
  }

  function dispose() {
    inferredUnsubs.forEach(u => u && u());
    timePeriodField.dispose();
    savingCategoryField.dispose();
    if (fteField) fteField.dispose();
  }

  return { schema, components, dispose };
}

// ---------------------------------------------------------------------------
// Category tabbed section builder
// ---------------------------------------------------------------------------

/**
 * Builds the add-category controls + TabGroup + totals panel side by side.
 * Returns the assembled container, a `rebuild()` function for when the tab set changes,
 * and a `dispose()` for full cleanup.
 *
 * Callers subscribe to the returned `changeCounter` to react to adds/removes.
 *
 * @param {Map<string, CategoryState>} categoryStates
 * @param {{
 *   editability: { asIs: boolean },
 *   timePeriod?: string|FormField,
 *   fteAnnualCost?: number|FormField,
 *   isMentorOrGestor?: boolean,
 * }} opts
 * @returns {{
 *   container: Container,
 *   changeCounter: FormField<number>,
 *   rebuild: () => void,
 *   dispose: () => void,
 * }}
 */
export function buildCategoryTabbedSection(categoryStates, opts = {}) {
  const { editability, timePeriod, fteAnnualCost = 0, isMentorOrGestor = false } = opts;
  const canModify = editability && editability.asIs;
  const fteAnnualCostIsField = fteAnnualCost && typeof fteAnnualCost === 'object' && typeof fteAnnualCost.subscribe === 'function';

  // Track disposal of each tab's builder result
  const builderResults = new Map(); // key -> { dispose }
  const changeCounter = new FormField(0);
  const unsubs = [];

  // -- Totals panels (rebuilt on category changes) --
  let asIsTotalsResult = buildTotalsPanel(categoryStates, { phase: 'asIs', timePeriod, fteAnnualCost });
  let toBeTotalsResult = buildTotalsPanel(categoryStates, { phase: 'toBe', timePeriod, fteAnnualCost });

  // -- Tab content builder --
  function buildTabView(key, state) {
    // FTE Anual cost input lives inside the Eficiencia tab inputs row (mentor/gestor only)
    const extraInputs = (key === 'eficiencia' && isMentorOrGestor && fteAnnualCostIsField)
      ? [new FieldLabel('Custo Anual por FTE (EUR)', new NumberInput(fteAnnualCost, { placeholder: '0', min: 0 }))]
      : [];

    const asIsResult = buildCategoryAsIsForm(state, { timePeriod, extraInputs });
    const toBeResult = buildCategoryToBeForm(state, { timePeriod });
    builderResults.set(key, {
      dispose: () => { asIsResult.dispose(); toBeResult.dispose(); },
    });

    const tabChildren = [
      new Container([
        new Text('As-Is (situação actual)', { type: 'h5', class: 'pace-form-section-title' }),
        ...asIsResult.components,
        new Text('To-Be (situação futura)', { type: 'h5', class: 'pace-form-section-title' }),
        ...toBeResult.components,
      ], { class: 'pace-tab-form' }),
    ];

    if (canModify) {
      const removeBtn = new Button('Remover Métrica', {
        variant: 'danger',
        isOutlined: true,
        onClickHandler: () => {
          state.dispose();
          builderResults.get(key)?.dispose();
          builderResults.delete(key);
          categoryStates.delete(key);
          changeCounter.value = (changeCounter.value || 0) + 1;
        },
      });
      tabChildren.push(new Container([removeBtn], { class: 'pace-tab-remove-row' }));
    }

    return new View(tabChildren);
  }

  // -- TabGroup (rebuilt when categories change) --
  // TabGroup has addTabs() but no removeTab(). Strategy: rebuild on every remove.
  // Adds are handled with addTabs() for efficiency; removes require full rebuild.
  let tabGroupContainer = new Container([], { class: 'pace-tabgroup-wrap' });
  let pendingFocusKey = null;

  function buildTabGroupFresh() {
    // Dispose all existing builders (tab views), but NOT category states (those survive)
    for (const [k, r] of builderResults) {
      r.dispose();
      builderResults.delete(k);
    }

    if (categoryStates.size === 0) {
      tabGroupContainer.children = [
        new Text('Nenhuma categoria adicionada. Use o painel acima para adicionar.', { type: 'p', class: 'pace-empty-hint' }),
      ];
      return;
    }

    const tabs = Array.from(categoryStates.entries()).map(([k, state]) => ({
      key: k,
      label: CATEGORY_LABELS[k],
      view: buildTabView(k, state),
    }));

    const selectedTabKey = pendingFocusKey && categoryStates.has(pendingFocusKey)
      ? pendingFocusKey
      : tabs[0].key;
    pendingFocusKey = null;

    const tabGroup = new TabGroup(tabs, { class: 'pace-category-tabs', selectedTabKey });
    tabGroupContainer.children = [tabGroup];
  }

  // Initial build
  buildTabGroupFresh();

  // -- Add-category controls --
  const addControls = canModify ? buildAddControls() : null;

  function buildAddControls() {
    // Dynamically renders based on what's not yet in the map
    const addContainer = new Container([], { class: 'pace-add-category-row' });

    function refreshAddControls() {
      const available = CATEGORY_KEYS.filter(k => !categoryStates.has(k));
      const isFull = categoryStates.size >= 3;

      if (available.length === 0 || isFull) {
        addContainer.children = [];
        return;
      }

      const btns = available.map(k => {
        const btn = new Button('+ ' + CATEGORY_LABELS[k], {
          variant: 'secondary',
          onClickHandler: () => {
            const editabilityForNew = editability || { asIs: true, toBe: false };
            const state = createCategoryState(k, null, editabilityForNew);
            categoryStates.set(k, state);
            pendingFocusKey = k;
            changeCounter.value = (changeCounter.value || 0) + 1;
          },
        });
        return btn;
      });

      addContainer.children = [
        new Text('Adicionar Métricas:', { type: 'span', class: 'pace-add-label' }),
        new Container(btns, { class: 'pace-add-btns' }),
      ];
    }

    refreshAddControls();

    // Subscribe to change counter to refresh add controls
    const unsub = changeCounter.subscribe(() => {
      refreshAddControls();
    });

    return { component: addContainer, unsub };
  }

  const buildAsIsTitle = () => new Text('Cálculos As-Is', { type: 'p', class: 'pace-totals-section-title' });
  const buildToBeTitle = () => new Text('Cálculos To-Be', { type: 'p', class: 'pace-totals-section-title' });

  function totalsAreaChildren() {
    return [
      buildAsIsTitle(), asIsTotalsResult.component,
      buildToBeTitle(), toBeTotalsResult.component,
    ];
  }

  // Subscribe to counter to rebuild tabs and totals panels
  const tabUnsub = changeCounter.subscribe(() => {
    buildTabGroupFresh();
    asIsTotalsResult.dispose();
    toBeTotalsResult.dispose();
    asIsTotalsResult = buildTotalsPanel(categoryStates, { phase: 'asIs', timePeriod, fteAnnualCost });
    toBeTotalsResult = buildTotalsPanel(categoryStates, { phase: 'toBe', timePeriod, fteAnnualCost });
    totalsAreaContainer.children = totalsAreaChildren();
  });
  unsubs.push(tabUnsub);
  if (addControls) unsubs.push(addControls.unsub);

  const totalsAreaContainer = new Container(totalsAreaChildren(), { class: 'pace-totals-area' });

  const mainChildren = [
    ...(addControls ? [addControls.component] : []),
    new Container([
      tabGroupContainer,
      totalsAreaContainer,
    ], { class: 'pace-tabs-totals-layout' }),
  ];

  const container = new Container(mainChildren, { class: 'pace-category-section' });

  function dispose() {
    unsubs.forEach(u => u && u());
    for (const r of builderResults.values()) r.dispose();
    builderResults.clear();
    asIsTotalsResult.dispose();
    toBeTotalsResult.dispose();
    changeCounter.dispose();
  }

  return { container, changeCounter, rebuild: buildTabGroupFresh, dispose };
}
