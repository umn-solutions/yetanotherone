import { Button, Container, Toast, getIcon, __dayjs } from '../libs/nofbiz/nofbiz.base.js';
import { hucre, downloadFile } from '../libs/nofbiz/nofbiz.excelparser.js';

import { buildInitiativeExportRows } from './initiatives-export.js';
import { getAllEmployees } from './org-hierarchy-api.js';
import { getAllTargets, computeTargetTotals } from './savings-targets-api.js';
import { getAllShares } from './shared-api.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Derives XLSX columns from the keys of the first data row.
 * Safe when data is empty -- returns an empty array.
 * @param {Object[]} data
 * @returns {{ header: string, key: string }[]}
 */
function columnsFromData(data) {
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
function toScalar(v) {
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
function scalarizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = toScalar(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-sheet flatteners
// ---------------------------------------------------------------------------

/**
 * Flattens a single OrgHierarchy employee record to a Power BI-safe row.
 * @param {Object} emp
 * @returns {Object}
 */
function flattenEmployee(emp) {
  return {
    EmployeeId:       String(emp.Title       || ''),
    ShortName:        String(emp.ShortName   || ''),
    Email:            String(emp.Email       || ''),
    ManagerId:        String(emp.ManagerId   || ''),
    Category:         String(emp.Category    || ''),
    OUID:             String(emp.OUID        || ''),
    OUDesc:           String(emp.OUDesc      || ''),
    Direcao:          String(emp.Direcao     || ''),
    Departamento:     String(emp.Departamento|| ''),
    AncestorPath:     String(emp.AncestorPath    || ''),
    DeptAncestorPath: String(emp.DeptAncestorPath|| ''),
    Depth:            String(emp.Depth       || ''),
    AppRole:          String(emp.AppRole     || ''),
  };
}

/**
 * Flattens a single SavingsTargets record plus its computed totals.
 * @param {Object} target
 * @returns {Object}
 */
function flattenTarget(target) {
  const { hardTotal, softTotal, total } = computeTargetTotals(target);
  return {
    Year:                String(target.Title              || ''),
    ImplementedTarget:   Number(target.ImplementedTarget  || 0),
    HardSavingsTarget:   Number(target.HardSavingsTarget  || 0),
    SoftSavingsTarget:   Number(target.SoftSavingsTarget  || 0),
    ComputedHardTotal:   hardTotal,
    ComputedSoftTotal:   softTotal,
    ComputedTotal:       total,
    LastModifiedByEmail: String(target.LastModifiedByEmail|| ''),
    LastModifiedDate:    target.LastModifiedDate ? String(target.LastModifiedDate).slice(0, 10) : '',
  };
}

/**
 * Flattens a single InitiativesSharedAccess record.
 * SharedWith / SharedBy are stored as JSON objects -- extract scalar fields.
 * @param {Object} share
 * @returns {Object}
 */
function flattenShare(share) {
  // SharedWith / SharedBy are auto-parsed objects or raw JSON strings
  const sharedWith = (typeof share.SharedWith === 'object' && share.SharedWith !== null)
    ? share.SharedWith
    : {};
  const sharedBy = (typeof share.SharedBy === 'object' && share.SharedBy !== null)
    ? share.SharedBy
    : {};

  return {
    UUID:              String(share.UUID             || ''),
    InitiativeUUID:    String(share.InitiativeUUID   || ''),
    SharedWithEmail:   String(share.SharedWithEmail  || sharedWith.email   || ''),
    SharedWithName:    String(sharedWith.displayName || sharedWith.name    || ''),
    SharedByEmail:     String(share.SharedByEmail    || sharedBy.email     || ''),
    SharedByName:      String(sharedBy.displayName   || sharedBy.name      || ''),
    Type:              String(share.Type             || ''),
    Status:            String(share.Status           || ''),
    SharedDate:        share.SharedDate ? String(share.SharedDate).slice(0, 10) : '',
    Created:           share.Created   ? String(share.Created).slice(0, 10)   : '',
    Modified:          share.Modified  ? String(share.Modified).slice(0, 10)  : '',
  };
}

// ---------------------------------------------------------------------------
// Main export orchestrator
// ---------------------------------------------------------------------------

/**
 * Fetches all four data sources, assembles a multi-sheet XLSX workbook,
 * and triggers a browser download.
 *
 * @param {Object[]} allInitiatives - Already-loaded initiatives array (passed in by the caller)
 * @returns {Promise<void>}
 */
export async function downloadPowerBIWorkbook(allInitiatives) {
  const [employees, targets, shares, initiativeRows] = await Promise.all([
    getAllEmployees(),
    getAllTargets(),
    getAllShares(),
    buildInitiativeExportRows(allInitiatives, { detailed: true, isPrivileged: true, includeActivity: false }),
  ]);

  // Sheet 1: Iniciativas -- rows already flattened by buildInitiativeExportRows;
  //   scalarize to catch any residual objects (e.g. legacy ComboBox values)
  const initiativasData = initiativeRows.map(scalarizeRow);

  // Sheet 2: OrgHierarchy -- explicit flattener (all fields are already scalars
  //   but AncestorPath / DeptAncestorPath are multiline strings -- safe)
  const orgData = employees.map(flattenEmployee);

  // Sheet 3: Objectivos -- explicit flattener adds computed totals
  const objectivosData = targets.map(flattenTarget);

  // Sheet 4: SharedAccess -- explicit flattener extracts nested SharedWith/SharedBy
  const sharedData = shares.map(flattenShare);

  const bytes = await hucre.writeXlsx({
    sheets: [
      {
        name: 'Iniciativas',
        columns: columnsFromData(initiativasData),
        data: initiativasData,
      },
      {
        name: 'OrgHierarchy',
        columns: columnsFromData(orgData),
        data: orgData,
      },
      {
        name: 'Objectivos',
        columns: columnsFromData(objectivosData),
        data: objectivosData,
      },
      {
        name: 'SharedAccess',
        columns: columnsFromData(sharedData),
        data: sharedData,
      },
    ],
  });

  downloadFile(bytes, `place-powerbi-${__dayjs().format('YYYY-MM-DD')}.xlsx`);
}

// ---------------------------------------------------------------------------
// UI button factory
// ---------------------------------------------------------------------------

/**
 * Creates a "Exportar para Power BI (.xlsx)" Button.
 * Caller must provide the already-loaded initiatives array via `getAllInitiatives`.
 *
 * @param {{ getAllInitiatives: () => Object[] }} opts
 * @returns {Button}
 */
export function createPowerBIExportButton({ getAllInitiatives }) {
  const btn = new Button([
    new Container([getIcon('file-download-line')], { as: 'span', class: 'pace-btn-icon' }),
    'Exportar para Power BI (.xlsx)',
  ], {
    variant: 'secondary',
    onClickHandler: async () => {
      btn.isLoading = true;
      const loading = Toast.loading('A preparar exportação Power BI...');
      try {
        await downloadPowerBIWorkbook(getAllInitiatives());
        loading.success('Workbook exportado.');
      } catch (err) {
        console.error('[powerbi-export] failed', err);
        loading.error('Erro ao exportar para Power BI.');
      } finally {
        btn.isLoading = false;
      }
    },
  });

  return btn;
}
