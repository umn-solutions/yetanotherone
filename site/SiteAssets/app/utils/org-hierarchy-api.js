import { SiteApi, SystemError } from '../libs/nofbiz/nofbiz.base.js';
import { GESTOR_CATEGORIES, MENTOR_OUIDS } from './constants.js';
import { validateOrgCSV } from './org-hierarchy-csv.js';
import { FULL_SCAN } from './sp-paging.js';

const listApi = new SiteApi().list('OrgHierarchy');

/**
 * Category ranking for determining department heads.
 * Lower number = higher rank.
 */
const CATEGORY_RANK = {
  'Executive': 0,
  'Top Management': 1,
  'Management': 2,
  'Team Leader': 3,
  'Expert - Technical Lead': 4,
  'Technician': 5,
};

/**
 * Imports organizational hierarchy from CSV string or XLSX binary.
 * Full refresh: deletes all existing items and recreates from file.
 *
 * @param {string|ArrayBuffer|Uint8Array} input - CSV text or XLSX binary
 * @param {(current: number, total: number) => void} [onProgress] - Progress callback for writes
 * @returns {Promise<{ success: number, failed: number, errors: string[] }>}
 */
export async function importFromCSV(input, onProgress) {
  // 1. Validate input (schema, rows, structure) -- aborts before any SP writes on fatal errors
  const validation = await validateOrgCSV(input);

  if (!validation.ok) {
    return { success: 0, failed: 0, errors: [...(validation.fatal || []), ...(validation.warnings || [])] };
  }

  const { persons: personMap, rootId, warnings } = validation;
  const errors = [...warnings];

  // 2. Compute AncestorPath for each person via BFS from root.
  //    The validator already confirmed the tree is cycle-free and fully connected.
  const ancestorPaths = new Map();
  const bfsQueue = [rootId];
  ancestorPaths.set(rootId, rootId);

  while (bfsQueue.length > 0) {
    const currentId = bfsQueue.shift();
    const currentPath = ancestorPaths.get(currentId);

    for (const [childId, child] of personMap) {
      if (child.ManagerId === currentId && !ancestorPaths.has(childId)) {
        ancestorPaths.set(childId, currentPath + '|' + childId);
        bfsQueue.push(childId);
      }
    }
  }

  // 3. Assign DeptAncestorPath to each person.
  // Deterministic 3-segment composition: Direcao|Departamento|OUID
  const personDeptPaths = new Map();
  for (const [id, person] of personMap) {
    const segs = [person.Direcao, person.Departamento, person.OUID].filter(Boolean);
    personDeptPaths.set(id, segs.join('|'));
  }

  // 4. Compute Depth for each person: number of '|' separators in AncestorPath
  const personDepths = new Map();
  for (const [id] of personMap) {
    const path = ancestorPaths.get(id) || '';
    const separators = path.split('|').length - 1;
    personDepths.set(id, String(separators));
  }

  // 5. Full refresh: delete all then batch-create in groups of 5
  await listApi.deleteALLItems();

  const records = [];
  for (const [id, person] of personMap) {
    records.push({
      ...person,
      AncestorPath: ancestorPaths.get(id) || id,
      DeptAncestorPath: personDeptPaths.get(id) || person.OUID || '',
      Depth: personDepths.get(id) || '0',
      AppRole: MENTOR_OUIDS.includes(person.OUID) ? 'mentor' : '',
    });
  }

  const total = records.length;
  let success = 0;
  let failed = 0;
  const batchSize = 5;

  for (let i = 0; i < total; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(record => listApi.createItem(record))
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        success++;
      } else {
        failed++;
        errors.push(result.reason?.message || 'Unknown write error');
      }
    }

    if (onProgress) {
      onProgress(Math.min(i + batchSize, total), total);
    }
  }

  return { success, failed, errors };
}

// ---------------------------------------------------------------------------
// Query functions
// ---------------------------------------------------------------------------

/**
 * Single person lookup by employee ID (Title field).
 * @param {string} id - Employee ID
 * @returns {Promise<Object|null>}
 */
export async function getEmployee(id) {
  const [emp] = await listApi.getItemByTitle(id);
  return emp || null;
}

/**
 * All members of an OU (indexed OUID query).
 * @param {string} ouid
 * @returns {Promise<Array>}
 */
export async function getTeamMembers(ouid) {
  return listApi.getItems({ OUID: ouid }, FULL_SCAN);
}

/**
 * All OUID values under a given dept ancestor path (for visibility scoping).
 * @param {string} deptAncestorPath
 * @returns {Promise<string[]>}
 */
export async function getTeamScope(deptAncestorPath) {
  const descendants = await listApi.getItems({
    DeptAncestorPath: { value: deptAncestorPath + '|', operator: 'BeginsWith' },
  }, FULL_SCAN);
  const codes = new Set(descendants.map(d => d.OUID).filter(Boolean));
  // Include the own OU code (last segment of the path)
  const ownCode = deptAncestorPath.split('|').pop();
  codes.add(ownCode);
  return [...codes];
}

/**
 * Immediate subordinates (indexed ManagerId query).
 * @param {string} managerId - Employee ID of the manager
 * @returns {Promise<Array>}
 */
export async function getDirectReports(managerId) {
  return listApi.getItems({ ManagerId: managerId }, FULL_SCAN);
}

/**
 * All people below a given employee (all levels) via BeginsWith on AncestorPath.
 * @param {string} employeeId
 * @returns {Promise<Array>}
 */
export async function getDescendants(employeeId) {
  const emp = await getEmployee(employeeId);
  if (!emp) return [];
  return listApi.getItems({
    AncestorPath: { value: emp.AncestorPath + '|', operator: 'BeginsWith' },
  }, FULL_SCAN);
}

/**
 * Full management chain upward -- parses AncestorPath, batch queries.
 * Returns ancestors sorted from root (CEO) to the employee themselves.
 * @param {string} employeeId
 * @returns {Promise<Array>}
 */
export async function getAncestors(employeeId) {
  const emp = await getEmployee(employeeId);
  if (!emp) return [];
  const ids = emp.AncestorPath.split('|');
  if (ids.length <= 1) return [emp]; // root, no ancestors
  const ancestors = await listApi.getItems({
    Title: { value: ids, operator: 'Or' },
  });
  // Sort by path order (CEO first)
  const idOrder = new Map(ids.map((id, i) => [id, i]));
  return ancestors.sort((a, b) => (idOrder.get(a.Title) ?? 0) - (idOrder.get(b.Title) ?? 0));
}

/**
 * Lightweight: returns management chain IDs from an ancestor path string.
 * No SP query needed.
 * @param {string} ancestorPath
 * @returns {string[]}
 */
export function getManagementChainIds(ancestorPath) {
  return ancestorPath ? ancestorPath.split('|') : [];
}

/**
 * Full dataset -- all employees.
 * @returns {Promise<Array>}
 */
export async function getAllEmployees() {
  return listApi.getItems(undefined, FULL_SCAN);
}

/**
 * Lookup employee(s) by email (indexed Email query).
 * @param {string} email
 * @returns {Promise<Array>}
 */
export async function getByEmail(email) {
  const results = await listApi.getItems({ Email: email });
  return results.filter(item => item.Email === email);
}

/**
 * Updates the AppRole override for an employee.
 * @param {string} employeeId - Employee ID (Title field)
 * @param {string} appRole - New AppRole value ('' to clear override)
 * @returns {Promise<void>}
 */
export async function updateEmployeeRole(employeeId, appRole) {
  const emp = await getEmployee(employeeId);
  if (!emp) throw new SystemError('NotFound', `Employee ${employeeId} not found`);
  await listApi.updateItem(emp.Id, { AppRole: appRole }, emp['odata.etag']);
}

/**
 * Derives application roles from an OrgHierarchy employee record.
 * Priority: AppRole override > OUID-head derivation > Category-based > default colaborador.
 *
 * The head of the first MENTOR_OUIDS entry is derived to 'mentor-manager' automatically
 * (unless an explicit AppRole override already applies). The head is determined by
 * pickTeamHead on the cached members array; because this function runs synchronously
 * (called from route render paths), the caller must ensure OrgHierarchy data is cached
 * before calling (getAllEmployees() loads the cache used here). In practice, routes load
 * all employees first, so this is always satisfied.
 *
 * @param {Object|null} employee
 * @param {Object[]|null} [allEmployees] - Full OrgHierarchy list (used to find MENTOR_OUIDS head).
 *   When omitted, mentor-manager auto-derivation is skipped.
 * @returns {string[]}
 */
export function deriveRoles(employee, allEmployees) {
  if (!employee) return ['colaborador'];
  const appRole = employee.AppRole || '';
  const category = employee.Category || '';

  // Explicit AppRole override takes highest priority.
  // mentor-manager inherits mentor so any mentor-gated check also passes.
  if (appRole === 'mentor-manager') return ['mentor-manager', 'mentor'];
  if (appRole === 'mentor') return ['mentor'];
  if (appRole === 'gestor') return ['gestor'];
  if (appRole === 'colaborador') return ['colaborador'];

  // OUID-head derivation: the head of the primary mentor OU becomes mentor-manager.
  // Requires the full employees list to identify the head; skip when not provided.
  if (allEmployees && allEmployees.length > 0 && MENTOR_OUIDS.length > 0) {
    const mentorOUID = MENTOR_OUIDS[0];
    const ouMembers = allEmployees.filter(e => e.OUID === mentorOUID);
    const head = pickTeamHead(ouMembers);
    if (head && head.Title === employee.Title) {
      return ['mentor-manager', 'mentor'];
    }
  }

  // OUID-based mentor: members of MENTOR_OUIDS OUs become mentors
  if (MENTOR_OUIDS.includes(employee.OUID)) return ['mentor'];

  // Category-based defaults (only when AppRole is empty/auto)
  if (GESTOR_CATEGORIES.includes(category)) return ['gestor'];

  return ['colaborador'];
}

let _teamOptionsCache = null;

export async function getTeamOptions() {
  if (_teamOptionsCache) return _teamOptionsCache;
  const employees = await listApi.getItems(undefined, {
    ...FULL_SCAN,
    viewFields: ['OUID', 'OUDesc', 'Departamento'],
  });
  const seen = new Map();
  for (const e of employees) {
    if (e.OUID && !seen.has(e.OUID)) {
      seen.set(e.OUID, e.OUDesc || e.OUID);
    }
  }
  _teamOptionsCache = [...seen.entries()]
    .map(([ouid, ouDesc]) => ({ label: `${ouid} — ${ouDesc}`, value: ouid }))
    .sort((a, b) => a.value.localeCompare(b.value));
  return _teamOptionsCache;
}

export function getCachedTeamOptions() {
  return _teamOptionsCache;
}

// ---------------------------------------------------------------------------
// Gestor map (dynamic replacement for hardcoded GESTOR_MAP)
// ---------------------------------------------------------------------------

let _gestorMapCache = null;

/**
 * Fetches and caches the gestor map derived from OrgHierarchy.
 * For each OU, the highest-Category-ranked employee is the gestor.
 * comexFallback is the highest-ranked direct report of the root (COMEX level); never the root/CEO; null if none.
 * @returns {Promise<{ gestorMap: Object, comexFallback: Object|null, byId: Map<string, Object>, byOUID: Map<string, Object[]> }>}
 */
export async function getGestorMap() {
  if (_gestorMapCache) return _gestorMapCache;
  const all = await listApi.getItems(undefined, FULL_SCAN);

  const byId = new Map();
  const byOUIDRaw = new Map();
  let rootEmployee = null;

  for (const emp of all) {
    if (emp.Title) byId.set(emp.Title, emp);
    if (!emp.ManagerId) rootEmployee = emp;
    if (!emp.OUID) continue;
    if (!byOUIDRaw.has(emp.OUID)) byOUIDRaw.set(emp.OUID, []);
    byOUIDRaw.get(emp.OUID).push(emp);
  }

  const byOUID = new Map();
  const gestorMap = {};
  for (const [code, members] of byOUIDRaw) {
    const sorted = members.slice().sort(
      (a, b) => (CATEGORY_RANK[a.Category] ?? Infinity) - (CATEGORY_RANK[b.Category] ?? Infinity)
    );
    byOUID.set(code, sorted);
    const best = sorted[0];
    if (best) gestorMap[code] = { email: best.Email, displayName: best.ShortName };
  }

  // comexFallback: highest-ranked direct report of the root, never the root/CEO itself.
  let comexFallback = null;
  if (rootEmployee) {
    const directReports = all.filter(e => e.ManagerId === rootEmployee.Title);
    if (directReports.length > 0) {
      directReports.sort(
        (a, b) =>
          ((CATEGORY_RANK[a.Category] ?? Infinity) - (CATEGORY_RANK[b.Category] ?? Infinity)) ||
          (a.Title < b.Title ? -1 : a.Title > b.Title ? 1 : 0)
      );
      const best = directReports[0];
      comexFallback = { email: best.Email, displayName: best.ShortName };
    }
  }

  _gestorMapCache = { gestorMap, comexFallback, byId, byOUID };
  return _gestorMapCache;
}

export function getCachedGestorMap() {
  return _gestorMapCache;
}

export function pickTeamHead(ouMembers) {
  return ouMembers && ouMembers.length ? ouMembers[0] : null;
}

/**
 * Resolves the immediate manager (one level up) for an employee.
 * @param {string} employeeId
 * @returns {Promise<{email:string,name:string}|null>}
 */
export async function getManagerAbove(employeeId) {
  if (!employeeId) return null;
  const emp = await getEmployee(employeeId);
  if (!emp || !emp.ManagerId) return null;
  const mgr = await getEmployee(emp.ManagerId);
  if (!mgr || !mgr.Email) return null;
  return { email: mgr.Email, name: mgr.ShortName || '' };
}

/**
 * Returns all employees whose derived roles include the given role.
 * Sorted by displayName, deduped by email.
 * @param {string} role - Derived role to filter by (e.g. 'mentor', 'mentor-manager').
 * @returns {Promise<Array<{ email: string, displayName: string, employeeId: string }>>}
 */
async function getUsersByDerivedRole(role) {
  const all = await getAllEmployees();
  const seen = new Set();
  const result = [];
  for (const emp of all) {
    if (!emp.Email) continue;
    const roles = deriveRoles(emp, all);
    if (!roles.includes(role)) continue;
    if (seen.has(emp.Email)) continue;
    seen.add(emp.Email);
    result.push({
      email: emp.Email,
      displayName: emp.ShortName || emp.Title || emp.Email,
      employeeId: emp.Title,
    });
  }
  return result.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Returns all users whose derived roles include 'mentor' (covers both 'mentor' and 'mentor-manager').
 * Sorted by displayName, deduped by email.
 * @returns {Promise<Array<{ email: string, displayName: string, employeeId: string }>>}
 */
export async function getMentorUsers() {
  return getUsersByDerivedRole('mentor');
}

/**
 * Returns all users whose derived roles include 'mentor-manager'.
 * Sorted by displayName, deduped by email.
 * @returns {Promise<Array<{ email: string, displayName: string, employeeId: string }>>}
 */
export async function getMentorManagers() {
  return getUsersByDerivedRole('mentor-manager');
}
