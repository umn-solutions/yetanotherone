import {
  Text,
  Container,
  Button,
  ComboBox,
  FormField,
  TextInput,
  Toast,
  View,
  defineRoute,
  extractComboBoxValue,
} from '../../libs/nofbiz/nofbiz.base.js';

import { getByStatuses, getByStatusesAndTeamScope } from '../../utils/initiatives-api.js';
import { STATUS, statusLabel, statusDescription } from '../../utils/status-helpers.js';
import { openInitiativeDetail } from '../../utils/side-panel-detail.js';
import { createPageLayout } from '../../utils/navbar.js';
import { buildKpi, mentorName, gestorName } from '../../utils/format-helpers.js';
import { createSortableTable } from '../../utils/table-helpers.js';
import { getUserDeptAncestorPath } from '../../utils/roles.js';
import { getTeamOptions, getTeamScope } from '../../utils/org-hierarchy-api.js';
import { INITIATIVE_TAGS } from '../../utils/constants.js';
import { createExportButton } from '../../utils/initiatives-export.js';

export default defineRoute((config) => {
  config.setRouteTitle('Geral');

  const ONGOING_STATUSES = [
    STATUS.SUBMETIDO,
    STATUS.VALIDADO_MENTOR,
    STATUS.EM_EXECUCAO,
    STATUS.POR_VALIDAR,
    STATUS.VALIDADO_GESTOR,
    STATUS.VALIDADO_FINAL,
    STATUS.EM_REVISAO,
  ];

  // -- state --

  let myTeamData = null;       // cached scoped fetch
  let allData = null;          // cached unscoped fetch (loaded lazily for "outras")
  let teamOptions = [];
  let myTeamScope = new Set();
  let activeTabKey = 'minha-equipa';
  let othersLoading = false;

  // -- filter FormFields --

  const titleFilterField = new FormField({ value: '' });
  const teamFilterField = new FormField({ value: '' });
  const tagFilterField = new FormField({ value: [] });
  let filtersSubscribed = false;
  let suppressFilterRefresh = false;

  // -- layout containers --

  const kpiRow = new Container([], { class: 'pace-kpi-row' });
  const toggleContainer = new Container([], { class: 'pace-toggle-wrapper' });
  const filterBar = new Container([], { class: 'pace-filters' });
  const myTeamView = new View([], { showOnRender: true });
  const otherTeamView = new View([], { showOnRender: false });

  // -- sortable tables --

  const tableColumns = [
    { label: 'Iniciativa', sortAccessor: (i) => (i.Title || '').toLowerCase() },
    { label: 'Equipa', sortAccessor: (i) => i.Team || '' },
    { label: 'Mentor', sortAccessor: mentorName },
    { label: 'Gestor', sortAccessor: gestorName },
    { label: 'Estado', sortAccessor: (i) => statusLabel(i.Status) },
  ];

  function buildRow(item) {
    const mergedCell = new Container([
      new Button(item.Title || '-', {
        variant: 'secondary',
        class: 'pace-table-link-btn',
      }),
      new Text(item.Description || '---', { type: 'span', class: 'pace-table-description' }),
    ], { class: 'pace-table-cell-stack' });
    return new Container([
      mergedCell,
      new Text(item.Team || '', { type: 'span' }),
      new Text(mentorName(item), { type: 'span' }),
      new Text(gestorName(item), { type: 'span' }),
      new Text(statusDescription(item.Status), { type: 'span' }),
    ], { class: 'pace-table-row', onClickHandler: () => openInitiativeDetail(item, 'geral', () => reloadActive(true)) });
  }

  const myTeamTable = createSortableTable({
    columns: tableColumns,
    buildRow,
    emptyMessage: 'Sem iniciativas nesta categoria.',
    wrapClass: 'pace-table-wrap pace-table--pessoal-standard',
  });

  const otherTeamTable = createSortableTable({
    columns: tableColumns,
    buildRow,
    emptyMessage: 'Sem iniciativas nesta categoria.',
    wrapClass: 'pace-table-wrap pace-table--pessoal-standard',
  });

  myTeamView.children = [myTeamTable.container];
  otherTeamView.children = [otherTeamTable.container];

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

  function getActiveDataset() {
    if (activeTabKey === 'minha-equipa') return myTeamData || [];
    if (!allData) return [];
    return allData.filter((i) => !myTeamScope.has(i.ImpactedTeamOUID));
  }

  // -- toggle --

  const tabs = [
    { key: 'minha-equipa', label: 'Para a minha equipa' },
    { key: 'outras', label: 'Outras equipas' },
  ];

  function rebuildToggle() {
    toggleContainer.children = [
      new Container(
        tabs.map((tab) =>
          new Button(tab.label, {
            variant: activeTabKey === tab.key ? 'primary' : 'secondary',
            class: activeTabKey === tab.key ? 'pace-toggle-btn pace-toggle-btn--active' : 'pace-toggle-btn',
            onClickHandler: () => switchTab(tab.key),
          })
        ),
        { class: 'pace-toggle' }
      ),
      exportBtn,
    ];
  }

  async function switchTab(key) {
    activeTabKey = key;
    myTeamView[key === 'minha-equipa' ? 'show' : 'hide']();
    otherTeamView[key === 'outras' ? 'show' : 'hide']();
    rebuildToggle();

    if (key === 'outras' && !allData && !othersLoading) {
      othersLoading = true;
      const loading = Toast.loading('A carregar outras equipas...');
      try {
        const items = await getByStatuses(ONGOING_STATUSES);
        allData = items.filter((i) => !i.IsConfidential);
        loading.dismiss();
      } catch (error) {
        console.error('[geral/loadOthers] failed', error);
        loading.error('Erro ao carregar iniciativas.');
      } finally {
        othersLoading = false;
      }
    }

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
    const dataset = getActiveDataset();
    const filtered = applyFilters(dataset);

    const uniqueTeams = new Set(filtered.map((i) => i.ImpactedTeamOUID).filter(Boolean)).size;
    const uniqueSubmitters = new Set(filtered.map((i) => i.SubmittedBy).filter(Boolean)).size;

    kpiRow.children = [
      buildKpi(String(filtered.length), 'Iniciativas'),
      buildKpi(String(uniqueTeams), 'Equipas impactadas'),
      buildKpi(String(uniqueSubmitters), 'Colaboradores Responsáveis'),
    ];

    rebuildToggle();
    buildFilters();

    if (activeTabKey === 'minha-equipa') {
      myTeamTable.setItems(filtered);
    } else {
      otherTeamTable.setItems(filtered);
    }
  }

  // -- export button --

  const exportBtn = createExportButton({
    getRows: () => applyFilters(getActiveDataset()),
    filenamePrefix: 'iniciativas-geral',
  });

  // -- data loading --

  async function reloadActive(invalidate = false) {
    if (invalidate) {
      myTeamData = null;
      allData = null;
    }
    return loadInitial();
  }

  async function loadInitial() {
    const loading = Toast.loading('A carregar iniciativas...');
    try {
      const userPath = getUserDeptAncestorPath();
      const [teams, scopeCodes] = await Promise.all([
        getTeamOptions(),
        userPath ? getTeamScope(userPath) : Promise.resolve([]),
      ]);

      teamOptions = teams;
      myTeamScope = new Set(scopeCodes);

      const scopedItems = scopeCodes.length
        ? await getByStatusesAndTeamScope(ONGOING_STATUSES, scopeCodes)
        : [];
      myTeamData = scopedItems.filter((i) => !i.IsConfidential);

      loading.dismiss();
      buildUI();

      if (!filtersSubscribed) {
        const refresh = () => { if (!suppressFilterRefresh) buildUI(); };
        titleFilterField.subscribe(refresh);
        teamFilterField.subscribe(refresh);
        tagFilterField.subscribe(refresh);
        filtersSubscribed = true;
      }
    } catch (error) {
      console.error('[geral/loadInitial] failed', error);
      loading.error('Erro ao carregar iniciativas.');
    }
  }

  // -- init --

  loadInitial();

  return createPageLayout([kpiRow, toggleContainer, filterBar, myTeamView, otherTeamView]);
});
