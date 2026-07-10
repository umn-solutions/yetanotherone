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
import { getUnassignedByStatuses, getByStatusesAndMentor, getByUUIDs, getByStatuses } from '../../utils/initiatives-api.js';
import { getSharedWithMe } from '../../utils/shared-api.js';
import { canAccess } from '../../utils/roles.js';
import { STATUS, statusLabel, statusDescription, renderStatusCell } from '../../utils/status-helpers.js';
import {
  ownerName,
  mentorName,
  gestorName,
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
  config.setRouteTitle('Mentoria');

  const user = ContextStore.get('currentUser');
  const currentEmail = user.get('email');

  // -- state --

  let projectItems = [];
  let myValidadoGestor = [];
  let myTrackingItems = [];
  let implementacaoItems = [];
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
      new Text('Mentoria', { type: 'h2', class: 'pace-cta-title' }),
      new Text(
        'Acompanhe as iniciativas da sua equipa, valide projectos submetidos e confirme savings implementados.',
        { type: 'p' }
      ),
    ],
    { class: 'pace-cta' }
  );
  const kpiRow = new Container([], { class: 'pace-kpi-row' });
  const validationGrid = new Container([]);
  const toggleContainer = new Container([], { class: 'pace-toggle-wrapper' });
  const filterBar = new Container([], { class: 'pace-filters' });
  const minhasView = new View([], { showOnRender: true });
  const colabsView = new View([], { showOnRender: false });

  // -- sortable tables --

  const sharedColumns = [
    { label: 'Iniciativa', sortAccessor: (i) => (i.Title || '').toLowerCase() },
    { label: 'Equipa', sortAccessor: (i) => i.Team || '' },
    { label: 'Colaborador', sortAccessor: ownerName },
    { label: 'Gestor', sortAccessor: gestorName },
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
      new Text(gestorName(item), { type: 'span' }),
      renderStatusCell(item),
    ], { class: 'pace-table-row', onClickHandler: openFn });
  }

  const minhasTable = createSortableTable({
    columns: sharedColumns,
    buildRow: (item) => buildStandardRow(item, () => openInitiativeDetail(item, 'mentoria', loadData)),
    emptyMessage: 'Sem iniciativas em acompanhamento.',
    wrapClass: 'pace-table-wrap pace-table--pessoal-standard',
  });

  const colabsTable = createSortableTable({
    columns: sharedColumns,
    buildRow: (item) => buildStandardRow(item, () => openInitiativeDetail(item, 'mentoria', loadData, { canAct: false })),
    emptyMessage: 'Sem colaborações recebidas.',
    wrapClass: 'pace-table-wrap pace-table--pessoal-standard',
  });

  minhasView.children = [minhasTable.container];
  colabsView.children = [colabsTable.container];

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

  // -- build UI after data load --

  function buildUI() {
    const activeDataset = activeTab === 'minhas' ? myTrackingItems : colabItems;
    const filtered = applyFilters(activeDataset);
    const isManager = canAccess('validar_implementacao_final');

    kpiRow.children = [
      buildKpi(String(projectItems.length), 'Validação Projecto'),
      buildKpi(String(myValidadoGestor.length), 'Confirmação Final'),
      buildKpi(String(myTrackingItems.length), 'Em Acompanhamento'),
      ...(isManager ? [buildKpi(String(implementacaoItems.length), 'Confirmação de Implementação')] : []),
    ];

    const showGrid = projectItems.length > 0 || myValidadoGestor.length > 0 || implementacaoItems.length > 0;
    if (showGrid) {
      const gridColumns = [
        new Container(
          [
            new Text('Validação de Projecto', { type: 'h3' }),
            ...projectItems.map((item) => buildPendingItem(item, 'projecto')),
            ...(projectItems.length === 0
              ? [new Text('Sem iniciativas pendentes de validação.', { type: 'p', class: 'pace-empty' })]
              : []),
          ],
          { class: 'pace-validation-col pace-validation-col--project pace-validation-col--scroll' }
        ),
        new Container(
          [
            new Text('Confirmação Final', { type: 'h3' }),
            ...myValidadoGestor.map((item) => buildPendingItem(item, 'savings')),
            ...(myValidadoGestor.length === 0
              ? [new Text('Sem iniciativas pendentes de confirmação final.', { type: 'p', class: 'pace-empty' })]
              : []),
          ],
          { class: 'pace-validation-col pace-validation-col--savings pace-validation-col--scroll' }
        ),
      ];
      if (isManager) {
        gridColumns.push(
          new Container(
            [
              new Text('Confirmação de Implementação', { type: 'h3' }),
              ...implementacaoItems.map((item) => buildPendingItem(item, 'implementacao')),
              ...(implementacaoItems.length === 0
                ? [new Text('Sem iniciativas pendentes de confirmação de implementação.', { type: 'p', class: 'pace-empty' })]
                : []),
            ],
            { class: 'pace-validation-col pace-validation-col--implementacao pace-validation-col--scroll' }
          )
        );
      }
      validationGrid.children = [
        new Container(gridColumns, {
          class: isManager
            ? 'pace-validation-grid pace-validation-grid--triple'
            : 'pace-validation-grid',
        }),
      ];
    } else {
      validationGrid.children = [];
    }

    rebuildToggle();
    buildFilters();

    if (activeTab === 'minhas') {
      minhasTable.setItems(filtered);
    } else {
      colabsTable.setItems(filtered);
    }
  }

  function buildPendingItem(item, type, canAct = true, sharedByName = '') {
    const days = daysPending(item.Modified || item.Created);
    const urgent = days > 5;
    const cls = urgent
      ? 'pace-pending-item pace-pending-item--urgent'
      : 'pace-pending-item';

    const mentor = mentorName(item);
    const metaParts = [ownerName(item), item.ImpactedTeamOUID];
    if (type === 'projecto' && mentor !== '---') {
      metaParts.push(`Mentor: ${mentor}`);
    } else if (type === 'savings' || type === 'implementacao') {
      metaParts.push(`Gestor: ${gestorName(item)}`);
    }
    const metaText = metaParts.join(' | ');

    const rightInfo = `${days}d pendente`;

    const actionLabel = !canAct ? 'Ver'
      : item.Status === STATUS.SUBMETIDO ? 'Validar'
      : item.Status === STATUS.VALIDADO_GESTOR ? 'Confirmar'
      : item.Status === STATUS.VALIDADO_FINAL ? 'Confirmar'
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
                openInitiativeDetail(item, 'mentoria', loadData, { canAct });
              },
            }),
          ],
          { class: 'pace-pending-item-actions' }
        ),
      ],
      { class: cls }
    );
    card.setEventHandler('click', () => openInitiativeDetail(item, 'mentoria', loadData, { canAct }));
    return card;
  }

  // -- export button --

  const exportBtn = createExportButton({
    getRows: () => applyFilters(activeTab === 'minhas' ? myTrackingItems : colabItems),
    filenamePrefix: 'iniciativas-mentoria',
  });

  // -- data loading --

  async function loadData() {
    const loading = Toast.loading('A carregar iniciativas...');
    try {
      const [unassigned, myItems, sharedRecords, teams] = await Promise.all([
        getUnassignedByStatuses([STATUS.SUBMETIDO]),
        getByStatusesAndMentor(
          [STATUS.SUBMETIDO, STATUS.VALIDADO_MENTOR, STATUS.EM_EXECUCAO, STATUS.POR_VALIDAR, STATUS.VALIDADO_GESTOR, STATUS.VALIDADO_FINAL],
          currentEmail
        ),
        getSharedWithMe(currentEmail),
        getTeamOptions(),
      ]);

      teamOptions = teams;

      if (canAccess('validar_implementacao_final')) {
        implementacaoItems = await getByStatuses([STATUS.VALIDADO_FINAL]);
      } else {
        implementacaoItems = [];
      }

      const mySubmetidos = myItems.filter((i) => i.Status === STATUS.SUBMETIDO);
      projectItems = [...unassigned, ...mySubmetidos];
      myValidadoGestor = myItems.filter((i) => i.Status === STATUS.VALIDADO_GESTOR);
      myTrackingItems = myItems.filter((i) =>
        i.Status === STATUS.VALIDADO_MENTOR ||
        i.Status === STATUS.EM_EXECUCAO ||
        i.Status === STATUS.POR_VALIDAR ||
        i.Status === STATUS.VALIDADO_GESTOR ||
        i.Status === STATUS.VALIDADO_FINAL
      );

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
        try {
          colabItems = await getByUUIDs(sharedRecords.map((r) => r.InitiativeUUID));
        } catch (error) { console.error('[mentoria/loadData] getByUUIDs failed', error); }
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
      console.error('[mentoria/loadData] failed', error);
      loading.error('Erro ao carregar iniciativas');
    }
  }

  // -- init --

  loadData();

  return createPageLayout([
    ctaBanner,
    kpiRow,
    validationGrid,
    toggleContainer,
    filterBar,
    minhasView,
    colabsView,
  ], { contentClass: 'pt-v2' });
});
