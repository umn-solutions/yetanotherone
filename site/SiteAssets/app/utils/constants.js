export const APP_NAME = 'Place';
export const ORG_NAME = 'pcdfdpgrenhas';

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
  PLACE: 'Validado pela equipa PLACE',
  AREA_FINANCEIRA: 'Validado pela área financeira',
};

// OrgHierarchy Category values that grant gestor role
export const GESTOR_CATEGORIES = ['Executive', 'Top Management', 'Management'];

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

export const HARD_CATEGORIES = ['Redução de custos', 'Aumento de Vendas(NBI)', 'Redução de risco'];
export const SOFT_CATEGORIES = ['Custos e riscos evitados', 'Redução de tempo de execução de tarefas'];

export const NO_FINANCIALS_CATEGORIES = ['Outros Benefícios Qualitativos', 'Redução de tempo de execução de tarefas'];

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

// -- Annualization --

export const ANNUALIZATION_FACTORS = {
  'Diario': 252,
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
  'Automação de processos',
  'Conhecimento e formação',
  'Excel, VBA e PowerBI',
  'Gestão de dados',
  'Gestão de incidentes',
  'IA (Inteligência Artificial)',
  'Indicadores de Desempenho',
  'Organização',
  'Padronização',
  'Procedimentos',
  'Redução de erros',
  'Reputação e satisfação do cliente',
];

// -- Multi-category financial forms metadata --

export const CATEGORY_KEYS = ['eficiencia', 'producao', 'gastos', 'reducao_risco', 'reducao_custo'];

export const CATEGORY_LABELS = {
  eficiencia:    'Eficiência',
  producao:      'Produção',
  gastos:        'Gastos Gerais',
  reducao_risco: 'Redução de risco',
  reducao_custo: 'Redução de custo',
};

// 'decrease' = saving = AsIs - ToBe (Eficiencia time, Gastos cost)
// 'increase' = gain   = ToBe - AsIs (Producao revenue, Reducao Risco, Reducao Custo)
export const CATEGORY_DIRECTIONS = {
  eficiencia:    'decrease',
  producao:      'increase',
  gastos:        'decrease',
  reducao_risco: 'increase',
  reducao_custo: 'increase',
};

// Maps internal key to the SP list field name that stores the JSON payload
export const CATEGORY_FIELD_NAMES = {
  eficiencia:    'EficienciaData',
  producao:      'ProducaoData',
  gastos:        'GastosGeraisData',
  reducao_risco: 'ReducaoRiscoData',
  reducao_custo: 'ReducaoCustoData',
};
