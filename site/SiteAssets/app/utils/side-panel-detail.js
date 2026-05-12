import {
  SidePanel,
  Container,
  AccordionItem,
  Text,
  Button,
  Toast,
  TextArea,
  FormField,
  ContextStore,
  UserIdentity,
  Loader,
  __dayjs,
} from '../libs/nofbiz/nofbiz.base.js';

import { STATUS, statusLabel, chipClass, getNextFlowStatus, STATUS_LABELS } from './status-helpers.js';
import { getTeamLabel, getTeamName } from './roles.js';
import { mentorName, gestorName } from './format-helpers.js';
import { getByInitiative as getFinancials } from './financials-api.js';
import { EVENT_TYPES, STATUS_DESCRIPTIONS, CATEGORY_LABELS, hasFinancialData } from './constants.js';
import {
  hydrateCategoryStates,
  getPhaseEditability,
  buildCategoryDisplay,
  buildTotalsPanel,
} from './financial-forms.js';
import { buildFteCostController } from './fte-cost-field.js';
import { buildWorkflowButtons } from './workflow-buttons.js';
import { getByUUID } from './initiatives-api.js';
import { getShareAccessType } from './shared-api.js';
import { getByInitiative as getComments, createComment } from './comments-api.js';
import { createEvent, getByInitiative as getEvents } from './initiative-events-api.js';
import { createNotification } from './notifications-api.js';

const TIME_PERIOD_DISPLAY = {
  Diario: 'Diário',
  Mensal: 'Mensal',
};
const SAVING_CAT_DISPLAY = {
  'Outros Beneficios Qualitativos': 'Outros Beneficios Qualitativos',
  'Reducao de custos': 'Redução de custos',
  'Aumento de receita': 'Aumento de receita',
  'Reducao de risco': 'Redução de risco',
  'Custos e riscos evitados': 'Custos e riscos evitados',
  'Melhoria de qualidade': 'Melhoria de qualidade',
};

/**
 * Builds and opens a SidePanel showing full detail for an initiative.
 * Fetches financials from the separate list for savings display.
 *
 * @param {Object} initiative - The initiative data object from the list
 * @param {string} context - The context from which the panel is opened ('pessoal', 'mentoria', 'gestor', 'catalogo')
 * @param {() => void} [onSuccess] - Callback invoked after a successful workflow action
 * @returns {Promise<SidePanel>} The panel instance (for cleanup in route teardown)
 */
export async function openInitiativeDetail(initiative, context, onSuccess, { canAct = true } = {}) {
  const overlayEl = document.createElement('div');
  overlayEl.className = 'pace-submission-overlay';
  overlayEl.id = 'pace-detail-loader';
  document.body.appendChild(overlayEl);
  const loader = new Loader([], { containerSelector: '#pace-detail-loader' });
  loader.render();

  try {

  // Re-fetch to get a fresh etag -- the cached object from the route may be stale
  // if the initiative was updated (submitted, edited) since the route last loaded.
  try {
    const results = await getByUUID(initiative.UUID);
    if (results && results[0]) initiative = results[0];
  } catch (_) { /* non-critical -- proceed with cached copy */ }

  const user = ContextStore.get('currentUser');
  const currentEmail = user.get('email');
  const isOwner = initiative.SubmittedByEmail === currentEmail;
  const shareType = await getShareAccessType(initiative.UUID, currentEmail).catch(() => null);
  const isSharedUser = shareType !== null;
  const isCollaborator = shareType === 'collaborate';
  const hasWriteAccess = isOwner || isCollaborator;
  const status = initiative.Status;

  // Fetch financials for savings display (non-critical)
  let financials = null;
  try {
    financials = await getFinancials(initiative.UUID);
  } catch (_) { /* non-critical */ }

  // -- Header chips --
  const headerChips = [
    new Text(statusLabel(status), { type: 'span', class: `pace-chip ${chipClass(status)}` }),
    new Text(getTeamName(initiative.ImpactedTeamOUID) || '', { type: 'span', class: 'pace-chip pace-chip--inactive' }),
  ];

  if (initiative.IsConfidential === true || initiative.IsConfidential === 'true') {
    headerChips.push(new Text('Confidencial', { type: 'span', class: 'pace-chip pace-chip--conf' }));
  }

  const header = new Container([
    new Container(headerChips, { class: 'pace-detail-chips' }),
    new Text(initiative.Title || 'Sem título', { type: 'h2', class: 'pace-detail-title' }),
  ], { class: 'pace-detail-header' });

  // -- Dados Gerais grid --
  const mentorDisplay = mentorName(initiative);
  const gestorDisplay = gestorName(initiative);

  const ownerIdentity = UserIdentity.fromField(initiative.SubmittedBy);
  const ownerDisplayName = ownerIdentity ? ownerIdentity.displayName : '-';

  const dadosPairs = [
    ['Colaborador', ownerDisplayName],
    ['Equipa', getTeamLabel(initiative.ImpactedTeamOUID) || '-'],
    ['Mentor Responsável', mentorDisplay !== '---' ? mentorDisplay : 'Por atribuir'],
  ];
  if (gestorDisplay !== '---') {
    dadosPairs.push(['Gestor Validador', gestorDisplay]);
  }

  const dadosGerais = new Container([
    new Text('Dados Gerais', { type: 'h3', class: 'pace-sec-title' }),
    buildInfoGrid(dadosPairs),
  ]);

  // -- Description, Objective --
  const sections = [];
  if (initiative.Description) {
    sections.push(buildTextSection('Descrição do problema identificado', initiative.Description));
  }
  if (initiative.Objective) {
    sections.push(buildTextSection('Descrição da iniciativa de melhoria', initiative.Objective));
  }

  // -- Financial details section (from financials list) --
  // Track disposal for panel close
  const financialDisposers = [];

  if (financials) {
    const mapCat = (c) => SAVING_CAT_DISPLAY[c] || c;
    const catDisplay = Array.isArray(financials.SavingCategory)
      ? financials.SavingCategory.map(mapCat).join(', ')
      : (financials.SavingCategory ? mapCat(financials.SavingCategory) : '');

    const financialRows = [
      new Text('Dados Financeiros', { type: 'h3', class: 'pace-sec-title' }),
    ];

    // Always-rendered rows
    if (catDisplay) {
      financialRows.push(new Container([
        new Text('Categorias de Savings', { type: 'span', class: 'pace-detail-label' }),
        new Text(catDisplay, { type: 'span', class: 'pace-detail-value' }),
      ], { class: 'pace-detail-row pace-detail-row--inline' }));
    }
    if (financials.SavingType) {
      financialRows.push(new Container([
        new Text('Tipo Saving', { type: 'span', class: 'pace-detail-label' }),
        new Text(financials.SavingType, { type: 'span', class: 'pace-detail-value' }),
      ], { class: 'pace-detail-row pace-detail-row--inline' }));
    }

    if (hasFinancialData(financials.SavingCategory)) {
      // All phases locked for display purposes; editability arg only sizes FormFields internally
      const editability = getPhaseEditability(initiative.Status);
      const categoryStates = hydrateCategoryStates(financials, editability);

      if (financials.TimePeriod) {
        const periodLabel = TIME_PERIOD_DISPLAY[financials.TimePeriod] || financials.TimePeriod;
        financialRows.push(new Container([
          new Text('Periodo de medicao', { type: 'span', class: 'pace-detail-label' }),
          new Text(periodLabel, { type: 'span', class: 'pace-detail-value' }),
        ], { class: 'pace-detail-row pace-detail-row--inline' }));
      }

      // FTE cost is role-gated: colaborador sees nothing, mentor/gestor see the value.
      const fteCost = buildFteCostController({
        rawValue: financials.FTEAnnualCost,
        canEdit: false,
      });
      financialDisposers.push(() => fteCost.dispose());

      // Per-category display
      for (const state of categoryStates.values()) {
        const built = buildCategoryDisplay(state, {
          timePeriod: financials.TimePeriod,
          fteAnnualCost: fteCost.totalsOpt,
        });
        financialDisposers.push(() => {
          built.dispose();
          state.dispose();
        });
        const [, ...detailComponents] = built.components; // drop the h4 title (accordion header replaces it)
        financialRows.push(new AccordionItem(
          `Detalhes de ${CATEGORY_LABELS[state.key]}`,
          new Container(detailComponents, { class: 'pace-financial-category-body' }),
          { isInitialOpen: false }
        ));
      }

      // Totals panel
      const totalsResult = buildTotalsPanel(categoryStates, {
        phase: 'realized',
        timePeriod: financials.TimePeriod,
        fteAnnualCost: fteCost.totalsOpt,
      });
      financialDisposers.push(() => totalsResult.dispose());
      financialRows.push(totalsResult.component);
    }

    sections.push(new Container(financialRows, { class: 'pace-financial-section' }));
  }

  // -- Event type labels (used by progress timeline) --
  const EVENT_TYPE_LABELS = {
    Creation: 'Criado',
    Submission: 'Submetido',
    MentorApproval: 'Aprovado pelo Mentor',
    MentorRejection: 'Rejeitado pelo Mentor',
    ExecutionStart: 'Início de Execução',
    SavingsSubmission: 'Savings Submetidos',
    BusinessValidation: 'Validado pelo Gestor',
    BusinessRejection: 'Rejeitado pelo Gestor',
    ReviewRequest: 'Revisão Solicitada',
    Resubmission: 'Re-submetido',
    Cancellation: 'Cancelado',
    Implementation: 'Implementado',
    MentorFinalValidation: 'Confirmação Final Mentor',
    OwnerImplementation: 'Implementado pelo Colaborador',
    Comment: 'Comentário',
    Transfer: 'Transferido',
    Share: 'Partilhado',
    EditApprover: 'Editado por Validador',
  };

  const EVENT_TO_STATUS = {
    [EVENT_TYPES.CREATION]:                STATUS.RASCUNHO,
    [EVENT_TYPES.SUBMISSION]:              STATUS.SUBMETIDO,
    [EVENT_TYPES.RESUBMISSION]:            STATUS.SUBMETIDO,
    [EVENT_TYPES.MENTOR_APPROVAL]:         STATUS.VALIDADO_MENTOR,
    [EVENT_TYPES.MENTOR_REJECTION]:        STATUS.REJEITADO,
    [EVENT_TYPES.EXECUTION_START]:         STATUS.EM_EXECUCAO,
    [EVENT_TYPES.SAVINGS_SUBMISSION]:      STATUS.POR_VALIDAR,
    [EVENT_TYPES.BUSINESS_VALIDATION]:     STATUS.VALIDADO_GESTOR,
    [EVENT_TYPES.BUSINESS_REJECTION]:      STATUS.REJEITADO,
    [EVENT_TYPES.REVIEW_REQUEST]:          STATUS.EM_REVISAO,
    [EVENT_TYPES.CANCELLATION]:            STATUS.CANCELADO,
    [EVENT_TYPES.MENTOR_FINAL_VALIDATION]: STATUS.VALIDADO_FINAL,
    [EVENT_TYPES.OWNER_IMPLEMENTATION]:    STATUS.IMPLEMENTADO,
    // Comment, Transfer, Share have no status change -> no description shown
  };

  // -- Progress timeline and comments (skipped for catalogo -- archived items) --
  let progressSection = null;
  let commentsSection = null;

  if (context !== 'catalogo') {
    // -- Merged progress timeline (from events, excludes comments) --
    let events = [];
    try {
      events = await getEvents(initiative.UUID);
    } catch (_) { /* non-critical */ }

    events.sort((a, b) => (a.Date || '').localeCompare(b.Date || ''));

    const workflowEvents = events.filter(ev => ev.EventType !== EVENT_TYPES.COMMENT && ev.EventType !== EVENT_TYPES.SHARE);
    const nextStatus = getNextFlowStatus(status);

    const flowStepNodes = workflowEvents.map((ev, i) => {
      let actorObj = ev.Actor || {};
      if (typeof actorObj === 'string') {
        try { actorObj = JSON.parse(actorObj); } catch (_) { actorObj = {}; }
      }
      const actorName = actorObj.displayName || 'Sistema';
      const dateStr = ev.Date ? __dayjs(ev.Date).format('DD/MM/YYYY HH:mm') : '';
      const label = EVENT_TYPE_LABELS[ev.EventType] || ev.EventType;

      const stepContent = [
        new Container([
          new Text(label, { type: 'span', class: 'pace-flow-label' }),
          new Text(dateStr, { type: 'span', class: 'pace-flow-date' }),
        ], { class: 'pace-flow-step-header' }),
      ];

      const eventStatus = EVENT_TO_STATUS[ev.EventType];
      const eventDescription = eventStatus ? STATUS_DESCRIPTIONS[eventStatus] : null;
      if (eventDescription) {
        const commaIdx = eventDescription.indexOf(',');
        const headEnd = commaIdx >= 0 ? commaIdx : eventDescription.length;
        const head = eventDescription.slice(0, headEnd);
        const tail = eventDescription.slice(headEnd);
        stepContent.push(new Container([
          new Text(head, { type: 'span', class: 'pace-flow-description__head' }),
          ...(tail ? [new Text(tail, { type: 'span' })] : []),
        ], { as: 'span', class: 'pace-flow-description' }));
      }

      if (actorName !== 'Sistema') {
        stepContent.push(new Text(actorName, { type: 'span', class: 'pace-flow-actor' }));
      }

      if (ev.Comment) {
        stepContent.push(new Text(ev.Comment, { type: 'p', class: 'pace-flow-comment' }));
      }

      const step = new Container([
        new Container([
          new Text(String(i + 1), { type: 'span' }),
        ], { class: 'pace-flow-dot pace-flow-dot--done' }),
        new Container(stepContent, { class: 'pace-flow-step-content' }),
      ], { class: 'pace-flow-step' });

      if (i < workflowEvents.length - 1 || nextStatus) {
        const connectorClass = (i < workflowEvents.length - 1)
          ? 'pace-flow-connector pace-flow-connector--done'
          : 'pace-flow-connector';
        return new Container([
          step,
          new Container([], { class: connectorClass }),
        ], { as: 'span', class: 'pace-flow-step-wrap' });
      }
      return step;
    });

    if (nextStatus) {
      flowStepNodes.push(
        new Container([
          new Container([], { class: 'pace-flow-dot pace-flow-dot--next' }),
          new Container([
            new Text(STATUS_LABELS[nextStatus], { type: 'span', class: 'pace-flow-label' }),
          ], { class: 'pace-flow-step-content' }),
        ], { class: 'pace-flow-step' })
      );
    }

    progressSection = workflowEvents.length > 0 || nextStatus
      ? new Container([
          new Text('Progresso', { type: 'h3', class: 'pace-sec-title' }),
          new Container(flowStepNodes, { class: 'pace-flow' }),
        ])
      : null;

    // -- Comments section --
    let comments = [];
    try {
      comments = await getComments(initiative.UUID);
    } catch (_) { /* non-critical */ }

    comments.sort((a, b) => (b.CommentDate || '').localeCompare(a.CommentDate || ''));

    const isMentor = currentEmail === initiative.MentorEmail;
    const isGestor = currentEmail === initiative.GestorValidatorEmail;
    const canComment = isOwner || isMentor || isGestor || isSharedUser;

    const commentListContainer = new Container(
      buildCommentList(comments)
    );

    const commentsSectionChildren = [
      new Text('Comentários', { type: 'h3', class: 'pace-sec-title' }),
      commentListContainer,
    ];

    if (canComment) {
      const commentField = new FormField({ value: '' });
      const commentTextArea = new TextArea(commentField, { placeholder: 'Escrever comentário...', rows: 2 });

      const sendBtn = new Button('Comentar', {
        variant: 'primary',
        onClickHandler: async () => {
          const body = commentField.value?.trim();
          if (!body) {
            Toast.error('Escreva um comentário antes de enviar.');
            return;
          }
          sendBtn.isLoading = true;
          const loading = Toast.loading('A enviar comentário...');
          try {
            await createComment(initiative.UUID, body);
            if (initiative.MentorEmail && initiative.MentorEmail !== currentEmail) {
              await createNotification(initiative.UUID, initiative.MentorEmail, user.get('displayName') + ' comentou ' + initiative.Title, 'comment');
            }
            if (initiative.SubmittedByEmail && initiative.SubmittedByEmail !== currentEmail) {
              await createNotification(initiative.UUID, initiative.SubmittedByEmail, user.get('displayName') + ' comentou ' + initiative.Title, 'comment');
            }
            loading.success('Comentário enviado.');
            commentField.value = '';
            // Re-fetch and rebuild comments display
            let updatedComments = [];
            try { updatedComments = await getComments(initiative.UUID); } catch (_) {}
            updatedComments.sort((a, b) => (b.CommentDate || '').localeCompare(a.CommentDate || ''));
            commentListContainer.children = buildCommentList(updatedComments);
          } catch (_) {
            loading.error('Erro ao enviar comentário.');
          } finally {
            sendBtn.isLoading = false;
          }
        },
      });

      commentsSectionChildren.push(
        new Container([commentTextArea, sendBtn], { class: 'pace-comment-form' })
      );
    }

    commentsSection = new Container(commentsSectionChildren, { class: 'pace-comments-section' });
  }

  // -- Content --
  const content = new Container([
    header,
    dadosGerais,
    ...sections,
    ...(progressSection ? [progressSection] : []),
    ...(commentsSection ? [commentsSection] : []),
  ], { class: 'pace-detail-content' });

  // -- Create panel with placeholder footer, then wire action buttons --
  const footerContainer = new Container([], { class: 'pace-detail-footer' });

  const panel = new SidePanel({
    title: initiative.Title || 'Detalhe da Iniciativa',
    content,
    footer: footerContainer,
    width: '600px',
    closeOnFocusLoss: true,
  });

  // Dispose financial subscriptions when panel closes
  panel.onCloseHandler = () => {
    for (const disposer of financialDisposers) disposer();
  };

  const footerButtons = buildWorkflowButtons({
    initiative,
    context,
    isOwner,
    hasWriteAccess,
    status,
    closable: panel,
    onSuccess,
    canAct,
    currentEmail,
  });
  if (footerButtons.length > 0) {
    footerContainer.children = footerButtons;
  }

  panel.render();
  panel.open();
  return panel;

  } finally {
    loader.remove();
    overlayEl.remove();
  }
}


// -- Helper: build comment list (DRY -- used for initial render and refresh) --
function buildCommentList(comments) {
  function getInitials(name) {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  return comments.map(c => {
    let authorObj = c.CommentAuthor || {};
    if (typeof authorObj === 'string') {
      try { authorObj = JSON.parse(authorObj); } catch (_) { authorObj = {}; }
    }
    const authorName = authorObj.displayName || 'Desconhecido';
    const dateStr = c.CommentDate ? __dayjs(c.CommentDate).format('DD/MM/YYYY') : '';

    return new Container([
      new Container([
        new Text(getInitials(authorName), { type: 'span' }),
      ], { class: 'pace-comment-avatar' }),
      new Container([
        new Container([
          new Text(authorName, { type: 'span', class: 'pace-comment-author' }),
          new Text(dateStr, { type: 'span', class: 'pace-comment-date' }),
        ], { class: 'pace-comment-header' }),
        new Text(c.Body, { type: 'p', class: 'pace-comment-body' }),
      ], { class: 'pace-comment-content' }),
    ], { class: 'pace-comment-item' });
  });
}

// -- Helper: info grid (key-value pairs) --
function buildInfoGrid(pairs) {
  const rows = pairs.map(([label, value]) =>
    new Container([
      new Text(label, { type: 'span', class: 'pace-detail-label' }),
      new Text(String(value), { type: 'span', class: 'pace-detail-value' }),
    ], { class: 'pace-detail-row' })
  );
  return new Container(rows, { class: 'pace-detail-grid' });
}

// -- Helper: text section --
function buildTextSection(title, text) {
  return new Container([
    new Text(title, { type: 'h3', class: 'pace-sec-title' }),
    new Text(text, { type: 'p', class: 'pace-detail-text' }),
  ]);
}

