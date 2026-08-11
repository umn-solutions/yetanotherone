import { Button, Container, Toast, getIcon, __dayjs } from '../libs/nofbiz/nofbiz.base.js';
import { dataToCSV, downloadFile } from '../libs/nofbiz/nofbiz.excelparser.js';

import * as financialsApi from './financials-api.js';
import * as commentsApi from './comments-api.js';
import * as eventsApi from './initiative-events-api.js';

import { hasAnyProfile, ROLES } from './roles.js';
import { statusLabel } from './status-helpers.js';
import { ownerName, mentorName, gestorName } from './format-helpers.js';
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  CATEGORY_DIRECTIONS,
  CATEGORY_FIELD_NAMES,
  INPUT_KEYS_BY_CATEGORY,
  INPUT_LABELS_BY_CATEGORY,
  deriveSavingType,
  annualizeSavings,
  annualSavingColName,
} from './constants.js';
import { getSimuladorFromPayload } from './financial-forms.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------


/** Coerces any value to a float, returning 0 for invalid input. */
function num(v) {
  return parseFloat(v) || 0;
}

/**
 * Computes the raw period total for a single phase object belonging to a category.
 * Replicates financial-forms.js:194 computePhaseTotal but works on plain JS objects
 * (not FormFields) as stored in the SP list JSON payloads.
 * @param {string} key - 'eficiencia'|'producao'|'gastos'
 * @param {Object} phase - Plain phase object from parsed JSON
 * @returns {number}
 */
function computePhaseTotalFromJson(key, phase) {
  if (!phase) return 0;
  if (key === 'eficiencia')    return num(phase.vp) * num(phase.tu);
  if (key === 'producao')      return num(phase.vp) * num(phase.mu);
  if (key === 'gastos')        return num(phase.v)  * num(phase.c);
  if (key === 'reducao_risco') return num(phase.exp) * num(phase.taxa) / 100;
  if (key === 'reducao_custo') return num(phase.co);
  return 0;
}

/**
 * Reads the stored category JSON payload, computes the realized annualized saving.
 * Stored payload shape: { asIs: {...}, toBe: {...} }
 * (same as what serializeCategory produces).
 *
 * @param {Object|string|null} payloadJson - The stored field value (auto-parsed or raw JSON string)
 * @param {string} categoryKey - 'eficiencia'|'producao'|'gastos'
 * @param {string} timePeriod - Annualization period
 * @returns {number} Annualized saving (0 if data is absent or invalid)
 */
function flattenCategory(payloadJson, categoryKey, timePeriod) {
  let payload = payloadJson;
  if (!payload) return 0;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (err) { console.warn('[initiatives-export.flattenCategory] JSON parse failed', { categoryKey, err }); return 0; }
  }
  if (typeof payload !== 'object') return 0;

  // producao: when simulador is active it is already annual -- return directly (no factor)
  if (categoryKey === 'producao') {
    const sim = getSimuladorFromPayload(payload);
    if (sim.active) return sim.value;
  }

  const asIsTotal  = computePhaseTotalFromJson(categoryKey, payload.asIs);
  // Legacy compatibility: early records used `estimated` for the projected phase.
  const toBeTotal  = computePhaseTotalFromJson(categoryKey, payload.toBe || payload.estimated);

  const direction = CATEGORY_DIRECTIONS[categoryKey];
  const realizedPeriod = direction === 'decrease'
    ? asIsTotal - toBeTotal
    : toBeTotal - asIsTotal;

  return annualizeSavings(realizedPeriod, timePeriod || '');
}

/**
 * Resolves a single phase object from a stored (possibly already-parsed) payload.
 * Handles legacy `estimated` as an alias for `toBe`.
 * @param {Object|string|null} payloadJson
 * @param {'asIs'|'toBe'} phase
 * @returns {Object|null}
 */
function getPhaseObjFromPayload(payloadJson, phase) {
  let payload = payloadJson;
  if (!payload) return null;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (err) { console.warn('[initiatives-export.getPhaseObjFromPayload] JSON parse failed', { payload, err }); return null; }
  }
  if (typeof payload !== 'object') return null;
  if (phase === 'toBe') return payload.toBe || payload.estimated || null;
  return payload[phase] || null;
}

/**
 * Returns the mode string from a stored payload, or '' if absent.
 * @param {Object|string|null} payloadJson
 * @returns {string}
 */
function getModeFromPayload(payloadJson) {
  let payload = payloadJson;
  if (!payload) return '';
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (err) { console.warn('[initiatives-export.getModeFromPayload] JSON parse failed', { payload, err }); return ''; }
  }
  if (typeof payload !== 'object') return '';
  const mode = payload.mode;
  if (mode == null) return '';
  if (typeof mode === 'string') return mode;
  // Legacy: mode stored as ComboBox option object ({label, value}); extract scalar.
  if (typeof mode === 'object') return String(mode.value ?? mode.label ?? mode.Name ?? '');
  return String(mode);
}

/**
 * Serializes an array of comments to a pipe-joined string.
 * Format per entry: [YYYY-MM-DD by AuthorName] body (newlines stripped).
 * Sorted ascending by CommentDate.
 * @param {Array|undefined} arr
 * @returns {string}
 */
function serializeComments(arr) {
  if (!arr || arr.length === 0) return '';
  const sorted = [...arr].sort((a, b) => {
    const da = a.CommentDate || '';
    const db = b.CommentDate || '';
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return sorted.map((c) => {
    const date = c.CommentDate ? String(c.CommentDate).slice(0, 10) : '?';
    const author = (c.CommentAuthor && typeof c.CommentAuthor === 'object')
      ? (c.CommentAuthor.displayName || c.CommentAuthor.email || '')
      : (c.CommentAuthor || '');
    const body = String(c.Body || '').replace(/[\r\n]+/g, ' ');
    return `[${date} by ${author}] ${body}`;
  }).join(' | ');
}

/**
 * Serializes an array of events to a pipe-joined string.
 * Format per entry: [YYYY-MM-DD EventType: fromLabel->toLabel] comment
 * When both from/to are empty the ': fromLabel->toLabel' segment is omitted.
 * Sorted ascending by Date.
 * @param {Array|undefined} arr
 * @returns {string}
 */
function serializeEvents(arr) {
  if (!arr || arr.length === 0) return '';
  const sorted = [...arr].sort((a, b) => {
    const da = a.Date || '';
    const db = b.Date || '';
    return da < db ? -1 : da > db ? 1 : 0;
  });
  return sorted.map((e) => {
    const date = e.Date ? String(e.Date).slice(0, 10) : '?';
    const eventType = e.EventType || '';
    const fromLabel = statusLabel(e.FromStatus || '');
    const toLabel   = statusLabel(e.ToStatus || '');
    const hasTrans  = (e.FromStatus || e.ToStatus);
    const transStr  = hasTrans ? `: ${fromLabel}->${toLabel}` : '';
    const comment   = String(e.Comment || '').replace(/[\r\n]+/g, ' ');
    const commentStr = comment ? ` ${comment}` : '';
    return `[${date} ${eventType}${transStr}]${commentStr}`;
  }).join(' | ');
}

/**
 * Flattens all financial fields from a financials record into an ordered flat
 * object keyed by human-readable column label.
 *
 * This is the canonical financial-data flattening used by both the CSV export
 * (buildRow) and the IMPLEMENTED email template. Extracting it here avoids
 * duplicating the category-loop logic.
 *
 * @param {Object|null} fin - Financials record (may be null)
 * @param {{ detailed?: boolean, isPrivileged?: boolean }} [opts]
 *   detailed    - When true, includes per-phase raw inputs and simulador columns (default true)
 *   isPrivileged - When true, includes FTEAnnualCost (default false)
 * @returns {Object} Ordered flat object { columnLabel: value, ... }
 */
export function buildFinancialFields(fin, { detailed = true, isPrivileged = false } = {}) {
  const savingCat = fin
    ? (Array.isArray(fin.SavingCategory) ? fin.SavingCategory : (fin.SavingCategory ? [fin.SavingCategory] : []))
    : [];

  const timePeriod = fin ? (fin.TimePeriod || '') : '';

  const row = {};

  row.TimePeriod     = timePeriod;
  // Prefer stored SavingType; fall back to derivation from categories for legacy rows
  row.SavingType     = fin ? (fin.SavingType || deriveSavingType(savingCat)) : '';
  // Legacy records may store option objects ({label,value}) instead of plain strings.
  // Coerce each entry to its scalar label/value before joining.
  row.SavingCategory = savingCat
    .map((entry) => {
      if (entry == null) return '';
      if (typeof entry === 'string') return entry;
      if (typeof entry === 'object') return String(entry.value ?? entry.label ?? entry.Name ?? '');
      return String(entry);
    })
    .filter((s) => s !== '')
    .join('; ');

  for (const key of CATEGORY_KEYS) {
    const label = CATEGORY_LABELS[key];
    const payloadJson = fin ? fin[CATEGORY_FIELD_NAMES[key]] : null;

    // qualidade: text-only metric -- emit one description column, skip numeric columns
    if (key === 'qualidade') {
      if (detailed) {
        let qualText = '';
        if (fin && payloadJson) {
          const parsed = typeof payloadJson === 'object' ? payloadJson : (() => { try { return JSON.parse(payloadJson); } catch (err) { console.warn('[initiatives-export.buildFinancialFields] QualidadeData parse failed', { payloadJson, err }); return {}; } })();
          qualText = parsed.text || '';
        }
        row['Qualidade Descrição'] = qualText;
      }
      continue;
    }

    const colName = annualSavingColName(key);
    const inputKeys = INPUT_KEYS_BY_CATEGORY[key] || [];
    const inputLabels = INPUT_LABELS_BY_CATEGORY[key] || {};

    if (detailed) {
      // Mode column (reducao_custo only -- toggle moved from reducao_risco)
      if (key === 'reducao_custo') {
        row[label + ' Modo'] = fin ? getModeFromPayload(payloadJson) : '';
      }

      // Per-phase raw inputs and bruto total (only when inputKeys is non-empty)
      if (inputKeys.length > 0) {
        for (const phase of ['asIs', 'toBe']) {
          const phaseLabel = phase === 'asIs' ? 'AsIs' : 'ToBe';
          const phaseObj = fin ? getPhaseObjFromPayload(payloadJson, phase) : null;

          for (const ik of inputKeys) {
            const colHeader = label + ' ' + phaseLabel + ' ' + inputLabels[ik];
            row[colHeader] = (fin && phaseObj != null)
              ? (phaseObj[ik] != null ? phaseObj[ik] : '')
              : '';
          }

          row[label + ' ' + phaseLabel + ' Total (bruto)'] = (fin && phaseObj != null)
            ? computePhaseTotalFromJson(key, phaseObj)
            : '';
        }
      }

      // producao: extra simulador column
      if (key === 'producao') {
        let simuladorVal = '';
        if (fin && payloadJson) {
          let simPayload = payloadJson;
          if (typeof simPayload === 'string') {
            try { simPayload = JSON.parse(simPayload); } catch (err) { console.warn('[initiatives-export.buildFinancialFields] ProducaoData simulador parse failed', { err }); simPayload = null; }
          }
          if (simPayload && typeof simPayload === 'object') {
            const sim = getSimuladorFromPayload(simPayload);
            if (sim.active) simuladorVal = sim.value;
          }
        }
        row['Aumento de Produção Simulador (Anual)'] = simuladorVal;
      }
    }

    // Annualized saving column -- always present for numeric metrics
    row[colName] = fin
      ? flattenCategory(payloadJson, key, timePeriod)
      : 0;
  }

  if (isPrivileged) {
    row.FTEAnnualCost = fin ? (fin.FTEAnnualCost || '') : '';
  }

  return row;
}

/**
 * Builds a single flat row for the CSV.
 * @param {Object} item - Initiative record
 * @param {{ finMap: Map, commentsMap: Map, eventsMap: Map, isPrivileged: boolean, includeSection: boolean, detailed: boolean }} ctx
 * @returns {Object}
 */
function buildRow(item, ctx) {
  const { finMap, commentsMap, eventsMap, isPrivileged, includeSection, detailed } = ctx;
  const fin = finMap.get(item.UUID) || null;

  const row = {};

  if (includeSection) {
    row.Section = item.__section || '';
  }

  row.Title                 = item.Title || '';
  row.Description           = item.Description || '';
  row.UUID                  = item.UUID || '';
  row.Status                = statusLabel(item.Status || '');
  row.ImpactedTeamOUID      = item.ImpactedTeamOUID || '';
  row.SubmittedByEmail      = item.SubmittedByEmail || '';
  row.OwnerName             = ownerName(item);
  row.MentorName            = mentorName(item);
  row.MentorEmail           = item.MentorEmail || '';
  row.GestorName            = gestorName(item);
  row.GestorValidatorEmail  = item.GestorValidatorEmail || '';
  row.IsConfidential        = item.IsConfidential ? 'Sim' : 'Não';
  row.Created               = item.Created ? String(item.Created).slice(0, 10) : '';
  row.Modified              = item.Modified ? String(item.Modified).slice(0, 10) : '';
  row.ImplementedDate       = item.ImplementedDate ? String(item.ImplementedDate).slice(0, 10) : '';

  // Financial fields -- delegated to the shared flattener (same output as before)
  const finFields = buildFinancialFields(fin, { detailed, isPrivileged });
  Object.assign(row, finFields);

  row.Comments = serializeComments(commentsMap.get(item.UUID));
  row.Events   = serializeEvents(eventsMap.get(item.UUID));

  return row;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Creates an "Exportar CSV" Button that, when clicked, fetches related data in
 * batch and downloads a CSV of the currently visible (filtered) initiatives.
 *
 * @param {{
 *   getRows: () => Object[],
 *   filenamePrefix: string,
 *   label?: string,
 *   dedupe?: boolean,
 *   detailed?: boolean,
 * }} opts
 * @returns {Button}
 */
export function createExportButton({ getRows, filenamePrefix, label = 'Exportar', dedupe = false, detailed = false }) {
  const btn = new Button([
    new Container([getIcon('download-line')], { as: 'span', class: 'pace-btn-icon' }),
    label,
  ], {
    variant: 'secondary',
    onClickHandler: async () => {
      let rows = getRows();

      if (rows.length === 0) {
        Toast.warning('Sem iniciativas para exportar.');
        return;
      }

      if (dedupe) {
        const seen = new Set();
        rows = rows.filter((item) => {
          if (seen.has(item.UUID)) return false;
          seen.add(item.UUID);
          return true;
        });
      }

      // Detect whether any row carries __section to decide column inclusion
      const includeSection = rows.some((r) => r.__section !== undefined);

      btn.isLoading = true;
      const loading = Toast.loading('A preparar exportação...');

      try {
        const isPrivileged = hasAnyProfile([ROLES.MENTOR, ROLES.GESTOR]);

        const [finMap, commentsMap, eventsMap] = await Promise.all([
          financialsApi.getAllAsMap(),
          commentsApi.getAllAsMap(),
          eventsApi.getAllAsMap(),
        ]);

        const ctx = { finMap, commentsMap, eventsMap, isPrivileged, includeSection, detailed };
        const serialised = rows.map((item) => buildRow(item, ctx));

        const csv = dataToCSV(serialised, { bom: true });
        const filename = `${filenamePrefix}-${__dayjs().format('YYYY-MM-DD')}.csv`;
        downloadFile(csv, filename);

        loading.success(`${rows.length} iniciativa(s) exportada(s).`);
      } catch (err) {
        console.error('[initiatives-export] failed', err);
        loading.error('Erro ao exportar.');
      } finally {
        btn.isLoading = false;
      }
    },
  });

  return btn;
}
