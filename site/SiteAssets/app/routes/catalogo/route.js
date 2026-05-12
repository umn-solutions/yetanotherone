import {
  Text,
  Container,
  Button,
  ComboBox,
  FormField,
  TextInput,
  View,
  Toast,
  defineRoute,
  extractComboBoxValue,
  __dayjs,
} from '../../libs/nofbiz/nofbiz.base.js';
import { getByStatuses } from '../../utils/initiatives-api.js';
import {
  STATUS,
  statusLabel,
  statusDescription,
} from '../../utils/status-helpers.js';
import {
  ownerName,
  gestorName,
  buildKpi,
} from '../../utils/format-helpers.js';
import { getTeamOptions } from '../../utils/org-hierarchy-api.js';
import { INITIATIVE_TAGS } from '../../utils/constants.js';
import { createSortableTable } from '../../utils/table-helpers.js';
import { createPageLayout } from '../../utils/navbar.js';
import { openInitiativeDetail } from '../../utils/side-panel-detail.js';
import { createExportButton } from '../../utils/initiatives-export.js';

export default defineRoute((config) => {
  config.setRouteTitle('Catálogo');

  // -- state --

  let allItems = [];
  let teamOptions = [];
  let activeTab = 'implementados';
  let implementados = [];
  let arquivo = [];
  let uniqueTeams = 0;
  let involvedUsers = 0;

  const titleFilterField = new FormField({ value: '' });
  const teamFilterField = new FormField({ value: '' });
  const tagFilterField = new FormField({ value: [] });
  let filtersSubscribed = false;
  let suppressFilterRefresh = false;

  // -- layout containers --

  const kpiRow = new Container([], { class: 'pace-kpi-row' });
  const toggleContainer = new Container([], { class: 'pace-toggle-wrapper' });
  const filterBar = new Container([], { class: 'pace-filters' });
  const implementadosView = new View([], { showOnRender: true });
  const arquivoView = new View([], { showOnRender: false });

  // -- sortable tables --

  const sharedColumns = [
    { label: 'Iniciativa', sortAccessor: (i) => (i.Title || '').toLowerCase() },
    { label: 'Descrição', sortAccessor: (i) => (i.Description || '').toLowerCase() },
    { label: 'Colaborador', sortAccessor: ownerName },
    { label: 'Equipa', sortAccessor: (i) => i.Team || '' },
    { label: 'Gestor', sortAccessor: gestorName },
  ];

  function buildSharedCells(item) {
    return [
      new Button(item.Title || '-', {
        variant: 'secondary',
        class: 'pace-table-link-btn',
      }),
      new Text(item.Description || '---', { type: 'span', class: 'pace-table-description' }),
      new Text(ownerName(item), { type: 'span' }),
      new Text(item.Team || '', { type: 'span' }),
      new Text(gestorName(item), { type: 'span' }),
    ];
  }

  const implementadosTable = createSortableTable({
    columns: [
      sharedColumns[0],
      ...sharedColumns.slice(2),
      { label: 'Data de Implementação', sortAccessor: (i) => (i.ImplementedDate ? __dayjs(i.ImplementedDate).valueOf() : 0) },
    ],
    buildRow: (item) => {
      const cells = buildSharedCells(item);
      cells.push(
        new Text(
          item.ImplementedDate ? __dayjs(item.ImplementedDate).format('DD/MM/YYYY') : '---',
          { type: 'span' }
        )
      );
      const mergedCell = new Container([cells[0], cells[1]], { class: 'pace-table-cell-stack' });
      return new Container([mergedCell, ...cells.slice(2)], { class: 'pace-table-row', onClickHandler: () => openInitiativeDetail(item, 'catalogo', loadData) });
    },
    emptyMessage: 'Sem iniciativas nesta categoria.',
    wrapClass: 'pace-table-wrap pace-table--catalogo',
  });

  const arquivoColumns = [
    sharedColumns[0],
    { label: 'Estado', sortAccessor: (i) => statusLabel(i.Status) },
    ...sharedColumns.slice(2, 4),
  ];

  const arquivoTable = createSortableTable({
    columns: arquivoColumns,
    buildRow: (item) => {
      const cells = buildSharedCells(item);
      cells.pop();
      const mergedCell = new Container([cells[0], cells[1]], { class: 'pace-table-cell-stack' });
      const row = [mergedCell, cells[2], cells[3]];
      row.splice(1, 0, new Text(statusDescription(item.Status), { type: 'span' }));
      return new Container(row, { class: 'pace-table-row', onClickHandler: () => openInitiativeDetail(item, 'catalogo', loadData) });
    },
    emptyMessage: 'Sem iniciativas nesta categoria.',
    wrapClass: 'pace-table-wrap pace-table--arquivo',
  });

  implementadosView.children = [implementadosTable.container];
  arquivoView.children = [arquivoTable.container];

  // -- data loading --

  async function loadData() {
    const loading = Toast.loading('A carregar catálogo...');
    try {
      const [items, teams] = await Promise.all([
        getByStatuses([STATUS.IMPLEMENTADO, STATUS.CANCELADO, STATUS.REJEITADO]),
        getTeamOptions(),
      ]);
      allItems = items;
      teamOptions = teams;
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
      loading.error('Erro ao carregar catálogo');
    }
  }

  // -- build UI --

  function rebuildKpis() {
    if (activeTab === 'implementados') {
      kpiRow.children = [
        buildKpi(String(implementados.length), 'Iniciativas Implementadas'),
        buildKpi(String(uniqueTeams), 'Equipas Impactadas'),
        buildKpi(String(involvedUsers), 'Utilizadores Envolvidos', true),
      ];
    } else {
      kpiRow.children = [
        buildKpi(String(arquivo.length), 'Iniciativas em Arquivo'),
        buildKpi('-', 'Equipas Impactadas'),
        buildKpi('-', 'Utilizadores Envolvidos', true),
      ];
    }
  }

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

  function buildUI() {
    const filtered = applyFilters(allItems);
    implementados = filtered.filter((i) => i.Status === STATUS.IMPLEMENTADO);
    arquivo = filtered.filter(
      (i) => i.Status === STATUS.CANCELADO || i.Status === STATUS.REJEITADO
    );

    uniqueTeams = new Set(implementados.map((i) => i.ImpactedTeamOUID).filter(Boolean)).size;

    const allEmails = [
      ...implementados.map((i) => i.SubmittedByEmail),
      ...implementados.map((i) => i.MentorEmail),
      ...implementados.map((i) => i.GestorValidatorEmail),
    ].filter(Boolean);
    involvedUsers = new Set(allEmails).size;

    rebuildKpis();
    rebuildToggle();
    buildFilters();

    implementadosTable.setItems(implementados);
    arquivoTable.setItems(arquivo);
  }

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

  // -- export button (created once; re-used in rebuildToggle) --

  const exportBtn = createExportButton({
    getRows: () => activeTab === 'implementados' ? implementados : arquivo,
    filenamePrefix: 'iniciativas-catalogo',
  });

  function rebuildToggle() {
    toggleContainer.children = [
      new Container(
        [
          new Button('Implementados', {
            variant: activeTab === 'implementados' ? 'primary' : 'secondary',
            class: activeTab === 'implementados' ? 'pace-toggle-btn pace-toggle-btn--active' : 'pace-toggle-btn',
            onClickHandler: () => switchTab('implementados'),
          }),
          new Button('Arquivo', {
            variant: activeTab === 'arquivo' ? 'primary' : 'secondary',
            class: activeTab === 'arquivo' ? 'pace-toggle-btn pace-toggle-btn--active' : 'pace-toggle-btn',
            onClickHandler: () => switchTab('arquivo'),
          }),
        ],
        { class: 'pace-toggle' }
      ),
      exportBtn,
    ];
  }

  function switchTab(tab) {
    activeTab = tab;
    if (tab === 'implementados') {
      implementadosView.show();
      arquivoView.hide();
    } else {
      implementadosView.hide();
      arquivoView.show();
    }
    rebuildKpis();
    rebuildToggle();
  }

  // -- init --

  loadData();

  return createPageLayout([kpiRow, toggleContainer, filterBar, implementadosView, arquivoView]);
});
