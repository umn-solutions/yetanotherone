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
  CATEGORY_DIRECTIONS,
  CATEGORY_FIELD_NAMES,
  deriveSavingType,
  annualizeSavings,
} from './constants.js';

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
  if (key === 'producao')      return num(phase.vp) * num(phase.mu) * (num(phase.tt) / 100);
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
    try { payload = JSON.parse(payload); } catch (_) { return 0; }
  }
  if (typeof payload !== 'object') return 0;

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
 * Builds a single flat row for the CSV.
 * @param {Object} item - Initiative record
 * @param {{ finMap: Map, commentsMap: Map, eventsMap: Map, isPrivileged: boolean, includeSection: boolean }} ctx
 * @returns {Object}
 */
function buildRow(item, ctx) {
  const { finMap, commentsMap, eventsMap, isPrivileged, includeSection } = ctx;
  const fin = finMap.get(item.UUID) || null;

  const savingCat = fin
    ? (Array.isArray(fin.SavingCategory) ? fin.SavingCategory : (fin.SavingCategory ? [fin.SavingCategory] : []))
    : [];

  const timePeriod = fin ? (fin.TimePeriod || '') : '';

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

  row.TimePeriod            = timePeriod;
  row.SavingType            = fin ? deriveSavingType(savingCat) : '';
  row.SavingCategory        = savingCat.join('; ');

  for (const key of CATEGORY_KEYS) {
    const colName = key.charAt(0).toUpperCase() + key.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'AnnualSaving';
    row[colName] = fin
      ? flattenCategory(fin[CATEGORY_FIELD_NAMES[key]], key, timePeriod)
      : 0;
  }

  if (isPrivileged) {
    row.FTEAnnualCost = fin ? (fin.FTEAnnualCost || '') : '';
  }

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
 * }} opts
 * @returns {Button}
 */
export function createExportButton({ getRows, filenamePrefix, label = 'Exportar', dedupe = false }) {
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

        const ctx = { finMap, commentsMap, eventsMap, isPrivileged, includeSection };
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
