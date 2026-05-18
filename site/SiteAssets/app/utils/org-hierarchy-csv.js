import { parseCSV, parseXLSX } from '../libs/nofbiz/nofbiz.excelparser.js';

/**
 * Canonical required CSV headers -- exactly the keys read by mapCSVRow.
 */
const REQUIRED_HEADERS = [
  'Pessoa',
  'Nome Abreviado',
  'Manager ID',
  'Email direct',
  'Categoria (Descrição)',
  'DIREÇÃO',
  'Departamento',
  'OU ID',
  'OU desc',
];

/**
 * Removes diacritics from a string for case/accent-insensitive comparison.
 * @param {string} str
 * @returns {string}
 */
function stripDiacritics(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Normalizes a header string for comparison (strip diacritics + lowercase + trim).
 * @param {string} h
 * @returns {string}
 */
function normalizeHeader(h) {
  return stripDiacritics(h).toLowerCase().trim();
}

/**
 * Maps a CSV row (keyed by canonical names) to an OrgHierarchy record.
 * Exported so org-hierarchy-api.js can reuse it without duplication.
 * @param {Object} row - Row keyed by canonical header names
 * @returns {Object}
 */
export function mapCSVRow(row) {
  return {
    Title: String(row['Pessoa'] || '').trim(),
    ShortName: String(row['Nome Abreviado'] || '').trim(),
    ManagerId: String(row['Manager ID'] || '').trim(),
    Email: String(row['Email direct'] || '').trim(),
    Category: String(row['Categoria (Descrição)'] || '').trim(),
    Direcao: String(row['DIREÇÃO'] || '').trim(),
    Departamento: String(row['Departamento'] || '').trim(),
    OUID: String(row['OU ID'] || '').trim(),
    OUDesc: String(row['OU desc'] || '').trim(),
  };
}

/**
 * Validates an org hierarchy file (CSV string or XLSX ArrayBuffer).
 *
 * Returns one of:
 *   { ok: true,  persons: Map<string, Object>, rootId: string, warnings: string[] }
 *   { ok: false, fatal: string[], warnings: string[] }
 *
 * Fatal errors prevent any SharePoint writes. Warnings are informational
 * (skipped rows, non-blocking issues) and are forwarded to the caller.
 *
 * @param {string|ArrayBuffer|Uint8Array} input - CSV text or XLSX binary
 * @returns {Promise<{ ok: boolean, persons?: Map, rootId?: string, fatal?: string[], warnings: string[] }>}
 */
export async function validateOrgCSV(input) {
  const fatal = [];
  const warnings = [];

  // 1. Parse (CSV string or XLSX binary)
  let data, headers;
  try {
    const parsed = typeof input === 'string'
      ? parseCSV(input)
      : await parseXLSX(input);
    data = parsed.data;
    headers = parsed.headers;
  } catch (err) {
    console.error('[org-hierarchy-csv] parse failed', err);
    return { ok: false, fatal: [`Não foi possível ler o ficheiro: ${err.message}`], warnings };
  }

  if (!data || data.length === 0) {
    return { ok: false, fatal: ['O CSV não tem linhas de dados.'], warnings };
  }

  // 2. Schema check: required headers (case/accent-insensitive)
  // Build a lookup: normalized header -> original header value from file
  const normalizedFileHeaders = new Map(
    (headers || []).map(h => [normalizeHeader(h), h])
  );

  // For each required header, find its match in the file headers
  // Then build a remap: canonical name -> actual column name in parsed rows
  const canonicalToActual = new Map();
  for (const canonical of REQUIRED_HEADERS) {
    const normalizedCanonical = normalizeHeader(canonical);
    const actualHeader = normalizedFileHeaders.get(normalizedCanonical);
    if (!actualHeader) {
      fatal.push(`Coluna obrigatória em falta: "${canonical}"`);
    } else {
      canonicalToActual.set(canonical, actualHeader);
    }
  }

  if (fatal.length > 0) {
    return { ok: false, fatal, warnings };
  }

  // 3. Remap rows to canonical keys so mapCSVRow works correctly
  const canonicalRows = data.map(row => {
    const remapped = {};
    for (const [canonical, actual] of canonicalToActual) {
      remapped[canonical] = row[actual];
    }
    return remapped;
  });

  // 4. Row pass: build personMap, collect warnings, find root
  const personMap = new Map();
  const rowNumbers = new Map(); // id -> 1-based row number (header=1, first data row=2)
  let rootId = null;
  let rootRowNumber = null;

  for (let i = 0; i < canonicalRows.length; i++) {
    const rowNumber = i + 2; // header is row 1
    const mapped = mapCSVRow(canonicalRows[i]);
    const id = mapped.Title;

    if (!id) {
      warnings.push(`linha ${rowNumber}: campo 'Pessoa' vazio -- linha ignorada.`);
      continue;
    }

    if (personMap.has(id)) {
      fatal.push(`linha ${rowNumber}: ID duplicado "${id}" (primeira ocorrência na linha ${rowNumbers.get(id)}).`);
      continue;
    }

    // Email smoke check
    if (mapped.Email && !mapped.Email.includes('@')) {
      warnings.push(`linha ${rowNumber}: email inválido "${mapped.Email}".`);
    }

    personMap.set(id, mapped);
    rowNumbers.set(id, rowNumber);

    if (!mapped.ManagerId) {
      if (rootId !== null) {
        fatal.push(
          `Múltiplos colaboradores raiz: "${rootId}" (linha ${rootRowNumber}) e "${id}" (linha ${rowNumber}).`
        );
      } else {
        rootId = id;
        rootRowNumber = rowNumber;
      }
    }
  }

  // 5. No root check
  if (rootId === null && fatal.length === 0) {
    fatal.push('Nenhum colaborador raiz encontrado (todos têm manager preenchido).');
  }

  if (fatal.length > 0) {
    return { ok: false, fatal, warnings };
  }

  // 6. Reference resolution: every non-root must have a known manager
  for (const [id, person] of personMap) {
    if (person.ManagerId && !personMap.has(person.ManagerId)) {
      fatal.push(
        `linha ${rowNumbers.get(id)}: colaborador "${id}" referencia manager desconhecido "${person.ManagerId}".`
      );
    }
  }

  if (fatal.length > 0) {
    return { ok: false, fatal, warnings };
  }

  // 7. Cycle detection: BFS from root -- unreachable nodes indicate a cycle or orphan branch
  const visited = new Set();
  const bfsQueue = [rootId];
  visited.add(rootId);

  while (bfsQueue.length > 0) {
    const currentId = bfsQueue.shift();
    for (const [childId, child] of personMap) {
      if (child.ManagerId === currentId && !visited.has(childId)) {
        visited.add(childId);
        bfsQueue.push(childId);
      }
    }
  }

  const unreachable = [];
  for (const id of personMap.keys()) {
    if (!visited.has(id)) {
      unreachable.push(`${id} (linha ${rowNumbers.get(id)})`);
    }
  }

  if (unreachable.length > 0) {
    fatal.push(
      `Ciclo detectado ou ramo órfão -- colaboradores não alcançáveis a partir da raiz: ${unreachable.join(', ')}.`
    );
    return { ok: false, fatal, warnings };
  }

  return { ok: true, persons: personMap, rootId, warnings };
}
