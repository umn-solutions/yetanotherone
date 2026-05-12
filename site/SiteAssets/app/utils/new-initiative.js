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
  generateUUIDv4,
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
  deriveSavingType,
  hasFinancialData,
} from './constants.js';
import {
  createCategoryState,
  serializeCategory,
  hydrateCategoryStates,
  getPhaseEditability,
  buildCategoryAsIsForm,
  buildCategoryTabbedSection,
  buildSharedFinancialSchema,
  extractCategoryLabels,
} from './financial-forms.js';
import { canViewFteCost } from './fte-cost-field.js';
import { create, update, getByUUID as getInitiativeByUUID } from './initiatives-api.js';
import { STATUS, canTransitionTo, areBaseFieldsLocked } from './status-helpers.js';
import { create as createFinancials, getByInitiative as getFinancials, update as updateFinancials } from './financials-api.js';
import { createEvent } from './initiative-events-api.js';
import { finalizeSubmission, performResubmitTransition } from './workflow-actions.js';
import { buildWorkflowButtons } from './workflow-buttons.js';

/**
 * Opens a Modal form for creating a new initiative.
 * @param {() => void} onSuccess - Callback invoked after successful save/submit
 * @returns {Modal} The modal instance
 */
export async function openNewInitiativeModal(onSuccess) {
  const teamOptions = await getTeamOptions();
  return buildInitiativeModal(null, null, onSuccess, null, teamOptions);
}

/**
 * Opens a Modal form for editing an existing initiative.
 * Fetches financials for pre-fill before opening the modal.
 * @param {Object} initiative - The initiative data to pre-fill
 * @param {() => void} onSuccess - Callback invoked after successful save/submit
 * @param {Object} [opts={}] - Options forwarded to buildInitiativeModal (e.g. { asApprover: true })
 * @returns {Promise<Modal>} The modal instance
 */
export async function openEditInitiativeModal(initiative, onSuccess, opts = {}) {
  let financials = null;
  if (initiative.UUID) {
    try {
      financials = await getFinancials(initiative.UUID);
    } catch (_) { /* non-critical -- proceed without financials */ }
  }
  const teamOptions = await getTeamOptions();
  return buildInitiativeModal(initiative, financials, onSuccess, null, teamOptions, opts);
}

/**
 * Opens a Modal form for creating a new initiative pre-populated from an existing one.
 * Copies content fields only -- ownership/workflow metadata is not replicated.
 * @param {Object} sourceInitiative - The initiative to replicate from
 * @param {() => void} onSuccess - Callback invoked after successful save/submit
 * @returns {Promise<Modal>} The modal instance
 */
export async function openReplicateInitiativeModal(sourceInitiative, onSuccess) {
  let financials = null;
  if (sourceInitiative.UUID) {
    try {
      financials = await getFinancials(sourceInitiative.UUID);
    } catch (_) { /* non-critical -- proceed without financials */ }
  }
  const teamOptions = await getTeamOptions();
  return buildInitiativeModal(null, financials, onSuccess, sourceInitiative, teamOptions);
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

  // -- Validation helpers for Sim path --
  function getFinancialsErrors() {
    const errs = [];

    const cats = extractCategoryLabels(sharedFinancial.schema.get('savingCategory'));
    if (cats.length === 0) {
      errs.push('Selecione pelo menos uma categoria de savings.');
      return errs;
    }

    const quantRequired = hasFinancialData(cats);

    if (quantRequired && categoryStates.size === 0) {
      errs.push('Adicione pelo menos uma métrica (Eficiência, Produção ou Gastos Gerais).');
    }

    if (categoryStates.size > 0) {
      const periodVal = sharedFinancial.schema.get('timePeriod').value;
      const period = periodVal && typeof periodVal === 'object' ? periodVal.value : periodVal;
      if (!period) errs.push('Selecione o período de medição.');

      for (const [key, state] of categoryStates) {
        const incomplete = Object.values(state.asIs).some(field => {
          const v = field.value;
          return v === '' || v === null || v === undefined || !(parseFloat(v) > 0);
        });
        if (incomplete) {
          errs.push('Métrica "' + CATEGORY_LABELS[key] + '": preencha todos os campos com valores maiores que zero.');
        }
      }
    }
    return errs;
  }

  function isFinancialsValid() {
    return getFinancialsErrors().length === 0;
  }

  // -- Collect financial fields for save --
  function collectFinancialFields() {
    const sharedParsed = sharedFinancial.schema.parseForList();
    const timePeriodVal = sharedFinancial.schema.get('timePeriod').value;
    const timePeriod = timePeriodVal && typeof timePeriodVal === 'object' ? timePeriodVal.value : (timePeriodVal || '');
    const savingCatLabels = extractCategoryLabels(sharedFinancial.schema.get('savingCategory'));

    const fields = {
      TimePeriod: timePeriod,
      SavingCategory: savingCatLabels,
      SavingType: deriveSavingType(savingCatLabels),
      EnabledCategories: Array.from(categoryStates.keys()),
      EficienciaData:   serializeCategory(categoryStates.get('eficiencia')),
      ProducaoData:     serializeCategory(categoryStates.get('producao')),
      GastosGeraisData: serializeCategory(categoryStates.get('gastos')),
    };
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
    { class: 'pace-submission-overlay', containerSelector: 'body' }
  );
  const showOverlay = () => overlay.render();
  const hideOverlay = () => { if (overlay.isAlive) overlay.remove(); };

  // -- Save functions --
  const saveAsDraft = async (btn, hasFinancials = false) => {
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
          if (err && err.name === 'ConcurrencyConflict') {
            loading.error('Outra pessoa editou esta iniciativa. Feche e reabra para recarregar.');
            return;
          }
          throw err;
        }
        if (hasFinancials) {
          const finFields = collectFinancialFields();
          if (financials) {
            try {
              await updateFinancials(financials.Id, finFields, financials['odata.etag']);
            } catch (err) {
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
        const uuid = generateUUIDv4();
        await create({
          ...fields,
          UUID: uuid,
          SubmittedBy: identity,
          SubmittedByEmail: currentUser.get('email'),
        });
        await createEvent(uuid, EVENT_TYPES.CREATION, '', STATUS.RASCUNHO);
        if (hasFinancials) {
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

  const submitInitiative = async (btn, hasFinancials = false) => {
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

    if (hasFinancials) {
      const errs = getFinancialsErrors();
      if (errs.length > 0) {
        sharedFinancial.schema.focusOnFirstInvalid();
        errs.forEach(msg => Toast.error(msg));
        return;
      }
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
      let finalTitle;
      if (isEdit) {
        try {
          await update(initiative.Id, fields, initiative['odata.etag']);
        } catch (err) {
          if (err && err.name === 'ConcurrencyConflict') {
            loading.error('Outra pessoa editou esta iniciativa. Feche e reabra para recarregar.');
            return;
          }
          throw err;
        }
        if (hasFinancials) {
          const finFields = collectFinancialFields();
          if (financials) {
            try {
              await updateFinancials(financials.Id, finFields, financials['odata.etag']);
            } catch (err) {
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
        finalTitle = fields.Title;
      } else {
        const uuid = generateUUIDv4();
        await create({
          ...fields,
          UUID: uuid,
          SubmittedBy: identity,
          SubmittedByEmail: currentUser.get('email'),
        });
        await createEvent(uuid, EVENT_TYPES.CREATION, '', STATUS.RASCUNHO);
        if (hasFinancials) {
          await createFinancials(uuid, collectFinancialFields());
        }
        finalUUID = uuid;
        finalMentorEmail = '';
        finalTitle = fields.Title;
      }

      await finalizeSubmission(
        { UUID: finalUUID, MentorEmail: finalMentorEmail, Title: finalTitle },
        fromStatus,
      );

      loading.success('Iniciativa submetida com sucesso');
      modal.close();
      if (onSuccess) onSuccess();
    } catch (error) {
      loading.error('Erro ao submeter iniciativa');
    } finally {
      btn.isLoading = false;
      hideOverlay();
    }
  };

  // -- Re-submit from wizard (EM_REVISAO -> previous status, with toBe gate + gestor re-attribution) --
  const resubmitFromWizard = async (btn, hasFinancials = false) => {
    if (!schema.isValid) {
      schema.focusOnFirstInvalid();
      Toast.error('Preencha o título e seleccione a equipa.');
      return;
    }
    if (hasFinancials) {
      const errs = getFinancialsErrors();
      if (errs.length > 0) {
        sharedFinancial.schema.focusOnFirstInvalid();
        errs.forEach(msg => Toast.error(msg));
        return;
      }
    }

    btn.isLoading = true;
    showOverlay();
    const loading = Toast.loading('A re-submeter...');
    try {
      // Save current edits in-place (preserve EM_REVISAO status until transition)
      const baseFields = collectBaseFields();
      await update(initiative.Id, { ...baseFields, Status: initiative.Status }, initiative['odata.etag']);

      if (hasFinancials) {
        const finFields = collectFinancialFields();
        if (financials) {
          await updateFinancials(financials.Id, finFields, financials['odata.etag']);
        } else {
          await createFinancials(initiative.UUID, finFields);
        }
      }

      // Refresh initiative to pick up new etag for the transition
      const fresh = await getInitiativeByUUID(initiative.UUID);
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

  // ===== STEP 1 -- Basic Info =====

  const titleInput = new FieldLabel('Título', new TextInput(titleField, { placeholder: 'Ex: Redução do tempo de...', isDisabled: baseFieldsLocked }), { class: 'pace-required' });
  const descInput = new FieldLabel('Descrição do problema identificado', new TextArea(descriptionField, { placeholder: 'Descreva a situação actual', rows: 3, isDisabled: baseFieldsLocked }));
  const teamCombo = new FieldLabel('Equipa', new ComboBox(teamField, teamOptions, { placeholder: 'Seleccionar...', isDisabled: baseFieldsLocked }), { class: 'pace-required' });
  const confidentialCheckInline = new Container([
    new CheckBox(confidentialField, { title: 'Confidencial', isDisabled: baseFieldsLocked }),
    new Text('Confidencial', { type: 'span' }),
  ], { class: 'pace-checkbox-row' });
  const teamRow = new Container([teamCombo, confidentialCheckInline], { class: 'pace-team-conf-row' });
  const tagsCombo = new FieldLabel('Tags', createTagsToggle(tagsField, { isDisabled: baseFieldsLocked }));
  const objectiveInput = new FieldLabel('Descrição da iniciativa de melhoria', new TextArea(objectiveField, { placeholder: 'Qual o objectivo esperado?', rows: 3, isDisabled: baseFieldsLocked }));

  const isPostSubmission = isEdit && currentStatus !== STATUS.RASCUNHO;
  const isEmRevisao = isEdit && currentStatus === STATUS.EM_REVISAO && !asApprover;
  const draftLabel = isPostSubmission ? 'Guardar' : 'Gravar Rascunho';

  const step1DraftBtn = new Button(draftLabel, {
    variant: 'secondary',
    onClickHandler: () => saveAsDraft(step1DraftBtn),
  });

  const step1ContinueBtn = new Button('Continuar', {
    variant: 'primary',
    onClickHandler: () => {
      if (!schema.isValid) {
        schema.focusOnFirstInvalid();
        Toast.error('Preencha o título e seleccione a equipa.');
        return;
      }
      wizard.setView(asApprover ? 'step2b' : 'step2');
    },
  });

  const step1CancelBtn = new Button('Cancelar', {
    variant: 'secondary',
    isOutlined: true,
    onClickHandler: () => modal.close(),
  });


  // Workflow approval buttons (Aprovar / Validar / Submeter forward actions).
  // Only on last step -- never alongside Continuar.
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

  const step1View = new View([
    new Container([
      titleInput,
      descInput,
      teamRow,
      tagsCombo,
      objectiveInput,
    ], { class: 'pace-initiative-form' }),
    new Container(
      [step1CancelBtn, step1DraftBtn, step1ContinueBtn],
      { class: 'pace-modal-footer' },
    ),
  ]);

  // ===== STEP 2 -- Quantification Question =====

  const step2NaoDraftBtn = new Button(draftLabel, {
    variant: 'secondary',
    onClickHandler: () => saveAsDraft(step2NaoDraftBtn, false),
  });

  const step2BackBtn = new Button('Voltar', {
    variant: 'secondary',
    isOutlined: true,
    onClickHandler: () => {
      resetStep2Choice();
      wizard.setView('step1');
    },
  });

  const step2SimBtn = new Button('Sim', {
    variant: 'secondary',
    isOutlined: true,
    onClickHandler: () => wizard.setView('step2b'),
  });

  const step2NaoSubmitBtn = new Button('Submeter', {
    variant: 'primary',
    onClickHandler: () => submitInitiative(step2NaoSubmitBtn, false),
  });

  const step2QuestionFooter = [];
  const step2NaoFooter = isPostSubmission
    ? [step2BackBtn, step2NaoDraftBtn]
    : [step2BackBtn, step2NaoDraftBtn, ...(canAccess('submeter') ? [step2NaoSubmitBtn] : [])];

  const step2FooterContainer = new Container(step2QuestionFooter, { class: 'pace-modal-footer' });

  const step2NaoBtn = new Button('Não', {
    variant: 'secondary',
    isOutlined: true,
    onClickHandler: () => {
      step2SwapContainer.children = [step2HintNode];
      step2FooterContainer.children = step2NaoFooter;
    },
  });

  const step2ChoiceRow = new Container([step2NaoBtn, step2SimBtn], { class: 'pace-wizard-choice' });
  const step2HintNode = new Text(
    'Sem problema -- o seu mentor irá ajudá-lo a quantificar a iniciativa após submissão.',
    { type: 'p', class: 'pace-wizard-hint' },
  );
  const step2SwapContainer = new Container([step2ChoiceRow], { class: 'pace-wizard-swap' });

  function resetStep2Choice() {
    step2SwapContainer.children = [step2ChoiceRow];
    step2FooterContainer.children = step2QuestionFooter;
  }

  const step2View = new View([
    new Container([
      new Text('Consegue quantificar/tipificar a iniciativa?', { type: 'h4', class: 'pace-form-section-title' }),
      new Text('Esta informação ajuda a medir o impacto da sua iniciativa. Caso responda "Sim", o passo seguinte irá recolher dados financeiros (período de medição, categorias de savings) e métricas detalhadas (eficiência, produção e/ou gastos gerais) para quantificar os ganhos esperados.', { type: 'p' }),
      step2SwapContainer,
      step2FooterContainer,
    ], { class: 'pace-wizard-question' }),
  ]);

  // ===== STEP 2b -- Multi-category financial form (replaces old Step 2b + Step 3) =====
  // Layout: shared general fields (TimePeriod, SavingCategory) + tabbed section with add/remove + totals

  const step2bBackBtn = new Button('Voltar', {
    variant: 'secondary',
    isOutlined: true,
    onClickHandler: () => {
      if (asApprover) {
        wizard.setView('step1');
        return;
      }
      resetStep2Choice();
      wizard.setView('step2');
    },
  });

  const step2bDraftBtn = new Button(draftLabel, {
    variant: 'secondary',
    onClickHandler: () => saveAsDraft(step2bDraftBtn, true),
  });

  const step2bSubmitBtn = new Button('Submeter', {
    variant: 'primary',
    onClickHandler: () => submitInitiative(step2bSubmitBtn, true),
  });

  const step2bResubmitBtn = isEmRevisao ? new Button('Re-submeter', {
    variant: 'primary',
    onClickHandler: () => resubmitFromWizard(step2bResubmitBtn, true),
  }) : null;

  // Wire submit button disabled state to changeCounter + schema validity
  function refreshSubmitBtnState() {
    step2bSubmitBtn.disabled = !isFinancialsValid();
  }
  refreshSubmitBtnState();
  tabbedSection.changeCounter.subscribe(refreshSubmitBtnState);
  sharedFinancial.schema.get('timePeriod').subscribe(refreshSubmitBtnState);

  sharedFinancial.schema.get('savingCategory').subscribe(refreshSubmitBtnState);

  const step2bView = new View([
    new Container([
      new Text('Contabilização de Ganhos/Impacto', { type: 'h4', class: 'pace-form-section-title' }),
      new Text(
        'Preencha os campos abaixo com a situação actual da iniciativa (As-Is) -- estes valores formam a linha de base contra a qual o impacto será medido. Os valores estimados e efectivos serão recolhidos nas fases seguintes do ciclo PDCA.',
        { type: 'p', class: 'pace-step-intro' },
      ),
      new Container(sharedFinancial.components, { class: 'pace-shared-financial-fields' }),
      tabbedSection.container,
    ], { class: 'pace-initiative-form' }),
    new Container(
      isPostSubmission
        ? [step2bBackBtn, step2bDraftBtn, ...(step2bResubmitBtn ? [step2bResubmitBtn] : []), ...workflowButtonsStep2b]
        : [step2bBackBtn, step2bDraftBtn, ...(canAccess('submeter') ? [step2bSubmitBtn] : []), ...workflowButtonsStep2b],
      { class: 'pace-modal-footer' },
    ),
  ]);

  // If editing with an existing financials row that had categories, jump to step2b
  const selectedViewName = (isEdit && financials && categoryStates.size > 0) ? 'step2b' : 'step1';

  // ===== ViewSwitcher Wizard =====

  const wizard = new ViewSwitcher([
    ['step1', step1View],
    ['step2', step2View],
    ['step2b', step2bView],
  ], {
    selectedViewName,
    onRefreshHandler: (viewName) => {
      if (!modal?.instance) return;
      modal.instance.toggleClass('pace-form-modal--wide', viewName === 'step2b');
    },
  });

  // ===== Modal =====

  const modal = new Modal([
    new Text(
      isEdit
        ? (asApprover ? 'Editar Iniciativa (Validador)' : 'Editar Iniciativa PDCA')
        : 'Nova Iniciativa',
      { type: 'h2', class: 'pace-modal-title' },
    ),
    wizard,
  ], {
    closeOnFocusLoss: false,
    class: `pace-form-modal pace-initiative-modal${selectedViewName === 'step2b' ? ' pace-form-modal--wide' : ''}`,
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
      // Dispose step 1 fields
      titleField.dispose();
      descriptionField.dispose();
      teamField.dispose();
      tagsField.dispose();
      objectiveField.dispose();
      confidentialField.dispose();
    },
  });

  modal.render();
  modal.open();
  return modal;
}
