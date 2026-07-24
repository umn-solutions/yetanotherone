import {
  Dialog,
  Toast,
  TextArea,
  DateInput,
  FormField,
  Container,
  Text,
  Button,
  ContextStore,
  ComboBox,
  FieldLabel,
  extractComboBoxValue,
  UserIdentity,
  SystemError,
  PeoplePicker,
  __dayjs,
} from '../libs/nofbiz/nofbiz.base.js';

import { STATUS, canTransitionTo, statusLabel } from './status-helpers.js';
import { canAccess, isMentorUser, canManageAccess } from './roles.js';
import { transitionStatus, update, deleteItem as deleteInitiativeItem } from './initiatives-api.js';
import {
  createEvent,
  getByInitiative as getEvents,
  deleteItem as deleteEvent,
} from './initiative-events-api.js';
import {
  getByInitiative as getNotifications,
  deleteItem as deleteNotification,
} from './notifications-api.js';
import { createEmail, EMAIL_EVENTS } from './emails.js';
import { EVENT_TYPES, deriveSavingType } from './constants.js';
import { assertToBeComplete, computeAnnualizedToBeTotalEur, resolveFinalValidationLabel } from './financial-forms.js';
import { getAssignedGestor } from './routing-rules.js';
import {
  getByInitiative as getFinancials,
  deleteItem as deleteFinancials,
} from './financials-api.js';
import { getAllEmployees, deriveRoles, getManagerAbove } from './org-hierarchy-api.js';
import {
  shareInitiative,
  getAllByInitiative as getAllSharedRecords,
  unshareInitiative as deleteSharedRecord,
  revokeAccess,
  getShareAccessType,
} from './shared-api.js';
import {
  getByInitiative as getComments,
  deleteItem as deleteComment,
} from './comments-api.js';

// On HTTP 412 ETag mismatch SPARC throws SystemError('ConcurrencyConflict').
// Replace the generic action-failure copy with a reload instruction so the
// user knows the record was modified elsewhere.
function actionErrorMessage(error, defaultMsg) {
  if (error?.name === 'ConcurrencyConflict') {
    return 'A iniciativa foi modificada por outro utilizador. Recarregue a página e tente novamente.';
  }
  return defaultMsg;
}

// -- Confirmation helpers (DRY) --

/**
 * Shows a simple confirmation Dialog and returns a Promise<boolean>.
 * @param {string} title
 * @param {string} message
 * @param {{ confirmLabel?: string, cancelLabel?: string, variant?: 'info'|'warning'|'error' }} [opts]
 * @returns {Promise<boolean>}
 */
function confirm(title, message, opts = {}) {
  const {
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    variant = 'warning',
  } = opts;

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title,
      variant,
      class: 'pt-v2',
      content: new Text(message, { type: 'p' }),
      backdrop: true,
      closeOnFocusLoss: false,
      containerSelector: 'body',
      footer: [
        new Button(cancelLabel, {
          variant: 'secondary',
          onClickHandler: () => {
            dialog.close();
            dialog.remove();
            resolve(false);
          },
        }),
        new Button(confirmLabel, {
          variant: variant === 'error' ? 'danger' : 'primary',
          onClickHandler: () => {
            dialog.close();
            dialog.remove();
            resolve(true);
          },
        }),
      ],
    });
    dialog.render();
    dialog.open();
  });
}

/**
 * Shows a confirmation Dialog with a mandatory comment TextArea.
 * Returns the comment string on confirm, or null on cancel/empty comment.
 * @param {string} title
 * @param {string} message
 * @param {{ confirmLabel?: string, cancelLabel?: string, variant?: 'info'|'warning'|'error', placeholder?: string }} [opts]
 * @returns {Promise<string|null>}
 */
function confirmWithComment(title, message, opts = {}) {
  const {
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    variant = 'error',
    placeholder = 'Comentário (obrigatório)...',
  } = opts;

  const commentField = new FormField({ value: '' });
  const commentInput = new TextArea(commentField, { placeholder, rows: 3 });

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title,
      variant,
      class: 'pt-v2',
      content: new Container([
        new Text(message, { type: 'p' }),
        commentInput,
      ]),
      backdrop: true,
      closeOnFocusLoss: false,
      containerSelector: 'body',
      footer: [
        new Button(cancelLabel, {
          variant: 'secondary',
          onClickHandler: () => {
            dialog.close();
            dialog.remove();
            commentField.dispose();
            resolve(null);
          },
        }),
        new Button(confirmLabel, {
          variant: 'danger',
          onClickHandler: () => {
            const comment = commentField.value?.trim() || '';
            dialog.close();
            dialog.remove();
            commentField.dispose();
            if (!comment) {
              Toast.error('O comentário é obrigatório.');
              resolve(null);
              return;
            }
            resolve(comment);
          },
        }),
      ],
    });
    dialog.render();
    dialog.open();
  });
}

/**
 * Shows a confirmation Dialog with a mandatory DateInput.
 * Returns the date string on confirm, or null on cancel/empty input.
 * @param {string} title
 * @param {string} message
 * @param {{ confirmLabel?: string, cancelLabel?: string, variant?: 'info'|'warning'|'error', label?: string, placeholder?: string, defaultValue?: string }} [opts]
 * @returns {Promise<string|null>}
 */
export function confirmWithDate(title, message, opts = {}) {
  const {
    confirmLabel = 'Confirmar',
    cancelLabel = 'Cancelar',
    variant = 'info',
    label = 'Data prevista de conclusão',
    placeholder = 'AAAA-MM-DD',
    defaultValue = '',
  } = opts;

  const dateField = new FormField({ value: defaultValue });
  const dateInput = new DateInput(dateField, { placeholder });

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title,
      variant,
      class: 'pace-dialog--overflow-visible pt-v2',
      content: new Container([
        new Text(message, { type: 'p' }),
        new FieldLabel(label, dateInput),
      ]),
      backdrop: true,
      closeOnFocusLoss: false,
      containerSelector: 'body',
      footer: [
        new Button(cancelLabel, {
          variant: 'secondary',
          onClickHandler: () => {
            dialog.close();
            dialog.remove();
            dateField.dispose();
            resolve(null);
          },
        }),
        new Button(confirmLabel, {
          variant: 'primary',
          onClickHandler: () => {
            const value = (dateField.value || '').trim();
            if (!value) {
              Toast.error('Indique a data prevista de conclusão.');
              return;
            }
            dialog.close();
            dialog.remove();
            dateField.dispose();
            resolve(value);
          },
        }),
      ],
    });
    dialog.render();
    dialog.open();
  });
}

/**
 * Shows a confirmation Dialog with a ComboBox (from pre-built options) and optional comment TextArea.
 * Returns { person, comment } on confirm, or null on cancel/empty selection.
 * @param {string} title
 * @param {string} message
 * @param {Array<{label: string, value: any}>} options - Pre-built ComboBox options
 * @returns {Promise<{ person: any, comment: string } | null>}
 */
function confirmWithEmployeeComboBox(title, message, options) {
  const personField = new FormField({ value: null });
  const commentField = new FormField({ value: '' });

  const personCombo = new ComboBox(personField, options, { placeholder: 'Selecionar...' });
  const commentInput = new TextArea(commentField, { placeholder: 'Comentário (opcional)...', rows: 3 });

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title,
      variant: 'info',
      class: 'pace-dialog--overflow-visible pt-v2',
      content: new Container([
        new Text(message, { type: 'p' }),
        new FieldLabel('Pessoa', personCombo),
        personCombo,
        new FieldLabel('Comentário', commentInput),
        commentInput,
      ]),
      backdrop: true,
      closeOnFocusLoss: false,
      containerSelector: 'body',
      footer: [
        new Button('Cancelar', {
          variant: 'secondary',
          onClickHandler: () => {
            dialog.close();
            dialog.remove();
            personField.dispose();
            commentField.dispose();
            resolve(null);
          },
        }),
        new Button('Confirmar', {
          variant: 'primary',
          onClickHandler: () => {
            if (!personField.value) {
              Toast.error('Selecione uma pessoa.');
              return;
            }
            const person = personField.value;
            const comment = commentField.value?.trim() || '';
            dialog.close();
            dialog.remove();
            personField.dispose();
            commentField.dispose();
            resolve({ person, comment });
          },
        }),
      ],
    });
    dialog.render();
    dialog.open();
  });
}

/**
 * Shows a confirmation Dialog with a person ComboBox (sourced from OrgHierarchy),
 * access type ComboBox, and optional comment TextArea.
 * Returns { person: UserIdentity, type: string, comment: string } on confirm, or null on cancel.
 * @param {string} title
 * @param {string} message
 * @returns {Promise<{ person: UserIdentity, type: string, comment: string } | null>}
 */
async function confirmWithUserComboBox(title, message) {
  const allEmployees = await getAllEmployees();
  const currentEmail = ContextStore.get('currentUser').get('email');
  const personOptions = allEmployees
    .filter(emp => emp.Email && emp.Email !== currentEmail)
    .map(emp => ({
      label: emp.ShortName,
      value: new UserIdentity(emp.Email, emp.ShortName),
    }));

  // Gestores may only grant read access; other roles may also grant collaborate.
  const canShareCollaborate = canAccess('partilhar_colaborar');
  const readOption = { label: 'Leitura', value: 'read' };
  const typeOptions = canShareCollaborate
    ? [readOption, { label: 'Colaboração', value: 'collaborate' }]
    : [readOption];

  const personField = new FormField({ value: null });
  const typeField = new FormField({ value: canShareCollaborate ? null : readOption });
  const commentField = new FormField({ value: '' });

  const personCombo = new ComboBox(personField, personOptions, { placeholder: 'Selecionar pessoa...' });
  const typeCombo = new ComboBox(typeField, typeOptions, { placeholder: 'Selecionar...', isDisabled: !canShareCollaborate });
  const commentInput = new TextArea(commentField, { placeholder: 'Comentário (opcional)...', rows: 3 });

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title,
      variant: 'info',
      class: 'pace-dialog--overflow-visible pt-v2',
      content: new Container([
        new Text(message, { type: 'p' }),
        new FieldLabel('Pessoa', personCombo),
        personCombo,
        new FieldLabel('Tipo de Acesso', typeCombo),
        typeCombo,
        new FieldLabel('Comentário', commentInput),
        commentInput,
      ]),
      backdrop: true,
      closeOnFocusLoss: false,
      containerSelector: 'body',
      footer: [
        new Button('Cancelar', {
          variant: 'secondary',
          onClickHandler: () => {
            dialog.close();
            dialog.remove();
            personField.dispose();
            typeField.dispose();
            commentField.dispose();
            resolve(null);
          },
        }),
        new Button('Confirmar', {
          variant: 'primary',
          onClickHandler: () => {
            if (!personField.value) {
              Toast.error('Selecione uma pessoa.');
              return;
            }
            if (!typeField.value) {
              Toast.error('Selecione o tipo de acesso.');
              return;
            }
            const extracted = extractComboBoxValue(personField.value);
            const person = new UserIdentity(extracted.email, extracted.displayName);
            const type = extractComboBoxValue(typeField.value);
            const comment = commentField.value?.trim() || '';
            dialog.close();
            dialog.remove();
            personField.dispose();
            typeField.dispose();
            commentField.dispose();
            resolve({ person, type, comment });
          },
        }),
      ],
    });
    dialog.render();
    dialog.open();
  });
}

// -- Workflow actions --

/**
 * Finalize a SUBMETIDO transition by writing the audit event and notifying the
 * Mentor (when assigned). Caller is responsible for the persistence step:
 * `transitionStatus` from the side panel, or `update`/`create` with `Status`
 * baked in from the wizard. Does NOT mutate state itself.
 *
 * Future expansion (parked under notifications block CF-3 + CF-2): fan out to
 * Gestor + RE + Submitter. Centralising here means both callers benefit.
 *
 * @param {Object} initiative - Must have UUID; MentorEmail and Title used for notification.
 * @param {string} fromStatus - The status the record is leaving (SUBMISSION event source).
 */
export async function finalizeSubmission(initiative, fromStatus) {
  await createEvent(initiative.UUID, EVENT_TYPES.SUBMISSION, fromStatus, STATUS.SUBMETIDO);
  const currentUser = ContextStore.get('currentUser');
  const ownerName = initiative.SubmittedBy?.displayName || (currentUser && currentUser.get('displayName')) || '';
  const dataHora = __dayjs().format('DD/MM/YYYY HH:mm');
  await createEmail(EMAIL_EVENTS.SUBMITTED_OWNER, { initiative, ownerName, dataHora }).send();
  let manager = null;
  try {
    manager = await getManagerAbove(currentUser && currentUser.get('employeeId'));
  } catch (err) {
    console.error('[finalizeSubmission] manager lookup failed', err);
  }
  if (manager) {
    await createEmail(EMAIL_EVENTS.SUBMITTED_MANAGER, { initiative, ownerName, dataHora, manager }).send();
  }
}

/**
 * Submit: RASCUNHO -> SUBMETIDO
 */
export async function submitInitiative(initiative, button, onSuccess) {
  if (!canTransitionTo(initiative.Status, STATUS.SUBMETIDO)) {
    Toast.error('Transição de estado inválida.');
    return;
  }

  const confirmed = await confirm(
    'Confirmar Submissão',
    'Tem a certeza que deseja submeter esta iniciativa?',
  );
  if (!confirmed) return;

  button.isLoading = true;
  const loading = Toast.loading('A submeter iniciativa...');
  try {
    await transitionStatus(initiative.Id, STATUS.SUBMETIDO, initiative['odata.etag'], { SubmittedDate: new Date().toISOString() });
    await finalizeSubmission(initiative, STATUS.RASCUNHO);
    loading.success('Iniciativa submetida com sucesso.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao submeter iniciativa.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Re-submit: EM_REVISAO -> PreviousStatus (or SUBMETIDO)
 */
/**
 * Core resubmit transition logic — no UI side effects (no confirm dialog,
 * no Toast loading, no button.isLoading). Throws on validation failures so
 * callers can present errors in their own context.
 *
 * @param {Object} initiative - Initiative row (with current odata.etag)
 * @returns {Promise<void>}
 */
export async function performResubmitTransition(initiative) {
  const rawPrev = initiative.PreviousStatus || STATUS.SUBMETIDO;
  const remapped = (rawPrev === STATUS.VALIDADO_GESTOR || rawPrev === STATUS.VALIDADO_FINAL);
  const target = remapped ? STATUS.POR_VALIDAR : rawPrev;

  if (!canTransitionTo(STATUS.EM_REVISAO, target)) {
    throw new SystemError('InvalidTransition', 'Transição de estado inválida.', { breaksFlow: false });
  }

  const extraFields = { PreviousStatus: '' };
  let assignedGestor = null;

  if (target === STATUS.POR_VALIDAR) {
    let financials = null;
    try { financials = await getFinancials(initiative.UUID); } catch (_) { /* non-critical */ }
    assertToBeComplete(financials);

    const savingType = financials?.SavingType || deriveSavingType(financials?.SavingCategory);
    const annualVal = computeAnnualizedToBeTotalEur(financials);
    assignedGestor = await getAssignedGestor(savingType, String(annualVal), initiative.ImpactedTeamOUID, 'Anual');
    if (assignedGestor) {
      extraFields.GestorValidator = { email: assignedGestor.email, displayName: assignedGestor.displayName };
      extraFields.GestorValidatorEmail = assignedGestor.email;
    }
  }

  const eventComment = remapped
    ? `Iniciativa anteriormente validada (${statusLabel(rawPrev)}) -- re-encaminhada para nova validação do gestor.`
    : '';

  await transitionStatus(initiative.Id, target, initiative['odata.etag'], extraFields);
  await createEvent(initiative.UUID, EVENT_TYPES.RESUBMISSION, STATUS.EM_REVISAO, target, eventComment);
  await createEmail(EMAIL_EVENTS.RESUBMITTED, { initiative, gestor: assignedGestor }).send();
}

/**
 * UI wrapper: confirms with the user, shows loading, calls the core transition.
 */
export async function resubmitInitiative(initiative, button, onSuccess) {
  const confirmed = await confirm(
    'Confirmar Re-submissão',
    'Tem a certeza que deseja re-submeter esta iniciativa?',
  );
  if (!confirmed) return;

  button.isLoading = true;
  const loading = Toast.loading('A re-submeter iniciativa...');
  try {
    await performResubmitTransition(initiative);
    loading.success('Iniciativa re-submetida com sucesso.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    if (error && (error.name === 'IncompleteFinancials' || error.name === 'InvalidTransition')) {
      loading.error(actionErrorMessage(error, error.message));
    } else {
      loading.error(actionErrorMessage(error, 'Erro ao re-submeter iniciativa.'));
    }
  } finally {
    button.isLoading = false;
  }
}

/**
 * Cancel: any non-terminal -> CANCELADO
 * Comment is optional for cancellation.
 */
export async function cancelInitiative(initiative, button, onSuccess) {
  if (!canTransitionTo(initiative.Status, STATUS.CANCELADO)) {
    Toast.error('Transição de estado inválida.');
    return;
  }

  const confirmed = await confirm(
    'Cancelar Iniciativa',
    'Tem a certeza que deseja cancelar esta iniciativa? Esta acção é irreversível.',
    { confirmLabel: 'Cancelar Iniciativa', variant: 'error' },
  );
  if (!confirmed) return;

  button.isLoading = true;
  const loading = Toast.loading('A cancelar iniciativa...');
  try {
    await transitionStatus(initiative.Id, STATUS.CANCELADO, initiative['odata.etag']);
    await createEvent(initiative.UUID, EVENT_TYPES.CANCELLATION, initiative.Status, STATUS.CANCELADO);
    await createEmail(EMAIL_EVENTS.CANCELLED, { initiative }).send();
    loading.success('Iniciativa cancelada.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao cancelar iniciativa.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Hard-delete an initiative and all its dependents (financials, events, comments,
 * notifications, sharing records). Used for RASCUNHO removal by the owner and for
 * archive cleanup in the catalogo by owner / mentor.
 *
 * Does NOT use canTransitionTo -- this is a destructive admin operation, not a
 * lifecycle transition. Caller is responsible for gating (PERMISSION_MAP +
 * isOwner / assigned-mentor checks at the UI level).
 */
export async function deleteInitiative(initiative, button, onSuccess) {
  const confirmed = await confirm(
    'Eliminar Iniciativa',
    'Tem a certeza que deseja eliminar esta iniciativa? Esta acção apaga permanentemente o registo e todos os dados associados (financeiros, eventos, comentários, notificações, partilhas) e é irreversível.',
    { confirmLabel: 'Eliminar', variant: 'error' },
  );
  if (!confirmed) return;

  button.isLoading = true;
  const loading = Toast.loading('A eliminar iniciativa...');
  try {
    const [comments, events, notifications, financials, shares] = await Promise.all([
      getComments(initiative.UUID).catch(() => []),
      getEvents(initiative.UUID).catch(() => []),
      getNotifications(initiative.UUID).catch(() => []),
      getFinancials(initiative.UUID).catch(() => null),
      getAllSharedRecords(initiative.UUID).catch(() => []),
    ]);

    const deleterUser = ContextStore.get('currentUser');
    const deleterEmail = deleterUser.get('email');
    const deleterName = deleterUser.get('displayName');

    // Best-effort cascade: collect per-child failures instead of bailing on the
    // first error. Parent delete is skipped if any child remains, so re-runs
    // converge (already-deleted children silently 404 on retry).
    const childErrors = [];
    for (const c of comments) {
      await deleteComment(c.Id, c['odata.etag'] || '*').catch(err => childErrors.push(err));
    }
    for (const ev of events) {
      await deleteEvent(ev.Id, ev['odata.etag'] || '*').catch(err => childErrors.push(err));
    }
    for (const n of notifications) {
      await deleteNotification(n.Id, n['odata.etag'] || '*').catch(err => childErrors.push(err));
    }
    if (financials && financials.Id) {
      await deleteFinancials(financials.Id, financials['odata.etag'] || '*').catch(err => childErrors.push(err));
    }
    for (const s of shares) {
      await deleteSharedRecord(s.Id, s['odata.etag'] || '*').catch(err => childErrors.push(err));
    }

    if (childErrors.length > 0) {
      console.error('Cascade delete partial failure', childErrors);
      throw new SystemError(
        'CascadePartialFailure',
        `Eliminação parcial: ${childErrors.length} registo(s) dependentes não puderam ser apagados. Tente novamente.`,
        { breaksFlow: false },
      );
    }

    await deleteInitiativeItem(initiative.Id, initiative['odata.etag'] || '*');

    // Post-delete notification sent to the actor (deleter) only, after the
    // cascade wipes existing Notification records for this initiative.
    await createEmail(EMAIL_EVENTS.DELETED, {
      initiative,
      actor: { email: deleterEmail, name: deleterName },
    }).send();

    loading.success('Iniciativa eliminada.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao eliminar iniciativa.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Approve project: SUBMETIDO -> VALIDADO_MENTOR
 */
export async function approveProject(initiative, button, onSuccess) {
  if (!canTransitionTo(initiative.Status, STATUS.VALIDADO_MENTOR)) {
    Toast.error('Transição de estado inválida.');
    return;
  }

  const confirmed = await confirm(
    'Aprovar Projecto',
    'Tem a certeza que deseja aprovar este projecto?',
  );
  if (!confirmed) return;

  button.isLoading = true;
  const loading = Toast.loading('A aprovar projecto...');
  try {
    const user = ContextStore.get('currentUser');
    const mentorIdentity = { email: user.get('email'), displayName: user.get('displayName') };
    await transitionStatus(initiative.Id, STATUS.VALIDADO_MENTOR, initiative['odata.etag'], {
      Mentor: mentorIdentity,
      MentorEmail: user.get('email'),
    });
    await createEvent(initiative.UUID, EVENT_TYPES.MENTOR_APPROVAL, STATUS.SUBMETIDO, STATUS.VALIDADO_MENTOR);
    await createEmail(EMAIL_EVENTS.MENTOR_APPROVED, { initiative }).send();
    loading.success('Projecto aprovado.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao aprovar projecto.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Reject: SUBMETIDO/POR_VALIDAR/VALIDADO_GESTOR -> REJEITADO
 * Requires mandatory comment.
 */
export async function rejectInitiative(initiative, button, onSuccess) {
  const currentStatus = initiative.Status;

  if (!canTransitionTo(currentStatus, STATUS.REJEITADO)) {
    Toast.error('Transição de estado inválida.');
    return;
  }

  const comment = await confirmWithComment(
    'Rejeitar Iniciativa',
    'Tem a certeza que deseja rejeitar esta iniciativa?',
    { confirmLabel: 'Rejeitar', placeholder: 'Motivo da rejeição (obrigatório)...' },
  );
  if (!comment) return;

  const eventType = currentStatus === STATUS.SUBMETIDO
    ? EVENT_TYPES.MENTOR_REJECTION
    : EVENT_TYPES.BUSINESS_REJECTION;

  button.isLoading = true;
  const loading = Toast.loading('A rejeitar iniciativa...');
  try {
    await transitionStatus(initiative.Id, STATUS.REJEITADO, initiative['odata.etag']);
    await createEvent(initiative.UUID, eventType, currentStatus, STATUS.REJEITADO, comment);
    await createEmail(EMAIL_EVENTS.REJECTED, { initiative, reason: comment }).send();
    loading.success('Iniciativa rejeitada.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao rejeitar iniciativa.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Request revision: SUBMETIDO/POR_VALIDAR/VALIDADO_GESTOR -> EM_REVISAO
 * Sets PreviousStatus so resubmission returns to the right place.
 * Requires mandatory comment.
 */
export async function requestRevision(initiative, button, onSuccess) {
  const currentStatus = initiative.Status;

  if (!canTransitionTo(currentStatus, STATUS.EM_REVISAO)) {
    Toast.error('Transição de estado inválida.');
    return;
  }

  const comment = await confirmWithComment(
    'Solicitar Revisão',
    'Tem a certeza que deseja solicitar revisão desta iniciativa?',
    { confirmLabel: 'Solicitar Revisão', placeholder: 'Motivo do pedido de revisão (obrigatório)...' },
  );
  if (!comment) return;

  // Resubmit routing rule: post-Gestor-approval revisions always cycle back through
  // POR_VALIDAR (Gestor must re-validate any change to the financial data after their
  // first approval). Pre-approval revisions return to their origin checkpoint.
  const previousStatus = (currentStatus === STATUS.VALIDADO_GESTOR || currentStatus === STATUS.VALIDADO_FINAL)
    ? STATUS.POR_VALIDAR
    : currentStatus;

  button.isLoading = true;
  const loading = Toast.loading('A solicitar revisão...');
  try {
    await transitionStatus(initiative.Id, STATUS.EM_REVISAO, initiative['odata.etag'], {
      PreviousStatus: previousStatus,
    });
    await createEvent(initiative.UUID, EVENT_TYPES.REVIEW_REQUEST, currentStatus, STATUS.EM_REVISAO, comment);
    await createEmail(EMAIL_EVENTS.REVISION_REQUESTED, { initiative, reason: comment }).send();
    loading.success('Pedido de revisão enviado.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao solicitar revisão.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Start execution: VALIDADO_MENTOR -> EM_EXECUCAO
 */
export async function startExecution(initiative, button, onSuccess) {
  if (!canTransitionTo(initiative.Status, STATUS.EM_EXECUCAO)) {
    Toast.error('Transição de estado inválida.');
    return;
  }

  const expectedEndDate = await confirmWithDate(
    'Iniciar Execução',
    'Indique a data prevista de conclusão da execução desta iniciativa.',
  );
  if (!expectedEndDate) return;

  button.isLoading = true;
  const loading = Toast.loading('A iniciar execução...');
  try {
    await transitionStatus(initiative.Id, STATUS.EM_EXECUCAO, initiative['odata.etag'], {
      ExpectedEndDate: expectedEndDate,
    });
    await createEvent(initiative.UUID, EVENT_TYPES.EXECUTION_START, STATUS.VALIDADO_MENTOR, STATUS.EM_EXECUCAO);
    await createEmail(EMAIL_EVENTS.EXECUTION_STARTED, { initiative }).send();
    loading.success('Execução iniciada.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao iniciar execução.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Declare savings / request validation: EM_EXECUCAO -> POR_VALIDAR
 * Auto-assigns GestorValidator via routing rules.
 */
export async function declareSavings(initiative, button, onSuccess) {
  if (!canTransitionTo(initiative.Status, STATUS.POR_VALIDAR)) {
    Toast.error('Transição de estado inválida.');
    return;
  }

  const confirmed = await confirm(
    'Solicitar Validação de Savings',
    'Tem a certeza que deseja solicitar a validação dos savings?',
  );
  if (!confirmed) return;

  button.isLoading = true;
  const loading = Toast.loading('A solicitar validação...');
  try {
    // Resolve gestor via routing rules
    let financials = null;
    try { financials = await getFinancials(initiative.UUID); } catch (_) { /* non-critical */ }

    // Mandatory toBe gate (asIs is always required earlier; toBe optional until now)
    assertToBeComplete(financials);

    const savingType = financials?.SavingType || deriveSavingType(financials?.SavingCategory);
    const annualVal = computeAnnualizedToBeTotalEur(financials);
    const gestor = await getAssignedGestor(savingType, String(annualVal), initiative.ImpactedTeamOUID, 'Anual');

    const extraFields = {};
    if (gestor) {
      extraFields.GestorValidator = { email: gestor.email, displayName: gestor.displayName };
      extraFields.GestorValidatorEmail = gestor.email;
    }

    await transitionStatus(initiative.Id, STATUS.POR_VALIDAR, initiative['odata.etag'], extraFields);
    await createEvent(initiative.UUID, EVENT_TYPES.SAVINGS_SUBMISSION, STATUS.EM_EXECUCAO, STATUS.POR_VALIDAR);
    await createEmail(EMAIL_EVENTS.SAVINGS_VALIDATION_REQUESTED, { initiative, gestorEmail: gestor?.email }).send();
    loading.success('Pedido de validação enviado.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    if (error && error.name === 'IncompleteFinancials') {
      loading.error(actionErrorMessage(error, error.message));
    } else {
      loading.error(actionErrorMessage(error, 'Erro ao solicitar validação.'));
    }
  } finally {
    button.isLoading = false;
  }
}

/**
 * Approve savings: POR_VALIDAR -> VALIDADO_GESTOR
 */
export async function approveSavings(initiative, button, onSuccess) {
  if (!canTransitionTo(initiative.Status, STATUS.VALIDADO_GESTOR)) {
    Toast.error('Transição de estado inválida.');
    return;
  }

  const confirmed = await confirm(
    'Aprovar Savings',
    'Tem a certeza que deseja aprovar os savings desta iniciativa?',
  );
  if (!confirmed) return;

  button.isLoading = true;
  const loading = Toast.loading('A aprovar savings...');
  try {
    await transitionStatus(initiative.Id, STATUS.VALIDADO_GESTOR, initiative['odata.etag']);
    await createEvent(initiative.UUID, EVENT_TYPES.BUSINESS_VALIDATION, STATUS.POR_VALIDAR, STATUS.VALIDADO_GESTOR);
    await createEmail(EMAIL_EVENTS.SAVINGS_APPROVED, { initiative }).send();
    loading.success('Savings aprovados.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao aprovar savings.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Mentor final validation: VALIDADO_GESTOR -> VALIDADO_FINAL.
 * Logs the MENTOR_FINAL_VALIDATION event so the timeline reflects the confirmation.
 * The final transition to IMPLEMENTADO is handled by mentorManagerValidation.
 */
export async function mentorFinalValidation(initiative, button, onSuccess) {
  if (!canTransitionTo(initiative.Status, STATUS.VALIDADO_FINAL)) {
    Toast.error('Transição de estado inválida.');
    return;
  }

  const confirmed = await confirm(
    'Confirmar Savings',
    'Confirma os savings desta iniciativa? A iniciativa ficará aguardar validação final pelo manager da equipa de mentores.',
    { confirmLabel: 'Confirmar Savings' },
  );
  if (!confirmed) return;

  button.isLoading = true;
  const loading = Toast.loading('A confirmar savings...');
  try {
    await transitionStatus(initiative.Id, STATUS.VALIDADO_FINAL, initiative['odata.etag']);
    await createEvent(initiative.UUID, EVENT_TYPES.MENTOR_FINAL_VALIDATION, STATUS.VALIDADO_GESTOR, STATUS.VALIDADO_FINAL);

    const actorEmail = ContextStore.get('currentUser').get('email');
    await createEmail(EMAIL_EVENTS.MENTOR_FINAL_VALIDATED, { initiative, excludeEmail: actorEmail }).send();

    loading.success('Savings confirmados. Iniciativa aguarda validação final.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao confirmar savings.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Mentor-manager final validation: VALIDADO_FINAL -> IMPLEMENTADO.
 * Opens date picker, resolves FinalValidationLabel, logs MENTOR_MANAGER_VALIDATION
 * and OWNER_IMPLEMENTATION events, and persists the label to the initiative.
 */
export async function mentorManagerValidation(initiative, button, onSuccess) {
  if (!canAccess('validar_implementacao_final')) {
    Toast.error('Sem permissão para esta acção.');
    return;
  }

  if (!canTransitionTo(initiative.Status, STATUS.IMPLEMENTADO)) {
    Toast.error('Transição de estado inválida.');
    return;
  }

  const pickedDate = await confirmWithDate(
    'Validar Implementação',
    'Confirma a implementação desta iniciativa e indique a data de implementação.',
    {
      defaultValue: __dayjs().format('YYYY-MM-DD'),
      label: 'Data de implementação',
      confirmLabel: 'Validar Implementação',
    },
  );
  if (!pickedDate) return;

  button.isLoading = true;
  const loading = Toast.loading('A confirmar implementação...');
  try {
    let financials = null;
    try { financials = await getFinancials(initiative.UUID); } catch (_) { /* non-critical */ }

    const validationLabel = resolveFinalValidationLabel(initiative, financials);

    await transitionStatus(initiative.Id, STATUS.IMPLEMENTADO, initiative['odata.etag'], {
      ImplementedDate: __dayjs(pickedDate).toISOString(),
      FinalValidationLabel: validationLabel,
    });

    await createEvent(
      initiative.UUID,
      EVENT_TYPES.MENTOR_MANAGER_VALIDATION,
      STATUS.VALIDADO_FINAL,
      STATUS.IMPLEMENTADO,
      '',
      { ValidationLabel: validationLabel },
    );
    await createEvent(initiative.UUID, EVENT_TYPES.OWNER_IMPLEMENTATION, STATUS.VALIDADO_FINAL, STATUS.IMPLEMENTADO);

    const actorEmail = ContextStore.get('currentUser').get('email');
    await createEmail(EMAIL_EVENTS.IMPLEMENTED, { initiative, excludeEmail: actorEmail }).send();

    loading.success('Iniciativa implementada.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao confirmar implementação.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Transfer: Gestor reassigns a POR_VALIDAR initiative to another gestor.
 * Status stays POR_VALIDAR; GestorValidator and GestorValidatorEmail are updated.
 */
export async function transferGestor(initiative, button, onSuccess) {
  const allEmployees = await getAllEmployees();
  const options = allEmployees
    .filter(emp => deriveRoles(emp).includes('gestor') && emp.Email !== initiative.GestorValidatorEmail)
    .map(emp => ({
      label: emp.ShortName,
      value: new UserIdentity(emp.Email, emp.ShortName),
    }));

  const result = await confirmWithEmployeeComboBox(
    'Transferir Iniciativa',
    'Selecione o novo gestor validador. A iniciativa será transferida e o novo gestor ficará responsável pela validação.',
    options,
  );

  if (!result) return;

  button.isLoading = true;
  const loading = Toast.loading('A transferir iniciativa...');
  try {
    const extracted = extractComboBoxValue(result.person);
    const newIdentity = new UserIdentity(extracted.email, extracted.displayName);
    const transferComment = 'Transferido para ' + newIdentity.displayName + (result.comment ? '. ' + result.comment : '');

    await update(initiative.Id, {
      GestorValidator: newIdentity,
      GestorValidatorEmail: newIdentity.email,
    }, initiative['odata.etag']);

    await createEvent(initiative.UUID, EVENT_TYPES.TRANSFER, STATUS.POR_VALIDAR, STATUS.POR_VALIDAR, transferComment);

    // Notify new gestor
    await createEmail(EMAIL_EVENTS.GESTOR_TRANSFERRED, { initiative, recipients: newIdentity.email }).send();

    // Notify initiative owner
    await createEmail(EMAIL_EVENTS.GESTOR_CHANGED, { initiative }).send();

    loading.success('Iniciativa transferida com sucesso.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao transferir iniciativa.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Transfer ownership: colaborador transfers initiative to another person.
 * Updates SubmittedBy and SubmittedByEmail.
 */
export async function transferOwnership(initiative, button, onSuccess) {
  const allEmployees = await getAllEmployees();
  const currentEmail = ContextStore.get('currentUser').get('email');
  const options = allEmployees
    .filter(emp => deriveRoles(emp).includes('colaborador') && emp.Email !== currentEmail)
    .map(emp => ({
      label: emp.ShortName,
      value: new UserIdentity(emp.Email, emp.ShortName),
    }));

  const result = await confirmWithEmployeeComboBox(
    'Transferir Iniciativa',
    'Selecione o novo proprietário. A iniciativa será transferida e deixará de aparecer nas suas iniciativas.',
    options,
  );

  if (!result) return;

  button.isLoading = true;
  const loading = Toast.loading('A transferir iniciativa...');
  try {
    const extracted = extractComboBoxValue(result.person);
    const newIdentity = new UserIdentity(extracted.email, extracted.displayName);
    const transferComment = 'Transferido para ' + newIdentity.displayName + (result.comment ? '. ' + result.comment : '');

    await update(initiative.Id, {
      SubmittedBy: newIdentity,
      SubmittedByEmail: newIdentity.email,
    }, initiative['odata.etag']);

    await createEvent(initiative.UUID, EVENT_TYPES.TRANSFER, initiative.Status, initiative.Status, transferComment);

    // Notify new owner
    await createEmail(EMAIL_EVENTS.OWNERSHIP_TRANSFERRED, { initiative, recipients: newIdentity.email }).send();

    // Notify mentor if exists
    await createEmail(EMAIL_EVENTS.OWNER_CHANGED, { initiative }).send();

    loading.success('Iniciativa transferida com sucesso.');
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao transferir iniciativa.'));
  } finally {
    button.isLoading = false;
  }
}

/**
 * Shows a Dialog with a PeoplePicker to select a new person for a role.
 * Returns { identity: UserIdentity } on confirm, or null on cancel/empty selection.
 * @param {string} title
 * @param {string} message
 * @param {string} [placeholderText]
 * @returns {Promise<{ identity: UserIdentity } | null>}
 */
function confirmWithPeoplePicker(title, message, placeholderText = 'Pesquisar pessoa...') {
  const personField = new FormField({ value: null });
  const picker = new PeoplePicker(personField, { placeholder: placeholderText });

  return new Promise((resolve) => {
    const dialog = new Dialog({
      title,
      variant: 'info',
      class: 'pace-dialog--overflow-visible pt-v2',
      content: new Container([
        new Text(message, { type: 'p' }),
        new FieldLabel('Pessoa', picker),
        picker,
      ]),
      backdrop: true,
      closeOnFocusLoss: false,
      containerSelector: 'body',
      footer: [
        new Button('Cancelar', {
          variant: 'secondary',
          onClickHandler: () => {
            dialog.close();
            dialog.remove();
            picker.remove();
            personField.dispose();
            resolve(null);
          },
        }),
        new Button('Confirmar', {
          variant: 'primary',
          onClickHandler: () => {
            const selected = personField.value;
            if (!selected) {
              Toast.error('Selecione uma pessoa.');
              return;
            }
            // PeoplePicker stores UserIdentity as .value on the option
            const identity = selected?.value instanceof UserIdentity
              ? selected.value
              : new UserIdentity(selected?.value?.email || '', selected?.value?.displayName || selected?.label || '');
            dialog.close();
            dialog.remove();
            picker.remove();
            personField.dispose();
            resolve({ identity });
          },
        }),
      ],
    });
    dialog.render();
    dialog.open();
  });
}

/**
 * Generic mentor-facing role reassignment (Mentor or Gestor fields).
 * Writes an update to the initiative and logs a TRANSFER timeline event.
 *
 * @param {Object} params
 * @param {'mentor'|'gestor'} params.role - Which role to reassign
 * @param {Object} params.initiative
 * @param {Button} params.button
 * @param {() => void} [params.onSuccess]
 */
export async function reassignRole({ role, initiative, button, onSuccess }) {
  if (!isMentorUser()) {
    console.warn('[reassignRole] unauthorized attempt by non-mentor');
    Toast.error('Sem permissão para esta acção.');
    return;
  }

  const isMentor = role === 'mentor';
  const dialogTitle = isMentor ? 'Alterar Mentor Responsável' : 'Alterar Gestor Validador';
  const dialogMessage = isMentor
    ? 'Selecione o novo mentor responsável por esta iniciativa.'
    : 'Selecione o novo gestor validador desta iniciativa.';

  const result = await confirmWithPeoplePicker(dialogTitle, dialogMessage);
  if (!result) return;

  const newIdentity = result.identity;
  if (!newIdentity.email) {
    Toast.error('Não foi possível determinar o email da pessoa selecionada.');
    return;
  }

  const fields = isMentor
    ? { Mentor: newIdentity, MentorEmail: newIdentity.email }
    : { GestorValidator: newIdentity, GestorValidatorEmail: newIdentity.email };

  const roleLabel = isMentor ? 'Mentor' : 'Gestor';
  const comment = `${roleLabel} alterado para ${newIdentity.displayName}.`;

  button.isLoading = true;
  const loading = Toast.loading(`A alterar ${roleLabel.toLowerCase()}...`);
  try {
    await update(initiative.Id, fields, initiative['odata.etag']);
    await createEvent(initiative.UUID, EVENT_TYPES.TRANSFER, initiative.Status, initiative.Status, comment);

    // Reuse the gestor-change email event when reassigning gestor (notifies owner).
    // For mentor, no dedicated email event exists -- skip to avoid inventing templates.
    if (!isMentor) {
      await createEmail(EMAIL_EVENTS.GESTOR_CHANGED, { initiative }).send();
      await createEmail(EMAIL_EVENTS.GESTOR_TRANSFERRED, { initiative, recipients: newIdentity.email }).send();
    }

    loading.success(`${roleLabel} alterado com sucesso.`);
    if (onSuccess) onSuccess();
  } catch (error) {
    console.error(`[reassignRole] failed for role=${role}`, error);
    loading.error(actionErrorMessage(error, `Erro ao alterar ${roleLabel.toLowerCase()}.`));
  } finally {
    button.isLoading = false;
  }
}

// Implicit-access roles (owner, mentor, gestor) are not listed here -- the
// manage-access dialog only shows users with a delegated entry in
// InitiativesSharedAccess (Status === 'active').

async function addAccessFlow(initiative) {
  const result = await confirmWithUserComboBox(
    'Adicionar Acesso',
    'Selecione a pessoa e o tipo de acesso a conceder.',
  );
  if (!result) return false;

  const loading = Toast.loading('A conceder acesso...');
  try {
    const user = ContextStore.get('currentUser');
    const sharedBy = new UserIdentity(user.get('email'), user.get('displayName'));
    await shareInitiative(initiative.UUID, result.person, sharedBy, result.type);
    await createEmail(EMAIL_EVENTS.ACCESS_GRANTED, {
      initiative,
      recipients: result.person.email,
      actorName: user.get('displayName'),
    }).send();
    loading.success('Acesso concedido.');
    return true;
  } catch (error) {
    console.error(error);
    loading.error(actionErrorMessage(error, 'Erro ao conceder acesso.'));
    return false;
  }
}

function buildAccessRow(record, onRemoved) {
  const identity = UserIdentity.fromField(record.SharedWith);
  const displayName = identity?.displayName || record.SharedWithEmail || '(sem nome)';
  const typeLabel = record.Type === 'collaborate' ? 'Colaboração' : 'Leitura';

  const removeBtn = new Button('Remover', {
    variant: 'danger',
    isOutlined: true,
    onClickHandler: async () => {
      removeBtn.isLoading = true;
      const loading = Toast.loading('A remover acesso...');
      try {
        await revokeAccess(record.Id, record['odata.etag'] || '*');
        const user = ContextStore.get('currentUser');
        await createEmail(EMAIL_EVENTS.ACCESS_REVOKED, {
          initiativeUUID: record.InitiativeUUID,
          recipients: record.SharedWithEmail,
          actorName: user.get('displayName'),
        }).send();
        loading.success('Acesso removido.');
        onRemoved(record);
      } catch (error) {
        console.error(error);
        loading.error(actionErrorMessage(error, 'Erro ao remover acesso.'));
        removeBtn.isLoading = false;
      }
    },
  });

  return new Container([
    new Container([
      new Text(displayName, { type: 'span', class: 'pace-access-name' }),
      new Text(typeLabel, { type: 'span', class: 'pace-chip pace-chip--inactive' }),
    ], { class: 'pace-access-row-info' }),
    removeBtn,
  ], { class: 'pace-access-row' });
}

/**
 * Gerir Acesso: lists delegated-access entries with remove + add controls.
 * Implicit access (owner, mentor, gestor) is not shown.
 * Only authorized users (owner, collaborate-access, or privileged role) may invoke this.
 */
export async function manageAccessAction(initiative, button, onSuccess) {
  const currentEmail = ContextStore.get('currentUser').get('email');

  // Defense-in-depth: verify authorization even when the button-level gate passed.
  // shareType must be determined before we know if this is 'collaborate' or 'read'.
  // We use canManageAccess with a lazy share-type check: fetch the share record first.
  button.isLoading = true;
  let shareType = null;
  try {
    shareType = await getShareAccessType(initiative.UUID, currentEmail).catch(err => {
      console.warn('[manageAccessAction] getShareAccessType failed', err);
      return null;
    });
  } catch (_) { /* non-critical -- fall through to role check */ }

  if (!canManageAccess(currentEmail, initiative, shareType)) {
    console.warn('[manageAccessAction] unauthorized access attempt', { currentEmail, uuid: initiative.UUID });
    Toast.error('Sem permissão para gerir o acesso desta iniciativa.');
    button.isLoading = false;
    return;
  }

  let activeShares = [];
  try {
    const all = await getAllSharedRecords(initiative.UUID);
    activeShares = all.filter(s => s.Status === 'active');
  } catch (error) {
    console.error(error);
    Toast.error('Erro ao carregar acessos.');
    button.isLoading = false;
    return;
  }
  button.isLoading = false;

  const listContainer = new Container([], { class: 'pace-access-list' });

  const rebuildList = () => {
    if (activeShares.length === 0) {
      listContainer.children = [
        new Text('Ninguém tem acesso delegado a esta iniciativa.', { type: 'p', class: 'pace-empty-hint' }),
      ];
      return;
    }
    listContainer.children = activeShares.map(record =>
      buildAccessRow(record, (removed) => {
        const idx = activeShares.indexOf(removed);
        if (idx >= 0) activeShares.splice(idx, 1);
        rebuildList();
      })
    );
  };
  rebuildList();

  const addBtn = new Button('Adicionar Pessoa', {
    variant: 'primary',
    isOutlined: true,
    onClickHandler: async () => {
      addBtn.isLoading = true;
      const added = await addAccessFlow(initiative);
      addBtn.isLoading = false;
      if (added) {
        try {
          const all = await getAllSharedRecords(initiative.UUID);
          activeShares = all.filter(s => s.Status === 'active');
          rebuildList();
        } catch (_) { /* keep existing list */ }
      }
    },
  });

  const dialog = new Dialog({
    title: 'Gerir Acesso',
    variant: 'info',
    class: 'pace-dialog--overflow-visible pt-v2',
    content: new Container([
      new Text('Pessoas com acesso delegado a esta iniciativa. O proprietário, mentor e gestor mantêm acesso permanente e não aparecem aqui.', { type: 'p' }),
      listContainer,
      addBtn,
    ]),
    backdrop: true,
    closeOnFocusLoss: false,
    containerSelector: 'body',
    footer: [
      new Button('Fechar', {
        variant: 'secondary',
        onClickHandler: () => {
          dialog.close();
          dialog.remove();
          if (onSuccess) onSuccess();
        },
      }),
    ],
  });
  dialog.render();
  dialog.open();
}
