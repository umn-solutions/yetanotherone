export const APP_NAME = 'Place';
export const ORG_NAME = 'pcdfdpgrenhas';
export const MENTOR_TEAM_EMAIL = 'mentoria@place.pt'; // TODO: replace with real mentor team mailbox

export const EVENT_TYPES = {
  CREATION: 'Creation',
  SUBMISSION: 'Submission',
  MENTOR_APPROVAL: 'MentorApproval',
  MENTOR_REJECTION: 'MentorRejection',
  EXECUTION_START: 'ExecutionStart',
  SAVINGS_SUBMISSION: 'SavingsSubmission',
  BUSINESS_VALIDATION: 'BusinessValidation',
  BUSINESS_REJECTION: 'BusinessRejection',
  REVIEW_REQUEST: 'ReviewRequest',
  RESUBMISSION: 'Resubmission',
  CANCELLATION: 'Cancellation',
  TRANSFER: 'Transfer',
  MENTOR_FINAL_VALIDATION: 'MentorFinalValidation',
  MENTOR_MANAGER_VALIDATION: 'MentorManagerValidation',
  OWNER_IMPLEMENTATION: 'OwnerImplementation',
  EDIT_APPROVER: 'EditApprover',
};

// -- Final validation label constants --

export const SOFT_SAVINGS_THRESHOLD_EUR = 10000;

export const MENTOR_MANAGER_LABELS = {
  PLACE: 'Validado pela equipa de mentoria',
  AREA_FINANCEIRA: 'Validado pela área financeira',
};

// OrgHierarchy Category values that grant gestor role
// ('Top Management' was removed from the org schema; former Top Management is now 'Management')
export const GESTOR_CATEGORIES = ['EXECUTIVE', 'Management'];

// OrgHierarchy OUID values whose members are flagged as mentors on CSV import
export const MENTOR_OUIDS = ['COM-BKP'];

// SharePoint group that grants bootstrap admin access when OrgHierarchy is empty
export const BOOTSTRAP_ADMIN_GROUP = 'PACE Owners';

// -- Saving Categories (client matrix) --

export const SAVING_CATEGORIES = [
  'Redução de custos',
  'Aumento de Vendas(NBI)',
  'Redução de risco',
  'Custos e riscos evitados',
  'Redução de tempo de execução de tarefas',
  'Outros Benefícios Qualitativos',
];

export const HARD_CATEGORIES = [
  'Redução de custos', 'Aumento de Vendas(NBI)', 'Redução de risco',
  // inferred strings from new metric model:
  'Aumento de Produção (PNB)', 'Gastos Gerais', 'Redução do Custo do Risco',
];
export const SOFT_CATEGORIES = [
  'Custos e riscos evitados', 'Redução de tempo de execução de tarefas',
  // inferred strings from new metric model:
  'Eficiência Operacional', 'Custo ou Risco Evitado',
];

export const NO_FINANCIALS_CATEGORIES = [
  'Outros Benefícios Qualitativos', 'Redução de tempo de execução de tarefas',
  // inferred strings from new metric model:
  'Melhoria de Qualidade',
];

/**
 * Returns true if at least one selected category requires financial data.
 * @param {string | string[]} categories
 * @returns {boolean}
 */
export function hasFinancialData(categories) {
  const cats = Array.isArray(categories) ? categories : (categories ? [categories] : []);
  return cats.some(c => !NO_FINANCIALS_CATEGORIES.includes(c));
}

export const SAVING_CATEGORY_GUIDANCE = {
  'Outros Benefícios Qualitativos': 'Iniciativa sem impacto financeiro directo.',
  'Redução de custos': 'Redução de FTE, contratos temporários, despesas de prestadores, horas extra, material de escritório. Comparação com custos N-1 ou orçamento do Ano N.',
  'Aumento de Vendas(NBI)': 'Aumento de PNB via crescimento de vendas. Créditos, seguros, produtos complementares.',
  'Redução de risco': 'Melhoria de eficiência de cobrança, redução de taxa de reincidência.',
  'Custos e riscos evitados': 'Recrutamento evitado, coimas/penalizações/custos evitados, riscos evitados. Despesas previstas, não orçamentadas e não incorridas.',
  'Redução de tempo de execução de tarefas': 'Diminuição do tempo necessário para executar tarefas operacionais. Automatização, simplificação de processos, eliminação de passos redundantes.',
};

/**
 * Derives SavingType from SavingCategory (string or array of strings).
 * Priority: Hard > Soft > Outros.
 * @param {string | string[]} category
 * @returns {'Outros Benefícios Qualitativos' | 'Hard Cost' | 'Soft Cost'}
 */
export function deriveSavingType(category) {
  const cats = Array.isArray(category) ? category : (category ? [category] : []);
  if (cats.some(c => HARD_CATEGORIES.includes(c))) return 'Hard Cost';
  if (cats.some(c => SOFT_CATEGORIES.includes(c))) return 'Soft Cost';
  return 'Outros Benefícios Qualitativos';
}

// -- FTE capacity model --
export const WORKDAYS_PER_YEAR = 252;      // work days per year
export const WORK_HOURS_PER_DAY = 8;       // hours per work day
export const FTE_HOURS_PER_MONTH = 158.4;  // 1 FTE monthly capacity
// Annual FTE capacity in minutes: 158.4 h/mo * 12 mo * 60 min = 114048
export const FTE_MINUTES_PER_YEAR = FTE_HOURS_PER_MONTH * 12 * 60;

// -- Annualization --

export const ANNUALIZATION_FACTORS = {
  'Diario': WORKDAYS_PER_YEAR,
  'Mensal': 12,
};

/**
 * Annualizes a per-period savings value.
 * @param {string|number} value - The per-period value
 * @param {string} timePeriod - One of: Diario, Mensal
 * @returns {number} Annualized value (0 if inputs are invalid)
 */
export function annualizeSavings(value, timePeriod) {
  const num = parseFloat(String(value).replace(/[^\d.]/g, '')) || 0;
  const factor = ANNUALIZATION_FACTORS[timePeriod] || 0;
  return num * factor;
}

export const STATUS_DESCRIPTIONS = {
  'Rascunho':        'Iniciativa em elaboração, ainda não submetida para validação.',
  'Submetido':       'Aguarda validação pelo mentor.',
  'Validado Mentor': 'Aprovado pelo mentor.',
  'Em Execucao':     'Iniciativa em execução activa.',
  'Por Validar':     'Savings submetidos, aguarda validação pelo gestor.',
  'Validado Gestor': 'Savings validados pelo gestor, aguarda confirmação final.',
  'Validado Final':  'Confirmado pelo mentor. Aguarda validação final pelo manager da equipa de mentores.',
  'Implementado':    'Iniciativa implementada e concluída com sucesso.',
  'Em Revisao':      'Devolvida para revisão antes de nova submissão.',
  'Rejeitado':       'Iniciativa rejeitada pelo avaliador.',
  'Cancelado':       'Iniciativa cancelada.',
};

export const INITIATIVE_TAGS = [
  'Automação de Processo',
  'Organização',
  'Conhecimento e formação',
  'Reputação e satisfação de cliente/parceiro',
  'Aumento da produção',
  'Padronização',
  'Otimização de processos',
  'Redução de custos',
  'IA',
];

// -- Multi-category financial forms metadata --

export const CATEGORY_KEYS = ['eficiencia', 'producao', 'gastos', 'reducao_risco', 'reducao_custo', 'qualidade'];

export const CATEGORY_LABELS = {
  eficiencia:    'Eficiência',
  producao:      'Produção',
  gastos:        'Redução de Custo | Redução OPEX',
  reducao_risco: 'Redução de Custo de Risco',
  reducao_custo: 'Custo ou Risco Evitado',
  qualidade:     'Qualidade',
};

/** Hover tooltip (native title attr) shown on each metric add-button. */
export const METRIC_DESCRIPTIONS = {
  producao:      'Aumento de PNB resultante do aumento de produção',
  gastos:        'Redução de FTEs, redução das despesas com contratos temporários, redução de despesas com outsourcings/fornecedores, redução do tempo de trabalho extra, redução de custos com material de escritório ou correio',
  reducao_risco: 'Melhoria do processo de recuperação, redução de taxa de reincidência na recuperação de crédito',
  eficiencia:    'Redução de tempo/volume de tarefas',
  reducao_custo: 'Custo evitado: recrutamento evitado, multas e penalizações evitadas. Risco evitado: provisões evitadas',
  qualidade:     'Aumento da taxa de satisfação do cliente ou parceiro (fidelização, imagem), alterações com impacto na qualidade',
};

// 'decrease' = saving = AsIs - ToBe (Eficiencia time, Gastos cost, Reducao Risco, Reducao Custo)
// 'increase' = gain   = ToBe - AsIs (Producao revenue)
export const CATEGORY_DIRECTIONS = {
  eficiencia:    'decrease',
  producao:      'increase',
  gastos:        'decrease',
  reducao_risco: 'decrease',
  reducao_custo: 'decrease',
};

// Maps internal key to the SP list field name that stores the JSON payload
export const CATEGORY_FIELD_NAMES = {
  eficiencia:    'EficienciaData',
  producao:      'ProducaoData',
  gastos:        'GastosGeraisData',
  reducao_risco: 'ReducaoRiscoData',
  reducao_custo: 'ReducaoCustoData',
  qualidade:     'QualidadeData',
};

/**
 * Derives the flat annualized-saving column name for a category key.
 * e.g. 'reducao_custo' -> 'ReducaoCustoAnnualSaving'. Single source shared by
 * the CSV export (initiatives-export) and the IMPLEMENTED email table (emails).
 * @param {string} key - one of CATEGORY_KEYS
 * @returns {string}
 */
export function annualSavingColName(key) {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase()) + 'AnnualSaving';
}

/**
 * Per-category input field keys (order matters for column output).
 * Eficiencia:    vp (Volume processado), tu (Tempo tratamento unitario)
 * Producao:      vp (Volume), mu (Montante medio unitario)
 * Gastos:        v  (Volume), c  (Custo unitario)
 * ReducaoRisco:  exp (Exposição ao risco), taxa (Taxa de provisionamento %)
 * ReducaoCusto:  co (Custos operacionais)
 */
export const INPUT_KEYS_BY_CATEGORY = {
  eficiencia:    ['vp', 'tu'],
  producao:      ['vp', 'mu'],
  gastos:        ['v', 'c'],
  reducao_risco: ['exp', 'taxa'],
  reducao_custo: ['co'],
};

/** Human-readable labels for each input field, keyed by category then input key. */
export const INPUT_LABELS_BY_CATEGORY = {
  eficiencia: {
    vp: 'Volume de Unidades Processadas',
    tu: 'Tempo Médio por Unidade (min)',
  },
  producao: {
    vp: 'Volume de Unidades',
    mu: 'Valor Médio por Unidade (€)',
  },
  gastos: {
    v: 'Volume de Unidades',
    c: 'Custo Unitário (€)',
  },
  reducao_risco: {
    exp:  'Exposição ao risco (€)',
    taxa: 'Taxa de provisionamento (%)',
  },
  reducao_custo: {
    co: 'Custos operacionais (€)',
  },
  // qualidade has no numeric inputs -- omitted intentionally (text-only metric)
};

// -- Metric-to-saving inference map --

/**
 * Maps each metric key to its inferred saving category and type.
 * Used to auto-derive SavingCategory/SavingType when the user adds metrics.
 */
export const METRIC_SAVING_INFERENCE = {
  producao:      { category: 'Aumento de Produção (PNB)',   type: 'Hard Cost' },
  gastos:        { category: 'Gastos Gerais',               type: 'Hard Cost' },
  reducao_risco: { category: 'Redução do Custo do Risco',   type: 'Hard Cost' },
  eficiencia:    { category: 'Eficiência Operacional',      type: 'Soft Cost' },
  reducao_custo: { category: 'Custo ou Risco Evitado',      type: 'Soft Cost' },
  qualidade:     { category: 'Melhoria de Qualidade',       type: 'Soft Cost' },
};

/**
 * Returns a deduplicated array of inferred saving categories from the given metric keys.
 * @param {string[]} keys - Metric keys (subset of CATEGORY_KEYS)
 * @returns {string[]}
 */
export function inferCategoriesFromMetrics(keys) {
  const cats = [];
  for (const key of keys) {
    const inf = METRIC_SAVING_INFERENCE[key];
    if (inf && !cats.includes(inf.category)) cats.push(inf.category);
  }
  return cats;
}

/**
 * Infers the overall SavingType from the given metric keys.
 * Priority: Hard Cost > Soft Cost > Outros Benefícios Qualitativos.
 * @param {string[]} keys - Metric keys
 * @returns {'Hard Cost'|'Soft Cost'|'Outros Benefícios Qualitativos'}
 */
export function inferSavingTypeFromMetrics(keys) {
  let hasSoft = false;
  for (const key of keys) {
    const inf = METRIC_SAVING_INFERENCE[key];
    if (!inf) continue;
    if (inf.type === 'Hard Cost') return 'Hard Cost';
    if (inf.type === 'Soft Cost') hasSoft = true;
  }
  return hasSoft ? 'Soft Cost' : 'Outros Benefícios Qualitativos';
}

/**
 * Metric keys that carry no numeric/financial data (text-only metrics).
 * These are excluded from € totals and from numeric validation.
 */
export const NO_FINANCIAL_METRICS = ['qualidade'];

/**
 * Returns true if at least one of the given metric keys produces financial data.
 * @param {string[]} keys
 * @returns {boolean}
 */
export function metricsHaveFinancialData(keys) {
  if (!Array.isArray(keys)) return false;
  return keys.some(k => !NO_FINANCIAL_METRICS.includes(k));
}

/** Short display label for a SavingType. Passes unknown values through unchanged. */
export function formatSavingTypeShort(type) {
  if (type === 'Hard Cost') return 'Hard';
  if (type === 'Soft Cost') return 'Soft';
  return type || '-';
}
