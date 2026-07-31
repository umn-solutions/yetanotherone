import {
  Modal,
  Container,
  Text,
  TextInput,
  TextArea,
  ComboBox,
  CheckBox,
  Button,
  FormField,
  FormSchema,
  FieldLabel,
  Toast,
  Loader,
  View,
  ViewSwitcher,
  ContextStore,
  fromFieldValue,
  getIcon,
  __zod,
} from '../libs/nofbiz/nofbiz.base.js';

import { getTeamOptions } from './org-hierarchy-api.js';
import { canAccess } from './roles.js';
import { createTagsToggle } from './tags-toggle.js';
import {
  INITIATIVE_TAGS,
  EVENT_TYPES,
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  CATEGORY_FIELD_NAMES,
  inferCategoriesFromMetrics,
  inferSavingTypeFromMetrics,
} from './constants.js';
import {
  createCategoryState,
  serializeCategory,
  hydrateCategoryStates,
  getPhaseEditability,
  buildCategoryTabbedSection,
  buildSharedFinancialSchema,
  buildInferredClassification,
} from './financial-forms.js';
import { canViewFteCost } from './fte-cost-field.js';
import { create, update, getByUUID as getInitiativeByUUID, generateInitiativeUID } from './initiatives-api.js';
import { STATUS, canTransitionTo, areBaseFieldsLocked } from './status-helpers.js';
import { create as createFinancials, getByInitiative as getFinancials, update as updateFinancials } from './financials-api.js';
import { createEvent } from './initiative-events-api.js';
import { finalizeSubmission, performResubmitTransition } from './workflow-actions.js';
import { buildWorkflowButtons } from './workflow-buttons.js';
import { getMentorForTeam } from './mentor-teams-api.js';
import { acquireOverlayOpen } from './overlay-guard.js';

/**
 * Opens a Modal form for creating a new initiative.
 * @param {() => void} onSuccess - Callback invoked after successful save/submit
 * @returns {Modal | undefined} The modal instance, or undefined if a duplicate open was blocked
 */
export async function openNewInitiativeModal(onSuccess) {
  const release = acquireOverlayOpen();
  if (!release) { console.warn('[openNewInitiativeModal] duplicate open ignored'); return; }
  try {
    const teamOptions = await getTeamOptions();
    const modal = buildInitiativeModal(null, null, onSuccess, null, teamOptions);
    return modal;
  } finally {
    release();
  }
}

/**
 * Opens a Modal form for editing an existing initiative.
 * Fetches financials for pre-fill before opening the modal.
 * @param {Object} initiative - The initiative data to pre-fill
 * @param {() => void} onSuccess - Callback invoked after successful save/submit
 * @param {Object} [opts={}] - Options forwarded to buildInitiativeModal (e.g. { asApprover: true })
 * @returns {Promise<Modal | undefined>} The modal instance, or undefined if a duplicate open was blocked
 */
export async function openEditInitiativeModal(initiative, onSuccess, opts = {}) {
  const release = acquireOverlayOpen();
  if (!release) { console.warn('[openEditInitiativeModal] duplicate open ignored'); return; }
  const loading = Toast.loading('A abrir...');
  try {
    let financials = null;
    if (initiative.UUID) {
      try {
        financials = await getFinancials(initiative.UUID);
      } catch (error) {
        console.error('[openEditInitiativeModal] getFinancials failed', error);
        // non-critical -- proceed without financials
      }
    }
    const teamOptions = await getTeamOptions();
    loading.dismiss();
    return buildInitiativeModal(initiative, financials, onSuccess, null, teamOptions, opts);
  } catch (err) {
    console.error('[openEditInitiativeModal] failed to open', err);
    loading.error('Erro ao abrir formulário.');
  } finally {
    release();
  }
}

/**
 * Opens a Modal form for creating a new initiative pre-populated from an existing one.
 * Copies content fields only -- ownership/workflow metadata is not replicated.
 * @param {Object} sourceInitiative - The initiative to replicate from
 * @param {() => void} onSuccess - Callback invoked after successful save/submit
 * @returns {Promise<Modal | undefined>} The modal instance, or undefined if a duplicate open was blocked
 */
export async function openReplicateInitiativeModal(sourceInitiative, onSuccess) {
  const release = acquireOverlayOpen();
  if (!release) { console.warn('[openReplicateInitiativeModal] duplicate open ignored'); return; }
  const loading = Toast.loading('A abrir...');
  try {
    let financials = null;
    if (sourceInitiative.UUID) {
      try {
        financials = await getFinancials(sourceInitiative.UUID);
      } catch (error) {
        console.error('[openReplicateInitiativeModal] getFinancials failed', error);
        // non-critical -- proceed without financials
      }
    }
    const teamOptions = await getTeamOptions();
    loading.dismiss();
    return buildInitiativeModal(null, financials, onSuccess, sourceInitiative, teamOptions);
  } catch (err) {
    console.error('[openReplicateInitiativeModal] failed to open', err);
    loading.error('Erro ao abrir formulário.');
  } finally {
    release();
  }
}

function buildInitiativeModal(initiative, financials, onSuccess, prefillData = null, teamOptions = [], opts = {}) {
  const { asApprover = false, context = null, currentEmail = null, hasWriteAccess: hasWriteAccessOpt = null } = opts;
  const isEdit = !!initiative;
  const source = initiative || prefillData;
  const z = __zod;

  // -- Step 1 form fields --
  const titleField = new FormField({
    value: source?.Title || '',
    validatorCallback: (v) => z.string().min(1).safeParse(v).success,
  });

  const descriptionField = new FormField({ value: source?.Description || '' });

  const defaultTeamOUID = isEdit ? '' : (ContextStore.get('userOUID') || '');
  const initialTeamOUID = source?.ImpactedTeamOUID || defaultTeamOUID;
  const initialTeamOption = initialTeamOUID
    ? (teamOptions.find(opt => opt.value === initialTeamOUID) || initialTeamOUID)
    : '';
  const teamField = new FormField({
    value: initialTeamOption,
    validatorCallback: (v) => {
      const val = v && typeof v === 'object' ? v.value : v;
      return z.string().min(1).safeParse(val).success;
    },
  });

  const existingTags = source?.Tags ? fromFieldValue(source.Tags) : [];
  const tagsField = new FormField({ value: existingTags });

  const objectiveField = new FormField({ value: source?.Objective || '' });
  const confidentialField = new FormField({ value: source?.IsConfidential === true || source?.IsConfidential === 'true' });

  const schema = new FormSchema({ title: titleField, team: teamField });

  // -- Multi-category state --
  // Determine editability based on initiative status (RASCUNHO for new)
  const currentStatus = initiative?.Status || STATUS.RASCUNHO;
  const editability = getPhaseEditability(currentStatus);

  // Base fields lock past SUBMETIDO. Exception: EM_REVISAO with PreviousStatus=SUBMETIDO
  // unlocks them again (mentor sent back before approving — full edit allowed).
  const baseFieldsLocked = isEdit && areBaseFieldsLocked(currentStatus, initiative?.PreviousStatus);

  // Hydrate from existing financials, or start empty
  const categoryStates = financials
    ? hydrateCategoryStates(financials, editability)
    : new Map();

  // Shared financial schema (TimePeriod + SavingCategory + optional FTE cost)
  // FTE cost visibility is role-based -- mentor/gestor see it, colaborador never.
  const showFte = canViewFteCost();
  const sharedFinancial = buildSharedFinancialSchema(financials, { isMentorOrGestor: showFte, readOnly: false });

  // The tabbed category section (add/remove tabs + totals panel)
  // Pass the live timePeriod and FTE FormFields so the totals panel reacts to user input
  const tabbedSection = buildCategoryTabbedSection(categoryStates, {
    editability,
    timePeriod: sharedFinancial.schema.get('timePeriod'),
    fteAnnualCost: sharedFinancial.schema.get('fteAnnualCost') || 0,
    isMentorOrGestor: showFte,
  });

  // -- Touched check: user engaged with financials if they added at least one metric --
  const userTouchedFinancials = () => categoryStates.size > 0;

  // -- Collect financial fields for save --
  function collectFinancialFields() {
    const timePeriodVal = sharedFinancial.schema.get('timePeriod').value;
    const timePeriod = timePeriodVal && typeof timePeriodVal === 'object' ? timePeriodVal.value : (timePeriodVal || '');
    const keys = Array.from(categoryStates.keys());

    const fields = {
      TimePeriod: timePeriod,
      SavingCategory: inferCategoriesFromMetrics(keys),
      SavingType: inferSavingTypeFromMetrics(keys),
      EnabledCategories: keys,
    };
    // Loop covers ALL CATEGORY_KEYS including qualidade; serializeCategory handles text states
    for (const key of CATEGORY_KEYS) {
      fields[CATEGORY_FIELD_NAMES[key]] = serializeCategory(categoryStates.get(key));
    }
    const fteField = sharedFinancial.schema.get('fteAnnualCost');
    if (fteField) fields.FTEAnnualCost = String(parseFloat(fteField.value) || 0);
    return fields;
  }

  // -- Shared helpers --
  const collectBaseFields = () => {
    const teamVal = teamField.value;
    const impactedTeamOUID = teamVal && typeof teamVal === 'object' ? teamVal.value : (teamVal || '');
    const tagVal = tagsField.value;
    const tags = Array.isArray(tagVal)
      ? tagVal.map(t => typeof t === 'object' ? t.label : t)
      : [];
    const fields = {
      Title: titleField.value,
      Description: descriptionField.value,
      ImpactedTeamOUID: impactedTeamOUID,
      Tags: tags,
      Objective: objectiveField.value,
      IsConfidential: confidentialField.value,
    };
    if (!isEdit) {
      fields.Mentor = '';
      fields.MentorEmail = '';
      fields.GestorValidator = '';
      fields.GestorValidatorEmail = '';
    }
    return fields;
  };

  const overlay = new Container(
    [new Loader(new Text('A processar...', { type: 'p' }), { animation: 'pulse' })],
    { class: 'pace-submission-overlay pt-v2', containerSelector: 'body' }
  );
  const showOverlay = () => overlay.render();
  const hideOverlay = () => { if (overlay.isAlive) overlay.remove(); };

  // Force SPARC's debounced TextInput/TextArea sync to flush before we read
  // FormField values: trigger blur so each control's own blur handler runs
  // _syncValue() synchronously. Without this, a pending 300ms debounce can
  // leave the last edit unsynced and we MERGE-write stale data.
  const flushPendingInputs = () => {
    modal?.instance?.find('input, textarea').trigger('blur');
  };

  // -- Save functions --
  const saveAsDraft = async (btn) => {
    flushPendingInputs();
    if (!schema.isValid) {
      schema.focusOnFirstInvalid();
      Toast.error('Preencha o título e seleccione a equipa.');
      return;
    }

    btn.isLoading = true;
    showOverlay();
    const loading = Toast.loading('A guardar...');
    try {
      const baseFields = collectBaseFields();
      // When editing, preserve the current status (do NOT demote a SUBMETIDO back to RASCUNHO)
      const fields = isEdit
        ? { ...baseFields, Status: initiative.Status }
        : { ...baseFields, Status: STATUS.RASCUNHO };

      if (isEdit) {
        try {
          await update(initiative.Id, fields, initiative['odata.etag']);
        } catch (err) {
          console.error('[saveAsDraft] update failed', err);
          if (err && err.name === 'ConcurrencyConflict') {
            loading.error('Outra pessoa editou esta iniciativa. Feche e reabra para recarregar.');
            return;
          }
          throw err;
        }
        if (userTouchedFinancials()) {
          const finFields = collectFinancialFields();
          if (financials) {
            try {
              await updateFinancials(financials.Id, finFields, financials['odata.etag']);
            } catch (err) {
              console.error('[saveAsDraft] updateFinancials failed', err);
              if (err && err.name === 'ConcurrencyConflict') {
                loading.error('Outra pessoa editou estes dados. A recarregar...');
                const fresh = await getFinancials(initiative.UUID);
                if (fresh) financials = fresh;
                return;
              }
              throw err;
            }
          } else {
            await createFinancials(initiative.UUID, finFields);
          }
        }
      } else {
        const currentUser = ContextStore.get('currentUser');
        const identity = { email: currentUser.get('email'), displayName: currentUser.get('displayName') };
        const uuid = await generateInitiativeUID();
        await create({
          ...fields,
          UUID: uuid,
          SubmittedBy: identity,
          SubmittedByEmail: currentUser.get('email'),
        });
        await createEvent(uuid, EVENT_TYPES.CREATION, '', STATUS.RASCUNHO);
        if (userTouchedFinancials()) {
          await createFinancials(uuid, collectFinancialFields());
        }
      }
      if (isEdit && asApprover) {
        await createEvent(initiative.UUID, EVENT_TYPES.EDIT_APPROVER, initiative.Status, initiative.Status);
      }
      loading.success(isEdit ? 'Alterações guardadas' : 'Rascunho guardado com sucesso');
      modal.close();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('[saveAsDraft] failed', error);
      loading.error(isEdit ? 'Erro ao guardar alterações' : 'Erro ao guardar rascunho');
    } finally {
      btn.isLoading = false;
      hideOverlay();
    }
  };

  const submitInitiative = async (btn) => {
    flushPendingInputs();
    if (!schema.isValid) {
      schema.focusOnFirstInvalid();
      Toast.error('Preencha o título e seleccione a equipa.');
      return;
    }

    // Defence-in-depth: UI hides Submeter for non-RASCUNHO via isPostSubmission, but
    // guard the state-machine invariant here too. New initiatives default to RASCUNHO,
    // edits of RASCUNHO records are allowed; anything else is blocked.
    const fromStatus = isEdit ? initiative.Status : STATUS.RASCUNHO;
    if (!canTransitionTo(fromStatus, STATUS.SUBMETIDO)) {
      Toast.error('Transição de estado inválida.');
      return;
    }

    btn.isLoading = true;
    showOverlay();
    const loading = Toast.loading('A submeter iniciativa...');
    try {
      const currentUser = ContextStore.get('currentUser');
      const identity = { email: currentUser.get('email'), displayName: currentUser.get('displayName') };
      const baseFields = collectBaseFields();
      const fields = {
        ...baseFields,
        Status: STATUS.SUBMETIDO,
        SubmittedBy: identity,
        SubmittedByEmail: currentUser.get('email'),
        SubmittedDate: new Date().toISOString(),
      };

      let finalUUID;
      let finalMentorEmail;
      let finalMentor;
      let finalTitle;
      if (isEdit) {
        try {
          await update(initiative.Id, fields, initiative['odata.etag']);
        } catch (err) {
          console.error('[submitInitiative] update failed', err);
          if (err && err.name === 'ConcurrencyConflict') {
            loading.error('Outra pessoa editou esta iniciativa. Feche e reabra para recarregar.');
            return;
          }
          throw err;
        }
        if (userTouchedFinancials()) {
          const finFields = collectFinancialFields();
          if (financials) {
            try {
              await updateFinancials(financials.Id, finFields, financials['odata.etag']);
            } catch (err) {
              console.error('[submitInitiative] updateFinancials failed', err);
              if (err && err.name === 'ConcurrencyConflict') {
                loading.error('Outra pessoa editou estes dados. A recarregar...');
                const fresh = await getFinancials(initiative.UUID);
                if (fresh) financials = fresh;
                return;
              }
              throw err;
            }
          } else {
            await createFinancials(initiative.UUID, finFields);
          }
        }
        finalUUID = initiative.UUID;
        finalMentorEmail = initiative.MentorEmail;
        finalMentor = initiative.Mentor || null;
        finalTitle = fields.Title;
      } else {
        const uuid = await generateInitiativeUID();

        // Auto-assign mentor based on ImpactedTeamOUID (pre-routing).
        // A failure here must NOT block submission -- fall through with empty mentor fields.
        const impactedTeamOUID = fields.ImpactedTeamOUID || '';
        if (impactedTeamOUID) {
          try {
            const autoMentor = await getMentorForTeam(impactedTeamOUID);
            if (autoMentor) {
              fields.Mentor = { email: autoMentor.email, displayName: autoMentor.displayName };
              fields.MentorEmail = autoMentor.email;
            }
          } catch (err) {
            console.warn('[submitInitiative] getMentorForTeam failed, submitting without auto-assign', { impactedTeamOUID, err });
          }
        }

        await create({
          ...fields,
          UUID: uuid,
          SubmittedBy: identity,
          SubmittedByEmail: currentUser.get('email'),
        });
        await createEvent(uuid, EVENT_TYPES.CREATION, '', STATUS.RASCUNHO);
        if (userTouchedFinancials()) {
          await createFinancials(uuid, collectFinancialFields());
        }
        finalUUID = uuid;
        finalMentorEmail = fields.MentorEmail || '';
        finalMentor = fields.Mentor || null;
        finalTitle = fields.Title;
      }

      await finalizeSubmission(
        {
          UUID: finalUUID,
          Title: finalTitle,
          MentorEmail: finalMentorEmail,
          Mentor: finalMentor,
          SubmittedBy: identity,
          SubmittedByEmail: identity.email,
        },
        fromStatus,
      );

      loading.success('Iniciativa submetida com sucesso');
      modal.close();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('[submitInitiative] failed', error);
      loading.error('Erro ao submeter iniciativa');
    } finally {
      btn.isLoading = false;
      hideOverlay();
    }
  };

  // -- Re-submit from wizard (EM_REVISAO -> previous status, with toBe gate + gestor re-attribution) --
  const resubmitFromWizard = async (btn) => {
    flushPendingInputs();
    if (!schema.isValid) {
      schema.focusOnFirstInvalid();
      Toast.error('Preencha o título e seleccione a equipa.');
      return;
    }
    btn.isLoading = true;
    showOverlay();
    const loading = Toast.loading('A re-submeter...');
    try {
      // Save current edits in-place (preserve EM_REVISAO status until transition)
      const baseFields = collectBaseFields();
      await update(initiative.Id, { ...baseFields, Status: initiative.Status }, initiative['odata.etag']);

      if (userTouchedFinancials()) {
        const finFields = collectFinancialFields();
        if (financials) {
          await updateFinancials(financials.Id, finFields, financials['odata.etag']);
        } else {
          await createFinancials(initiative.UUID, finFields);
        }
      }

      // Refresh initiative to pick up new etag for the transition
      const results = await getInitiativeByUUID(initiative.UUID);
      const fresh = results?.[0];
      if (!fresh) {
        loading.error('Erro ao recarregar iniciativa após guardar.');
        return;
      }

      await performResubmitTransition(fresh);

      loading.success('Iniciativa re-submetida com sucesso.');
      modal.close();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('[resubmitFromWizard] failed', error);
      if (error?.name === 'IncompleteFinancials' || error?.name === 'InvalidTransition') {
        loading.error(error.message);
      } else if (error?.name === 'ConcurrencyConflict') {
        loading.error('Outra pessoa editou esta iniciativa. Feche e reabra.');
      } else {
        loading.error('Erro ao re-submeter iniciativa.');
      }
    } finally {
      btn.isLoading = false;
      hideOverlay();
    }
  };

  // ===== STEP DEFINITIONS =====

  const steps = [
    { id: 'contexto', label: 'Contexto', n: '01' },
    { id: 'problema', label: 'Problema',  n: '02' },
    { id: 'tema',    label: 'Tema',       n: '03' },
    { id: 'plano',   label: 'Plano',      n: '04' },
    { id: 'impacto', label: 'Impacto',    n: '05' },
  ];

  // ===== FIELD COMPONENTS =====

  const titleInput = new FieldLabel('Título', new TextInput(titleField, { placeholder: 'Ex: Redução do tempo de...', isDisabled: baseFieldsLocked }), { class: 'pace-required' });
  const descInput = new FieldLabel('Descrição do problema identificado', new TextArea(descriptionField, { placeholder: 'Descreva a situação actual', rows: 3, isDisabled: baseFieldsLocked }));
  const teamCombo = new FieldLabel('Equipa', new ComboBox(teamField, teamOptions, { placeholder: 'Seleccionar...', isDisabled: baseFieldsLocked }), { class: 'pace-required' });
  const confidentialHelp = 'Uma iniciativa confidencial restringe a visibilidade à equipa de mentoria, ao gestor atribuído e a quem tenha acesso delegado.';
  const confidentialCb = new CheckBox(confidentialField, { title: confidentialHelp, isDisabled: baseFieldsLocked });
  const confidentialCheckInline = new Container([
    confidentialCb,
    new Container([getIcon('lock-line')], { as: 'span', class: 'pace-conf-icon' }),
    new Text('Confidencial', { type: 'span', title: confidentialHelp }),
  ], {
    class: 'pace-checkbox-row pace-conf-toggle',
    // Clicking anywhere on the box toggles confidential. Forward to the checkbox
    // input's native click (updates the field AND re-renders the control). Clicks
    // landing on the checkbox itself are ignored to avoid double-toggle.
    onClickHandler: (e) => {
      if (baseFieldsLocked) return;
      if (e.target.closest(`[id="${confidentialCb.id}"]`)) return;
      const input = document.getElementById(`${confidentialCb.id}-input`);
      if (input) input.click();
    },
  });
  // Reflect the checked state on the box via a class. (`:has(input:checked)` is
  // unreliable here: SPARC re-renders the checkbox subtree on change and Blink
  // does not always re-invalidate the ancestor's `:has` style.)
  const syncConfToggleClass = () => {
    confidentialCheckInline.instance?.toggleClass('pace-conf-toggle--on', !!confidentialField.value);
    confidentialCheckInline.instance?.attr('title', confidentialHelp);
  };
  confidentialField.subscribe(syncConfToggleClass);
  const teamRow = new Container([teamCombo, confidentialCheckInline], { class: 'pace-team-conf-row' });
  const tagsCombo = new FieldLabel('Tags', createTagsToggle(tagsField, { isDisabled: baseFieldsLocked }));
  const objectiveInput = new FieldLabel('Descrição da iniciativa de melhoria', new TextArea(objectiveField, { placeholder: 'Qual o objectivo esperado?', rows: 3, isDisabled: baseFieldsLocked }));

  const isPostSubmission = isEdit && currentStatus !== STATUS.RASCUNHO;
  const isEmRevisao = isEdit && currentStatus === STATUS.EM_REVISAO && !asApprover;
  const draftLabel = isPostSubmission ? 'Guardar' : 'Gravar Rascunho';

  // ===== WORKFLOW BUTTONS =====

  const resolvedEmail = currentEmail || ContextStore.get('currentUser')?.get('email') || '';
  const resolvedIsOwner = initiative ? initiative.SubmittedByEmail === resolvedEmail : false;
  const workflowButtonsStep2b = (isEdit && context) ? buildWorkflowButtons({
    initiative,
    context,
    isOwner: resolvedIsOwner,
    hasWriteAccess: hasWriteAccessOpt ?? resolvedIsOwner,
    status: currentStatus,
    closable: { close: () => { if (modal) modal.close(); } },
    onSuccess,
    canAct: true,
    currentEmail: resolvedEmail,
    excludeEdit: true,
    excludeShare: true,
    approvalsOnly: true,
  }) : [];

  // ===== ACTION BUTTONS (built once, reused across steps) =====

  const draftBtn = new Button(draftLabel, {
    variant: 'secondary',
    onClickHandler: () => saveAsDraft(draftBtn),
  });

  const backBtn = new Button('Voltar', {
    variant: 'secondary',
    isOutlined: true,
    onClickHandler: () => wizard.previous(),
  });

  const continueBtn = new Button('Continuar', {
    variant: 'primary',
    onClickHandler: () => {
      if (!schema.isValid) {
        schema.focusOnFirstInvalid();
        Toast.error('Preencha o título e seleccione a equipa.');
        return;
      }
      wizard.next();
    },
  });

  const submitBtn = new Button('Submeter', {
    variant: 'primary',
    onClickHandler: () => submitInitiative(submitBtn),
  });

  const resubmitBtn = isEmRevisao ? new Button('Re-submeter', {
    variant: 'primary',
    onClickHandler: () => resubmitFromWizard(resubmitBtn),
  }) : null;

  // ===== FIVE STEP VIEWS =====

  const contextoView = new View([
    new Container([
      titleInput,
      teamRow,
    ], { class: 'pace-initiative-form' }),
  ]);

  const problemaView = new View([
    new Container([
      descInput,
    ], { class: 'pace-initiative-form' }),
  ]);

  const temaView = new View([
    new Container([
      tagsCombo,
    ], { class: 'pace-initiative-form' }),
  ]);

  const planoView = new View([
    new Container([
      objectiveInput,
    ], { class: 'pace-initiative-form' }),
  ]);

  // Build inferred classification section (reads from categoryStates via changeCounter)
  const inferredClassification = buildInferredClassification(categoryStates, tabbedSection.changeCounter);

  const impactoView = new View([
    new Container([
      new Text('Contabilização de Ganhos/Impacto', { type: 'h4', class: 'pace-form-section-title' }),
      new Text(
        'Preencha os campos abaixo com a situação actual da iniciativa (As-Is) -- estes valores formam a linha de base contra a qual o impacto será medido. Os valores estimados e efectivos serão recolhidos nas fases seguintes do ciclo PDCA.',
        { type: 'p', class: 'pace-step-intro' },
      ),
      new Container(sharedFinancial.components, { class: 'pace-shared-financial-fields' }),
      tabbedSection.container,
      inferredClassification.component,
    ], { class: 'pace-initiative-form' }),
  ]);

  // ===== STEPPER CONTAINER =====
  // Build one Button per step; active/done classes are toggled via applyStepperClasses

  const stepperBtns = steps.map((step) => {
    return new Button(step.n + ' · ' + step.label, {
      class: 'pace-step-seg',
      variant: 'secondary',
      isOutlined: true,
      onClickHandler: () => wizard.setView(step.id),
    });
  });

  const stepperContainer = new Container(stepperBtns, { class: 'pace-stepper' });

  // Apply active/done classes to the stepper for a given step index. Shared by the
  // ViewSwitcher onRefreshHandler and the initial bootstrap (ViewSwitcher.render()
  // does not fire onRefreshHandler for the initially-selected view).
  function applyStepperClasses(stepIdx) {
    stepperBtns.forEach((btn, i) => {
      const el = btn.instance;
      if (!el) return;
      el.removeClass('pace-step-seg--active pace-step-seg--done');
      if (i === stepIdx) {
        el.addClass('pace-step-seg--active');
      } else if (i < stepIdx) {
        el.addClass('pace-step-seg--done');
      }
    });
  }

  // ===== FOOTER CONTAINER =====
  // Children are rebuilt each step via the .children setter

  const footerContainer = new Container([], { class: 'pace-modal-footer' });

  // Helper: compute footer children for a given step index
  function buildFooterChildren(stepIdx) {
    const isFirst = stepIdx === 0;
    const isLast = stepIdx === steps.length - 1;

    const counter = new Text('passo ' + (stepIdx + 1) + ' de ' + steps.length, { type: 'span', class: 'pace-step-counter' });

    if (!isLast) {
      // Steps 01-04: counter, Gravar Rascunho, [Voltar], Continuar
      const left = [counter];
      const right = isFirst
        ? [draftBtn, continueBtn]
        : [draftBtn, backBtn, continueBtn];
      return [
        new Container(left, { class: 'pace-modal-footer__left' }),
        new Container(right, { class: 'pace-modal-footer__right' }),
      ];
    }

    // Step 05 (impacto): counter, Voltar, Gravar Rascunho, then submit/resubmit/workflow buttons
    const impactoActions = isPostSubmission
      ? [backBtn, draftBtn, ...(resubmitBtn ? [resubmitBtn] : []), ...workflowButtonsStep2b]
      : [backBtn, draftBtn, ...(canAccess('submeter') ? [submitBtn] : []), ...workflowButtonsStep2b];

    return [
      new Container([counter], { class: 'pace-modal-footer__left' }),
      new Container(impactoActions, { class: 'pace-modal-footer__right' }),
    ];
  }

  // ===== HEADER BAND =====

  const eyebrowText = isEdit ? 'Edição de iniciativa' : 'Nova submissão';
  const titleText = isEdit
    ? (asApprover ? 'Editar Iniciativa (Validador)' : 'Editar Iniciativa PDCA')
    : 'Partilhar uma iniciativa';

  const closeBtn = new Button(
    new Container([getIcon('close-line')], { as: 'span', class: 'pace-modal-close-icon' }),
    {
      variant: 'secondary',
      isOutlined: true,
      class: 'pace-modal-close',
      onClickHandler: () => modal.close(),
    },
  );

  const headerBand = new Container([
    closeBtn,
    new Text(eyebrowText, { type: 'p', class: 'pace-modal-eyebrow' }),
    new Text(titleText, { type: 'h2', class: 'pace-modal-title' }),
    new Text(
      'Em cinco passos — do contexto à contabilização do impacto — descreva a melhoria que quer ver no terreno.',
      { type: 'p', class: 'pace-modal-subtitle' },
    ),
  ], { class: 'pace-modal-header-band' });

  // ===== VIEWSWITCHER WIZARD =====

  // If editing with an existing financials row that had categories, open directly on 'impacto'
  const selectedViewName = (isEdit && financials && categoryStates.size > 0) ? 'impacto' : 'contexto';

  const wizard = new ViewSwitcher([
    ['contexto', contextoView],
    ['problema', problemaView],
    ['tema',     temaView],
    ['plano',    planoView],
    ['impacto',  impactoView],
  ], {
    selectedViewName,
    onRefreshHandler: (viewName) => {
      if (!modal?.instance) return;

      // Wide layout only on the financial step
      modal.instance.toggleClass('pace-form-modal--wide', viewName === 'impacto');

      // Locate current step index
      const stepIdx = steps.findIndex(s => s.id === viewName);

      // Update stepper button classes + footer children for this step
      applyStepperClasses(stepIdx);
      footerContainer.children = buildFooterChildren(stepIdx);
    },
  });

  // ===== MODAL =====

  const modal = new Modal([
    headerBand,
    stepperContainer,
    wizard,
    footerContainer,
  ], {
    closeOnFocusLoss: false,
    class: `pace-form-modal pace-initiative-modal pt-v2${selectedViewName === 'impacto' ? ' pace-form-modal--wide' : ''}`,
    containerSelector: 'body',
    onCloseHandler: () => {
      hideOverlay();
      // Dispose category states
      for (const state of categoryStates.values()) {
        state.dispose();
      }
      // Dispose shared financial schema
      sharedFinancial.dispose();
      // Dispose tabbed section (subscriptions, totals, builder results)
      tabbedSection.dispose();
      // Dispose inferred classification subscriptions
      inferredClassification.dispose();
      // Dispose step 1 fields
      titleField.dispose();
      descriptionField.dispose();
      teamField.dispose();
      tagsField.dispose();
      objectiveField.dispose();
      confidentialField.dispose();
    },
  });

  // Trigger initial footer state after wizard is wired up
  const initialStepIdx = steps.findIndex(s => s.id === selectedViewName);
  footerContainer.children = buildFooterChildren(initialStepIdx);

  modal.render();
  modal.open();

  // Bootstrap stepper active/done classes for the initial step. ViewSwitcher.render()
  // does not fire onRefreshHandler, and the handler early-returns before render
  // (modal.instance is null), so the initial highlight must be applied after open.
  applyStepperClasses(initialStepIdx);

  // Reflect any pre-checked confidential state (edit/replicate) on the box.
  syncConfToggleClass();

  return modal;
}
