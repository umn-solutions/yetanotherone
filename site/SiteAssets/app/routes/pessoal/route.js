import {
  Text,
  Container,
  Button,
  ComboBox,
  FormField,
  TextInput,
  View,
  Toast,
  ContextStore,
  defineRoute,
  extractComboBoxValue,
  __dayjs,
} from '../../libs/nofbiz/nofbiz.base.js';

import { getPersonalAndShared } from '../../utils/initiatives-api.js';
import { getSharedWithMe } from '../../utils/shared-api.js';
import { STATUS, statusLabel, statusDescription, renderStatusCell } from '../../utils/status-helpers.js';
import { openInitiativeDetail } from '../../utils/side-panel-detail.js';
import { openEditInitiativeModal } from '../../utils/new-initiative.js';
import { createPageLayout } from '../../utils/navbar.js';
import { mentorName, gestorName, buildKpi } from '../../utils/format-helpers.js';
import { createSortableTable } from '../../utils/table-helpers.js';
import { getTeamOptions } from '../../utils/org-hierarchy-api.js';
import { INITIATIVE_TAGS, EVENT_TYPES } from '../../utils/constants.js';
import { canAccess } from '../../utils/roles.js';
import { createExportButton } from '../../utils/initiatives-export.js';
import { getByEventType } from '../../utils/initiative-events-api.js';
import { emailEquals } from '../../utils/email-helpers.js';

export default defineRoute((config) => {
  config.setRouteTitle('Pessoal');

  const user = ContextStore.get('currentUser');
  const currentEmail = user.get('email');

  // -- state --

  let activeTab = 'em-curso';
  let allMyItems = [];
  let sharedItems = [];
  let sharedByMap = new Map();
  let teamOptions = [];

  // -- filter FormFields --

  const titleFilterField = new FormField({ value: '' });
  const teamFilterField = new FormField({ value: '' });
  const tagFilterField = new FormField({ value: [] });
  let filtersSubscribed = false;
  let suppressFilterRefresh = false;

  // -- layout containers --

  const kpiContainer = new Container([], { class: 'pace-kpi-row' });
  const revisionSection = new Container([], { class: 'pace-revision-section' });
  const toggleContainer = new Container([], { class: 'pace-toggle-wrapper' });
  const filterBar = new Container([], { class: 'pace-filters' });
  const emCursoView = new View([], { showOnRender: true });
  const colaboracoesView = new View([], { showOnRender: false });
  const rascunhosView = new View([], { showOnRender: false });
  const finalizadasView = new View([], { showOnRender: false });

  // -- sortable tables --

  const standardColumns = [
    { label: 'Iniciativa', sortAccessor: (i) => (i.Title || '').toLowerCase() },
    { label: 'Equipa', sortAccessor: (i) => i.Team || '' },
    { label: 'Mentor', sortAccessor: mentorName },
    { label: 'Gestor', sortAccessor: gestorName },
    { label: 'Estado', sortAccessor: (i) => statusLabel(i.Status) },
  ];

  function buildSharedCells(item) {
    return [
      new Button(item.Title || '-', {
        variant: 'secondary',
        class: 'pace-table-link-btn',
      }),
      new Text(item.Description || '---', { type: 'span', class: 'pace-table-description' }),
      new Text(item.Team || '', { type: 'span' }),
      new Text(mentorName(item), { type: 'span' }),
      new Text(gestorName(item), { type: 'span' }),
      renderStatusCell(item),
    ];
  }

  function buildStandardRow(item) {
    const cells = buildSharedCells(item);
    const mergedCell = new Container([cells[0], cells[1]], { class: 'pace-table-cell-stack' });
    return new Container([mergedCell, ...cells.slice(2)], { class: 'pace-table-row', onClickHandler: () => openInitiativeDetail(item, 'pessoal', loadData) });
  }

  const emCursoTable = createSortableTable({
    columns: standardColumns,
    buildRow: buildStandardRow,
    emptyMessage: 'Sem iniciativas nesta categoria.',
    wrapClass: 'pace-table-wrap pace-table--pessoal-standard',
  });

  const colaboracoesTable = createSortableTable({
    columns: standardColumns,
    buildRow: buildStandardRow,
    emptyMessage: 'Sem iniciativas nesta categoria.',
    wrapClass: 'pace-table-wrap pace-table--pessoal-standard',
  });

  const rascunhosTable = createSortableTable({
    columns: standardColumns,
    buildRow: buildStandardRow,
    emptyMessage: 'Sem iniciativas nesta categoria.',
    wrapClass: 'pace-table-wrap pace-table--pessoal-standard',
  });

  const finalizadasTable = createSortableTable({
    columns: standardColumns,
    buildRow: buildStandardRow,
    emptyMessage: 'Sem iniciativas nesta categoria.',
    wrapClass: 'pace-table-wrap pace-table--pessoal-standard',
  });

  emCursoView.children = [emCursoTable.container];
  colaboracoesView.children = [colaboracoesTable.container];
  rascunhosView.children = [rascunhosTable.container];
  finalizadasView.children = [finalizadasTable.container];

  // -- filtering --

  function applyFilters(items) {
    const title = (titleFilterField.value || '').trim().toLowerCase();
    const team = extractComboBoxValue(teamFilterField.value);
    const tagsRaw = extractComboBoxValue(tagFilterField.value);
    const tags = Array.isArray(tagsRaw) ? tagsRaw.filter(Boolean) : (tagsRaw ? [tagsRaw] : []);
    return items.filter((i) => {
      if (title && !(i.Title || '').toLowerCase().includes(title)) return false;
      if (team && i.ImpactedTeamOUID !== team) return false;
      if (tags.length) {
        const itemTags = Array.isArray(i.Tags) ? i.Tags : [];
        if (!tags.some((t) => itemTags.includes(t))) return false;
      }
      return true;
    });
  }

  // -- toggle --

  function rebuildToggle() {
    const tabs = [
      { key: 'em-curso', label: 'Em Curso' },
      { key: 'colaboracoes', label: 'Colaborações Recebidas' },
      { key: 'rascunhos', label: 'Rascunhos' },
      { key: 'finalizadas', label: 'Finalizadas' },
    ];

    toggleContainer.children = [
      new Container(
        tabs.map((tab) =>
          new Button(tab.label, {
            variant: activeTab === tab.key ? 'primary' : 'secondary',
            class: activeTab === tab.key ? 'pace-toggle-btn pace-toggle-btn--active' : 'pace-toggle-btn',
            onClickHandler: () => switchTab(tab.key),
          })
        ),
        { class: 'pace-toggle' }
      ),
      exportBtn,
    ];
  }

  function switchTab(tab) {
    activeTab = tab;
    emCursoView[tab === 'em-curso' ? 'show' : 'hide']();
    colaboracoesView[tab === 'colaboracoes' ? 'show' : 'hide']();
    rascunhosView[tab === 'rascunhos' ? 'show' : 'hide']();
    finalizadasView[tab === 'finalizadas' ? 'show' : 'hide']();
    rebuildToggle();
    buildUI();
  }

  // -- filter bar --

  function buildFilters() {
    if (filterBar.children.length > 0) return;

    const titleInput = new TextInput(titleFilterField, { placeholder: 'Pesquisar título...' });
    const teamCombo = new ComboBox(teamFilterField, teamOptions, { placeholder: 'Equipa impactada...' });
    const tagCombo = new ComboBox(tagFilterField, INITIATIVE_TAGS, { placeholder: 'Tags...', allowMultiple: true });

    const clearBtn = new Button('Limpar', {
      variant: 'secondary',
      onClickHandler: () => {
        suppressFilterRefresh = true;
        titleFilterField.value = '';
        teamFilterField.value = '';
        tagFilterField.value = [];
        for (const o of teamOptions) o.checked = false;
        filterBar.children = [];
        buildFilters();
        suppressFilterRefresh = false;
        buildUI();
      },
    });

    filterBar.children = [titleInput, teamCombo, tagCombo, clearBtn];
  }

  // -- build UI --

  function buildUI() {
    const filtered = applyFilters(allMyItems);

    const terminalStatuses = [STATUS.IMPLEMENTADO, STATUS.CANCELADO, STATUS.REJEITADO];
    const myFiltered = filtered.filter((item) => emailEquals(item.SubmittedByEmail, currentEmail));
    const activeItems = myFiltered.filter(
      (item) => item.Status !== STATUS.RASCUNHO && !terminalStatuses.includes(item.Status)
    );
    const drafts = myFiltered.filter((item) => item.Status === STATUS.RASCUNHO);
    const finalizadas = myFiltered.filter((item) => terminalStatuses.includes(item.Status));

    const sharedUUIDSet = new Set(sharedItems.map((i) => i.UUID));
    const filteredShared = filtered.filter((item) => sharedUUIDSet.has(item.UUID));

    rebuildToggle();
    buildFilters();

    emCursoTable.setItems(activeItems);
    colaboracoesTable.setItems(filteredShared);
    rascunhosTable.setItems(drafts);
    finalizadasTable.setItems(finalizadas);
  }

  // -- export button --

  const exportBtn = createExportButton({
    getRows: () => {
      const filtered = applyFilters(allMyItems);
      const terminalStatuses = [STATUS.IMPLEMENTADO, STATUS.CANCELADO, STATUS.REJEITADO];
      const myFiltered = filtered.filter((i) => emailEquals(i.SubmittedByEmail, currentEmail));
      switch (activeTab) {
        case 'em-curso':
          return myFiltered.filter((i) => i.Status !== STATUS.RASCUNHO && !terminalStatuses.includes(i.Status));
        case 'colaboracoes': {
          const sharedUUIDSet = new Set(sharedItems.map((i) => i.UUID));
          return filtered.filter((i) => sharedUUIDSet.has(i.UUID));
        }
        case 'rascunhos':
          return myFiltered.filter((i) => i.Status === STATUS.RASCUNHO);
        case 'finalizadas':
          return myFiltered.filter((i) => terminalStatuses.includes(i.Status));
        default: return [];
      }
    },
    filenamePrefix: 'iniciativas-pessoal',
  });

  // -- data loading --

  async function loadData() {
    let sharedRecords = [];
    try {
      sharedRecords = await getSharedWithMe(currentEmail);
    } catch (error) {
      console.error('[pessoal/loadData] getSharedWithMe failed', error);
      // Non-critical, continue without shared items
    }

    const sharedUUIDs = sharedRecords.map((r) => r.InitiativeUUID);

    let allResults = [];
    let teams = [];
    try {
      [allResults, teams] = await Promise.all([
        getPersonalAndShared(currentEmail, sharedUUIDs),
        getTeamOptions(),
      ]);
    } catch (error) {
      console.error('[pessoal/loadData] failed', error);
      Toast.error('Erro ao carregar iniciativas pessoais.');
    }

    teamOptions = teams;

    const personalItems = [];
    const sharedItemsList = [];
    const sharedUUIDSet = new Set(sharedUUIDs);
    for (const item of allResults) {
      if (emailEquals(item.SubmittedByEmail, currentEmail)) {
        personalItems.push(item);
      }
      if (sharedUUIDSet.has(item.UUID)) {
        sharedItemsList.push(item);
      }
    }

    const seenUUIDs = new Set(personalItems.map((i) => i.UUID));
    const combined = [...personalItems];
    for (const item of sharedItemsList) {
      if (!seenUUIDs.has(item.UUID)) {
        combined.push(item);
        seenUUIDs.add(item.UUID);
      }
    }

    allMyItems = combined;
    sharedItems = sharedItemsList;
    sharedByMap = new Map(sharedRecords.map((r) => [r.InitiativeUUID, r]));

    // -- KPI row (unfiltered totals) --
    const submitted = allMyItems.filter((i) => i.Status !== STATUS.RASCUNHO).length;
    const inProgress = allMyItems.filter((i) =>
      [STATUS.SUBMETIDO, STATUS.VALIDADO_MENTOR, STATUS.EM_EXECUCAO, STATUS.POR_VALIDAR,
       STATUS.VALIDADO_GESTOR, STATUS.VALIDADO_FINAL, STATUS.EM_REVISAO].includes(i.Status)
    ).length;
    const implemented = allMyItems.filter((i) => i.Status === STATUS.IMPLEMENTADO).length;

    kpiContainer.children = [
      buildKpi(String(submitted), 'Submetidas'),
      buildKpi(String(inProgress), 'Em Curso'),
      buildKpi(String(implemented), 'Implementadas'),
    ];

    // -- Revision section (unfiltered) --
    const revisionItems = allMyItems.filter((item) => item.Status === STATUS.EM_REVISAO);
    if (revisionItems.length > 0) {
      // Fetch latest REVIEW_REQUEST event per initiative (for inline reason comment)
      let latestRevisionComment = new Map();
      try {
        const revisionEvents = await getByEventType(EVENT_TYPES.REVIEW_REQUEST);
        for (const ev of revisionEvents) {
          const prev = latestRevisionComment.get(ev.InitiativeUUID);
          if (!prev || (ev.Date || '').localeCompare(prev.Date || '') > 0) {
            latestRevisionComment.set(ev.InitiativeUUID, ev);
          }
        }
      } catch (error) { console.error('[pessoal] revision events fetch failed', error); /* non-critical */ }

      const revCards = revisionItems.map((item) => {
        const daysSince = __dayjs().diff(__dayjs(item.Modified || item.Created), 'day');
        const urgent = daysSince > 7;
        const itemClass = urgent
          ? 'pace-pending-item pace-pending-item--urgent pace-revision-item'
          : 'pace-pending-item pace-revision-item';

        const reviewEv = latestRevisionComment.get(item.UUID);
        const reviewComment = reviewEv?.Comment?.trim();

        const cardChildren = [
          new Container([
            new Text(item.Title || 'Sem título', { type: 'span', class: 'pace-pending-item-title' }),
          ]),
          new Text('Revisão solicitada pelo mentor/gestor.', { type: 'p', class: 'pace-pending-item-meta' }),
        ];
        if (reviewComment) {
          cardChildren.push(new Text(reviewComment, { type: 'p', class: 'pace-pending-item-comment' }));
        }
        cardChildren.push(new Container([
          new Text(`${daysSince} dia${daysSince !== 1 ? 's' : ''}`, { type: 'span', class: 'pace-pending-item-meta' }),
          ...(canAccess('editar') ? [new Button('Rever', {
            variant: 'secondary',
            onClickHandler: (e) => {
              e.stopPropagation();
              openEditInitiativeModal(item, loadData, { context: 'pessoal', currentEmail });
            },
          })] : []),
        ], { class: 'pace-pending-item-actions' }));

        const container = new Container(cardChildren, { class: itemClass });
        container.setEventHandler('click', () => openInitiativeDetail(item, 'pessoal', loadData));
        return container;
      });

      revisionSection.children = revCards;
    } else {
      revisionSection.children = [];
    }

    buildUI();

    if (!filtersSubscribed) {
      const refresh = () => { if (!suppressFilterRefresh) buildUI(); };
      titleFilterField.subscribe(refresh);
      teamFilterField.subscribe(refresh);
      tagFilterField.subscribe(refresh);
      filtersSubscribed = true;
    }
  }

  // -- init --

  loadData();

  return createPageLayout([kpiContainer, revisionSection, toggleContainer, filterBar, emCursoView, colaboracoesView, rascunhosView, finalizadasView], { contentClass: 'pt-v2' });
});
