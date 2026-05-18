import { STATUS_DESCRIPTIONS } from './constants.js';

export const STATUS = {
  RASCUNHO: 'Rascunho',
  SUBMETIDO: 'Submetido',
  VALIDADO_MENTOR: 'Validado Mentor',
  EM_EXECUCAO: 'Em Execucao',
  POR_VALIDAR: 'Por Validar',
  VALIDADO_GESTOR: 'Validado Gestor',
  VALIDADO_FINAL: 'Validado Final',
  IMPLEMENTADO: 'Implementado',
  EM_REVISAO: 'Em Revisao',
  REJEITADO: 'Rejeitado',
  CANCELADO: 'Cancelado',
};

/** Linear progression for the standard PDCA lifecycle. */
export const STATUS_FLOW = [
  STATUS.RASCUNHO,
  STATUS.SUBMETIDO,
  STATUS.VALIDADO_MENTOR,
  STATUS.EM_EXECUCAO,
  STATUS.POR_VALIDAR,
  STATUS.VALIDADO_GESTOR,
  STATUS.VALIDADO_FINAL,
  STATUS.IMPLEMENTADO,
];

/** Display-friendly labels for the UI (Portuguese). */
export const STATUS_LABELS = {
  [STATUS.RASCUNHO]: 'Rascunho',
  [STATUS.SUBMETIDO]: 'Em Validação Projecto',
  [STATUS.VALIDADO_MENTOR]: 'Validado Mentor',
  [STATUS.EM_EXECUCAO]: 'Em Execução',
  [STATUS.POR_VALIDAR]: 'Em Validação Savings',
  [STATUS.VALIDADO_GESTOR]: 'Validado Gestor',
  [STATUS.VALIDADO_FINAL]: 'Validado Final',
  [STATUS.IMPLEMENTADO]: 'Implementado',
  [STATUS.EM_REVISAO]: 'Em Revisão',
  [STATUS.REJEITADO]: 'Rejeitado',
  [STATUS.CANCELADO]: 'Cancelado',
};

/**
 * Valid status transitions. Each key maps to the list of statuses it can move to.
 * Cancellation by owner is handled separately (any non-terminal -> Cancelado).
 */
const TRANSITIONS = {
  [STATUS.RASCUNHO]: [STATUS.SUBMETIDO],
  [STATUS.SUBMETIDO]: [STATUS.VALIDADO_MENTOR, STATUS.EM_REVISAO, STATUS.REJEITADO],
  [STATUS.VALIDADO_MENTOR]: [STATUS.EM_EXECUCAO],
  [STATUS.EM_EXECUCAO]: [STATUS.POR_VALIDAR, STATUS.CANCELADO],
  [STATUS.POR_VALIDAR]: [STATUS.VALIDADO_GESTOR, STATUS.EM_REVISAO, STATUS.REJEITADO],
  [STATUS.VALIDADO_GESTOR]: [STATUS.VALIDADO_FINAL, STATUS.IMPLEMENTADO, STATUS.EM_REVISAO, STATUS.REJEITADO],
  [STATUS.VALIDADO_FINAL]: [STATUS.IMPLEMENTADO, STATUS.EM_REVISAO, STATUS.REJEITADO],
  [STATUS.EM_REVISAO]: [STATUS.SUBMETIDO, STATUS.POR_VALIDAR],
};

/** Terminal statuses that cannot transition further. */
const TERMINAL = [STATUS.IMPLEMENTADO, STATUS.REJEITADO, STATUS.CANCELADO];

/**
 * Checks if a transition from currentStatus to targetStatus is valid.
 * @param {string} currentStatus
 * @param {string} targetStatus
 * @returns {boolean}
 */
export function canTransitionTo(currentStatus, targetStatus) {
  // Owner cancellation: any non-terminal status can move to Cancelado
  if (targetStatus === STATUS.CANCELADO && !TERMINAL.includes(currentStatus)) {
    return true;
  }

  const allowed = TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(targetStatus);
}

/**
 * Returns the next status in the standard STATUS_FLOW progression,
 * or null if the current status is terminal or not on the main flow
 * (EM_REVISAO, REJEITADO, CANCELADO return null).
 * @param {string} currentStatus
 * @returns {string|null}
 */
export function getNextFlowStatus(currentStatus) {
  const idx = STATUS_FLOW.indexOf(currentStatus);
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}

/**
 * Returns the display-friendly label for a status value.
 * Falls back to the raw status string if no label is defined.
 * @param {string} status
 * @returns {string}
 */
export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

/**
 * Returns the full descriptive sentence for a status value.
 * Falls back to statusLabel() if no description is defined.
 * @param {string} status
 * @returns {string}
 */
export function statusDescription(status) {
  return STATUS_DESCRIPTIONS[status] || statusLabel(status);
}

/**
 * Returns true when base fields (Title, Description, ImpactedTeamOUID, Tags,
 * IsConfidential, Objective) should be rendered read-only.
 * Base fields are editable only while the initiative is in RASCUNHO or SUBMETIDO,
 * OR in EM_REVISAO when the revision was triggered before mentor approval
 * (PreviousStatus === SUBMETIDO). Once VALIDADO_MENTOR or any later status is
 * reached they are locked for everyone, including validator approvers.
 * @param {string} status
 * @param {string} [previousStatus] - Required when status === EM_REVISAO
 * @returns {boolean}
 */
export function areBaseFieldsLocked(status, previousStatus) {
  if (status === STATUS.RASCUNHO || status === STATUS.SUBMETIDO) return false;
  if (status === STATUS.EM_REVISAO && previousStatus === STATUS.SUBMETIDO) return false;
  return true;
}

/**
 * Returns the CSS class for a status chip.
 * @param {string} status
 * @returns {string}
 */
export function chipClass(status) {
  if (status === STATUS.IMPLEMENTADO) return 'pace-chip--done';
  if (status === STATUS.CANCELADO || status === STATUS.RASCUNHO) return 'pace-chip--inactive';
  if (status === STATUS.EM_REVISAO || status === STATUS.REJEITADO) return 'pace-chip--revision';
  if (status === STATUS.SUBMETIDO || status === STATUS.POR_VALIDAR) return 'pace-chip--pending';
  return 'pace-chip--active';
}