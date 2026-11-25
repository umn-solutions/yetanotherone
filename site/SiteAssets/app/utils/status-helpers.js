import { Container, Text } from '../libs/nofbiz/nofbiz.base.js';
import { STATUS_DESCRIPTIONS, MENTOR_MANAGER_LABELS } from './constants.js';

export const STATUS = {
  RASCUNHO: 'Rascunho',
  SUBMETIDO: 'Submetido',
  VALIDADO_MENTOR: 'Validado Mentor',
  EM_EXECUCAO: 'Em Execucao',
  EM_VALIDACAO_MENTOR: 'Em Validacao Mentor',
  EM_VALIDACAO_GESTOR: 'Em Validacao Gestor',
  EM_VALIDACAO_MM: 'Em Validacao Mentor Manager',
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
  STATUS.EM_VALIDACAO_MENTOR,
  STATUS.EM_VALIDACAO_GESTOR,
  STATUS.EM_VALIDACAO_MM,
  STATUS.IMPLEMENTADO,
];

/** Display-friendly labels for the UI (Portuguese). */
export const STATUS_LABELS = {
  [STATUS.RASCUNHO]: 'Rascunho',
  [STATUS.SUBMETIDO]: 'Em Validação',
  [STATUS.VALIDADO_MENTOR]: 'Validado Mentor',
  [STATUS.EM_EXECUCAO]: 'Em Execução',
  [STATUS.EM_VALIDACAO_MENTOR]: 'Em Validação pelo Mentor',
  [STATUS.EM_VALIDACAO_GESTOR]: 'Em Validação pelo Gestor',
  [STATUS.EM_VALIDACAO_MM]: 'Em Validação pelo Mentor Manager',
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
  [STATUS.EM_EXECUCAO]: [STATUS.EM_VALIDACAO_MENTOR, STATUS.CANCELADO],
  [STATUS.EM_VALIDACAO_MENTOR]: [STATUS.EM_VALIDACAO_GESTOR, STATUS.EM_REVISAO, STATUS.REJEITADO],
  [STATUS.EM_VALIDACAO_GESTOR]: [STATUS.EM_VALIDACAO_MM, STATUS.EM_REVISAO, STATUS.REJEITADO],
  [STATUS.EM_VALIDACAO_MM]: [STATUS.IMPLEMENTADO, STATUS.EM_REVISAO, STATUS.REJEITADO],
  [STATUS.EM_REVISAO]: [STATUS.SUBMETIDO, STATUS.EM_VALIDACAO_MENTOR],
};

/** Terminal statuses that cannot transition further. */
const TERMINAL = [STATUS.IMPLEMENTADO, STATUS.REJEITADO, STATUS.CANCELADO];

/** True when a status is terminal (cannot transition further). */
export function isTerminalStatus(status) {
  return TERMINAL.includes(status);
}

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
 * Returns true once the mentor has approved the project scope (base fields),
 * i.e. any status other than RASCUNHO / SUBMETIDO / EM_REVISAO-with-PreviousStatus-SUBMETIDO.
 * This no longer controls the edit lock; it marks base-field edits that must be audited
 * as POST_APPROVAL_EDIT events.
 * @param {string} status
 * @param {string} [previousStatus] - Required when status === EM_REVISAO
 * @returns {boolean}
 */
export function isPastProjectApproval(status, previousStatus) {
  if (status === STATUS.RASCUNHO || status === STATUS.SUBMETIDO) return false;
  if (status === STATUS.EM_REVISAO && previousStatus === STATUS.SUBMETIDO) return false;
  return true;
}

/** Statuses where the owner and collaborators may edit every field (base fields + metrics). */
const COLLABORATOR_EDIT_STATUSES = [
  STATUS.RASCUNHO,
  STATUS.SUBMETIDO,
  STATUS.VALIDADO_MENTOR,
  STATUS.EM_EXECUCAO,
  STATUS.EM_REVISAO,
];

/**
 * True while the owner/collaborators may still edit the initiative: up to the moment they
 * request savings validation (EM_VALIDACAO_MENTOR). Single source of truth for both the
 * owner Editar button (workflow-buttons.js) and the base-field lock (new-initiative.js).
 * @param {string} status
 * @returns {boolean}
 */
export function isCollaboratorEditStatus(status) {
  return COLLABORATOR_EDIT_STATUSES.includes(status);
}

/** Maps each status value to its unique CSS modifier class. */
const STATUS_CHIP_CLASS = {
  [STATUS.RASCUNHO]:            'pace-chip--st-rascunho',
  [STATUS.SUBMETIDO]:           'pace-chip--st-submetido',
  [STATUS.VALIDADO_MENTOR]:     'pace-chip--st-validado-mentor',
  [STATUS.EM_EXECUCAO]:         'pace-chip--st-em-execucao',
  [STATUS.EM_VALIDACAO_MENTOR]: 'pace-chip--st-em-validacao-mentor',
  [STATUS.EM_VALIDACAO_GESTOR]: 'pace-chip--st-em-validacao-gestor',
  [STATUS.EM_VALIDACAO_MM]:     'pace-chip--st-em-validacao-mm',
  [STATUS.IMPLEMENTADO]:        'pace-chip--st-implementado',
  [STATUS.EM_REVISAO]:          'pace-chip--st-em-revisao',
  [STATUS.REJEITADO]:           'pace-chip--st-rejeitado',
  [STATUS.CANCELADO]:           'pace-chip--st-cancelado',
};

/**
 * Returns the CSS modifier class for a status chip.
 * Unknown status returns empty string (renders with neutral base chip styles).
 * @param {string} status
 * @returns {string}
 */
export function chipClass(status) {
  return STATUS_CHIP_CLASS[status] || '';
}

/**
 * Returns the final-validation chip Text component for an IMPLEMENTADO initiative,
 * or null if the initiative is not IMPLEMENTADO or has no FinalValidationLabel.
 * @param {Object} initiative
 * @returns {Text|null}
 */
export function renderFinalValidationChip(initiative) {
  if (initiative.Status !== STATUS.IMPLEMENTADO) return null;
  const label = initiative.FinalValidationLabel;
  if (!label) return null;
  const labelClass = label === MENTOR_MANAGER_LABELS.PLACE
    ? 'pace-chip pace-chip--final-place'
    : 'pace-chip pace-chip--final-finance';
  return new Text(label, { type: 'span', class: labelClass });
}

/**
 * Returns the array of status chip(s) for an initiative: always the status chip,
 * plus the final-validation chip when the initiative is IMPLEMENTADO and has a label.
 * @param {Object} initiative
 * @returns {Text[]}
 */
export function buildStatusChips(initiative) {
  const statusChip = new Text(statusLabel(initiative.Status), { type: 'span', class: `pace-chip ${chipClass(initiative.Status)}` });
  const finalChip = renderFinalValidationChip(initiative);
  return finalChip ? [statusChip, finalChip] : [statusChip];
}

/**
 * Returns a Container with the initiative's status chip and, only once the
 * initiative reaches IMPLEMENTADO (Mentor Manager validation done), a second chip
 * showing the FinalValidationLabel. Before that, a lingering label is not shown --
 * a still-pending initiative must display only its status chip.
 * @param {Object} initiative
 * @returns {Container}
 */
export function renderStatusCell(initiative) {
  return new Container(buildStatusChips(initiative), { class: 'pace-status-cell' });
}