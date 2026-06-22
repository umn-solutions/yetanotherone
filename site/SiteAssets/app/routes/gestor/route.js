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
  UserIdentity,
  defineRoute,
  extractComboBoxValue,
} from '../../libs/nofbiz/nofbiz.base.js';
import { getByStatusesAndGestor, getByUUIDs } from '../../utils/initiatives-api.js';
import { getSharedWithMe } from '../../utils/shared-api.js';
import { STATUS, statusLabel, statusDescription, renderStatusCell } from '../../utils/status-helpers.js';
import {
  ownerName,
  mentorName,
  daysPending,
  buildKpi,
} from '../../utils/format-helpers.js';
import { createSortableTable } from '../../utils/table-helpers.js';
import { createPageLayout } from '../../utils/navbar.js';
import { openInitiativeDetail } from '../../utils/side-panel-detail.js';
import { getTeamOptions } from '../../utils/org-hierarchy-api.js';
import { INITIATIVE_TAGS } from '../../utils/constants.js';
import { createExportButton } from '../../utils/initiatives-export.js';

export default defineRoute((config) => {
  config.setRouteTitle('Gestor');

  const user = ContextStore.get('currentUser');
  const currentEmail = user.get('email');

  // -- state --

  let gestorPendentes = [];
  let gestorTracking = [];
  let colabItems = [];
  let sharedByMap = new Map();
  let teamOptions = [];
  let activeTab = 'minhas';

  // -- filter FormFields --

  const titleFilterField = new FormField({ value: '' });
  const teamFilterField = new FormField({ value: '' });
  const tagFilterField = new FormField({ value: [] });
  let filtersSubscribed = false;
  let suppressFilterRefresh = false;

  // -- layout containers --

  const ctaBanner = new Container(
    [
      new Text('Gestor', { type: 'h2', class: 'pace-cta-title' }),
      new Text(
        'Valide os savings declarados pelas equipas e acompanhe as iniciativas em curso.',
        { type: 'p' }
      ),
    ],
    { class: 'pace-cta' }
  );
  const kpiRow = new Container([], { class: 'pace-kpi-row' });
  const pendingSection = new Container([], { class: 'pace-pending-section' });
  const toggleContainer = new Container([], { class: 'pace-toggle-wrapper' });
  const filterBar = new Container([], { class: 'pace-filters' });
  const minhasView = new View([], { showOnRender: true });
  const colabsView = new View([], { showOnRender: false });

  // -- sortable tables --

  const sharedColumns = [
    { label: 'Iniciativa', sortAccessor: (i) => (i.Title || '').toLowerCase() },
    { label: 'Equipa', sortAccessor: (i) => i.Team || '' },
    { label: 'Colaborador', sortAccessor: ownerName },
    { label: 'Mentor', sortAccessor: mentorName },
    { label: 'Estado', sortAccessor: (i) => statusLabel(i.Status) },
  ];

  function buildStandardRow(item, openFn) {
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
      new Text(ownerName(item), { type: 'span' }),
      new Text(mentorName(item), { type: 'span' }),
      renderStatusCell(item),
    ], { class: 'pace-table-row', onClickHandler: openFn });
  }

  const trackingTable = createSortableTable({
    columns: sharedColumns,
    buildRow: (item) => buildStandardRow(item, () => openInitiativeDetail(item, 'gestor', loadData)),
    emptyMessage: 'Sem iniciativas em acompanhamento.',
    wrapClass: 'pace-table-wrap pace-table--pessoal-standard',
  });

  const sharedTable = createSortableTable({
    columns: sharedColumns,
    buildRow: (item) => buildStandardRow(item, () => openInitiativeDetail(item, 'gestor', loadData, { canAct: false })),
    emptyMessage: 'Sem colaborações recebidas.',
    wrapClass: 'pace-table-wrap pace-table--pessoal-standard',
  });

  minhasView.children = [trackingTable.container];
  colabsView.children = [sharedTable.container];

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

  const tabs = [
    { key: 'minhas', label: 'Minhas Iniciativas' },
    { key: 'colabs', label: 'Colaborações Recebidas' },
  ];

  function rebuildToggle() {
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

  function switchTab(key) {
    activeTab = key;
    minhasView[key === 'minhas' ? 'show' : 'hide']();
    colabsView[key === 'colabs' ? 'show' : 'hide']();
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

  // -- pending item builder --

  function buildPendingItem(item, canAct = true, sharedByName = '') {
    const days = daysPending(item.Modified || item.Created);
    const urgent = days > 5;
    const cls = urgent
      ? 'pace-pending-item pace-pending-item--urgent'
      : 'pace-pending-item';

    const mentor = mentorName(item);
    const metaParts = [ownerName(item), item.ImpactedTeamOUID];
    if (mentor !== '---') {
      metaParts.push(`Mentor: ${mentor}`);
    }
    const metaText = metaParts.join(' | ');

    const rightInfo = `${days}d pendente`;

    const actionLabel = !canAct ? 'Ver'
      : item.Status === STATUS.POR_VALIDAR ? 'Aprovar'
      : 'Ver';

    const metaChildren = [
      new Text(item.Title, {
        type: 'span',
        class: 'pace-pending-item-title',
      }),
      new Text(metaText, {
        type: 'span',
        class: 'pace-pending-item-meta',
      }),
    ];

    if (sharedByName) {
      metaChildren.push(
        new Text(`Partilhado por: ${sharedByName}`, {
          type: 'span',
          class: 'pace-pending-item-meta',
        })
      );
    }

    const card = new Container(
      [
        new Container(metaChildren, { as: 'div' }),
        new Container(
          [
            new Text(rightInfo, { type: 'span', class: 'pace-pending-item-meta' }),
            new Button(actionLabel, {
              variant: 'secondary',
              onClickHandler: (e) => {
                e.stopPropagation();
                openInitiativeDetail(item, 'gestor', loadData, { canAct });
              },
            }),
          ],
          { class: 'pace-pending-item-actions' }
        ),
      ],
      { class: cls }
    );
    card.setEventHandler('click', () => openInitiativeDetail(item, 'gestor', loadData, { canAct }));
    return card;
  }

  // -- build UI after data load --

  function buildUI() {
    const activeDataset = activeTab === 'minhas' ? gestorTracking : colabItems;
    const filtered = applyFilters(activeDataset);

    const implementadasCount = gestorTracking.filter((i) => i.Status === STATUS.IMPLEMENTADO).length;
    const emAcompanhamentoCount = gestorTracking.filter((i) =>
      i.Status === STATUS.EM_EXECUCAO ||
      i.Status === STATUS.VALIDADO_GESTOR ||
      i.Status === STATUS.VALIDADO_FINAL
    ).length;

    kpiRow.children = [
      buildKpi(String(gestorPendentes.length), 'Por Validar'),
      buildKpi(String(implementadasCount), 'Implementadas'),
      buildKpi(String(emAcompanhamentoCount), 'Em Acompanhamento'),
    ];

    pendingSection.children = [
      new Text('Savings Por Validar', { type: 'h2', class: 'pace-sec-title' }),
      ...(gestorPendentes.length > 0
        ? gestorPendentes.map((item) => buildPendingItem(item))
        : [new Text('Sem savings pendentes.', { type: 'p', class: 'pace-empty' })]),
    ];

    rebuildToggle();
    buildFilters();

    if (activeTab === 'minhas') {
      trackingTable.setItems(filtered);
    } else {
      sharedTable.setItems(filtered);
    }
  }

  // -- export button --

  const exportBtn = createExportButton({
    getRows: () => applyFilters(activeTab === 'minhas' ? gestorTracking : colabItems),
    filenamePrefix: 'iniciativas-gestor',
  });

  // -- data loading --

  async function loadData() {
    const loading = Toast.loading('A carregar iniciativas...');
    try {
      const [allGestorItems, sharedRecords, teams] = await Promise.all([
        getByStatusesAndGestor([
          STATUS.EM_EXECUCAO,
          STATUS.POR_VALIDAR,
          STATUS.VALIDADO_GESTOR,
          STATUS.VALIDADO_FINAL,
          STATUS.IMPLEMENTADO,
        ], currentEmail),
        getSharedWithMe(currentEmail),
        getTeamOptions(),
      ]);

      teamOptions = teams;
      gestorPendentes = allGestorItems.filter((i) => i.Status === STATUS.POR_VALIDAR);
      gestorTracking = allGestorItems.filter((i) => i.Status !== STATUS.POR_VALIDAR);

      sharedByMap = new Map();
      colabItems = [];
      if (sharedRecords.length > 0) {
        for (const rec of sharedRecords) {
          const sharedByIdentity = UserIdentity.fromField(rec.SharedBy);
          sharedByMap.set(rec.InitiativeUUID, {
            sharedByName: sharedByIdentity ? sharedByIdentity.displayName : '',
            type: rec.Type,
          });
        }
        const assignedUUIDs = new Set([
          ...gestorPendentes.map((i) => i.UUID),
          ...gestorTracking.map((i) => i.UUID),
        ]);
        try {
          const fetched = await getByUUIDs(sharedRecords.map((r) => r.InitiativeUUID));
          colabItems = fetched.filter((i) => !assignedUUIDs.has(i.UUID));
        } catch (error) { console.error('[gestor/loadData] getByUUIDs failed', error); }
      }

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
      console.error('[gestor/loadData] failed', error);
      loading.error('Erro ao carregar iniciativas');
    }
  }

  // -- init --

  loadData();

  return createPageLayout([
    ctaBanner,
    kpiRow,
    pendingSection,
    toggleContainer,
    filterBar,
    minhasView,
    colabsView,
  ], { contentClass: 'pt-v2' });
});
