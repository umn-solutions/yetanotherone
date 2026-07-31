import {
  Text, Container, Button, Dialog, Toast, View, Loader, List,
  TabGroup, AccordionItem, FormField, TextInput, ComboBox, NumberInput, FieldLabel, defineRoute,
  SystemError, ContextStore, extractComboBoxValue,
} from '../../libs/nofbiz/nofbiz.base.js';
import { createPageLayout } from '../../utils/navbar.js';
import { importFromCSV, getAllEmployees, deriveRoles, updateEmployeeRole, getTeamOptions, getMentorUsers } from '../../utils/org-hierarchy-api.js';
import { buildKpi } from '../../utils/format-helpers.js';
import {
  getAllTargets, getTargetByYear, createTarget, updateTarget, deleteTarget,
  computeTargetTotals, FINANCIAL_CATEGORIES, getCategoryType,
} from '../../utils/savings-targets-api.js';
import {
  getAllMentorTeams, getMentorTeamsByEmail, createMentorTeams, updateMentorTeams, deleteMentorTeams,
  findTeamConflicts,
} from '../../utils/mentor-teams-api.js';
import { createExportButton } from '../../utils/initiatives-export.js';
import * as initiativesApi from '../../utils/initiatives-api.js';

export default defineRoute((config) => {
  config.setRouteTitle('Admin');

  // -- helpers --

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function openFileDialog(accept = '.csv,.xlsx') {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) {
          document.body.removeChild(input);
          reject(new SystemError('NoFileSelected', 'Nenhum ficheiro seleccionado', { breaksFlow: false }));
          return;
        }
        const isXLSX = /\.xlsx$/i.test(file.name);
        const reader = new FileReader();
        reader.onload = e => {
          document.body.removeChild(input);
          resolve({ name: file.name, size: file.size, content: e.target.result });
        };
        reader.onerror = () => {
          document.body.removeChild(input);
          reject(new SystemError('FileReadError', 'Erro ao ler o ficheiro'));
        };
        if (isXLSX) reader.readAsArrayBuffer(file);
        else reader.readAsText(file, 'windows-1252');
      });
      input.addEventListener('cancel', () => {
        document.body.removeChild(input);
        resolve(null);
      });
      input.click();
    });
  }

  const APP_ROLE_OPTIONS = [
    { label: 'Automático (sem perfil manual)', value: '' },
    { label: 'Colaborador', value: 'colaborador' },
    { label: 'Gestor', value: 'gestor' },
    { label: 'Mentor', value: 'mentor' },
    { label: 'Mentor Manager', value: 'mentor-manager' },
  ];

  // -- shared employee cache --

  let employeeCache = null;
  let cacheStale = true;
  let dadosLoaded = false;
  let hierarquiaLoaded = false;

  async function getEmployees() {
    if (!cacheStale && employeeCache !== null) return employeeCache;
    employeeCache = await getAllEmployees();
    cacheStale = false;
    return employeeCache;
  }

  function invalidateCache() {
    cacheStale = true;
    employeeCache = null;
    dadosLoaded = false;
    hierarquiaLoaded = false;
  }

  // -- state --

  let selectedFile = null;
  let progressCurrent = 0;
  let progressTotal = 0;

  // -- Tab 1: Importar --

  const ctaBanner = new Container(
    [
      new Container(
        [
          new Text('Gestão de Hierarquia Organizacional', {
            type: 'span',
            class: 'pace-cta-text',
          }),
          new Text(
            'Importar ficheiro CSV para actualizar a hierarquia organizacional. Esta operação substitui todos os dados existentes.',
            { type: 'p', class: 'pace-cta-text' }
          ),
        ],
        { as: 'div' }
      ),
    ],
    { class: 'pace-cta' }
  );

  const statsRow = new Container(
    [new Loader([], {})],
    { class: 'pace-kpi-row' }
  );

  const selectFileButton = new Button('Seleccionar ficheiro CSV', {
    variant: 'secondary',
    onClickHandler: handleSelectFile,
  });

  const uploadSection = new Container([]);

  const resultSection = new Container([]);

  const progressText = new Text(
    [() => progressTotal > 0
      ? `A importar... ${progressCurrent}/${progressTotal} colaboradores`
      : 'A preparar importação...'],
    { type: 'p' }
  );

  // -- stats --

  async function refreshStats() {
    try {
      const employees = await getEmployees();
      const ouSet = new Set(employees.map(e => e.OUID).filter(Boolean));
      const maxDepth = Math.max(0, ...employees.map(e => parseInt(e.Depth, 10) || 0));
      statsRow.children = [
        buildKpi(String(employees.length), 'Colaboradores'),
        buildKpi(String(ouSet.size), 'OUs'),
        buildKpi(String(maxDepth), 'Níveis'),
      ];
    } catch (err) {
      console.error('[admin/refreshStats] failed', err);
      statsRow.children = [
        new Text('Erro ao carregar estatísticas.', { type: 'p' }),
      ];
    }
  }

  // -- import result display --

  function showResult(result) {
    const children = [
      new Container([
        buildKpi(String(result.success), 'Importados'),
        buildKpi(String(result.failed), 'Falharam', result.failed > 0),
      ], { class: 'pace-kpi-row' }),
    ];

    if (result.errors && result.errors.length > 0) {
      children.push(
        new Text(`${result.errors.length} ${result.success === 0 && result.failed === 0 ? 'erro(s)' : 'aviso(s)'}:`, { type: 'p' }),
        ...result.errors.slice(0, 10).map(msg => new Text(`- ${msg}`, { type: 'p' })),
        ...(result.errors.length > 10
          ? [new Text(`... e mais ${result.errors.length - 10} erros.`, { type: 'p' })]
          : [])
      );
    }

    resultSection.children = [new Container(children, { class: 'admin-result-card' })];
  }

  // -- file selection handler --

  async function handleSelectFile() {
    try {
      const file = await openFileDialog('.csv,.xlsx');
      if (!file) return;
      selectedFile = file;
      showFileSelectedState();
    } catch (err) {
      console.error('[admin/handleSelectFile] failed', err);
      Toast.error('Erro ao ler o ficheiro.');
    }
  }

  // -- UI state transitions --

  function showReadyState() {
    uploadSection.children = [selectFileButton];
  }

  function showFileSelectedState() {
    const importButton = new Button('Importar Hierarquia', {
      onClickHandler: () => showConfirmDialog(importButton),
    });

    const cancelButton = new Button('Cancelar', {
      variant: 'secondary',
      onClickHandler: () => {
        selectedFile = null;
        showReadyState();
      },
    });

    const fileInfo = new Text(
      `${selectedFile.name} (${formatFileSize(selectedFile.size)})`,
      { type: 'p' }
    );

    uploadSection.children = [fileInfo, importButton, cancelButton];
  }

  // -- confirmation dialog --

  function showConfirmDialog(importButton) {
    const cancelDialogBtn = new Button('Cancelar', {
      variant: 'secondary',
      onClickHandler: () => { confirmDialog.close(); confirmDialog.remove(); },
    });

    const confirmDialogBtn = new Button('Confirmar Importação', {
      variant: 'danger',
      onClickHandler: () => {
        confirmDialog.close();
        confirmDialog.remove();
        runImport(importButton);
      },
    });

    const confirmDialog = new Dialog({
      title: 'Confirmar Importação',
      class: 'pt-v2',
      content: new Text(
        'Esta acção irá substituir TODOS os dados da hierarquia organizacional. Esta operação não pode ser revertida. Tem a certeza?',
        { type: 'p' }
      ),
      footer: [cancelDialogBtn, confirmDialogBtn],
      variant: 'warning',
      closeOnFocusLoss: false,
      containerSelector: 'body',
    });

    confirmDialog.render();
    confirmDialog.open();
  }

  // -- import execution --

  async function runImport(importButton) {
    importButton.isLoading = true;
    progressCurrent = 0;
    progressTotal = 0;

    resultSection.children = [];
    uploadSection.children = [progressText];

    const loading = Toast.loading('A importar hierarquia...');

    try {
      const result = await importFromCSV(selectedFile.content, (current, total) => {
        progressCurrent = current;
        progressTotal = total;
        progressText._refresh();
      });

      loading.success(
        `Importação concluída: ${result.success} colaboradores importados.`
      );

      invalidateCache();
      showResult(result);
      await refreshStats();
    } catch (err) {
      console.error('[admin/runImport] failed', err);
      loading.error('Erro ao importar hierarquia.');
      resultSection.children = [
        new Container(
          [new Text(`Erro: ${err.message || 'Falha desconhecida'}`, { type: 'p' })],
          { class: 'admin-result-card admin-result-card--error' }
        ),
      ];
    } finally {
      importButton.isLoading = false;
      selectedFile = null;
      showReadyState();
    }
  }

  // -- Tab views (declared early so loading functions can reference them) --

  const importView = new View(
    [ctaBanner, statsRow, uploadSection, resultSection],
    { showOnRender: true }
  );

  const dadosView = new View([], { showOnRender: true });

  const hierarquiaView = new View([], { showOnRender: true });

  const configView = new View([], { showOnRender: true });

  const exportarView = new View([], { showOnRender: true });

  // -- Tab 2: Dados (Employee Table) --

  const rowKeyToTitle = new Map();
  const rowKey = (row) => row.join('␟');

  const dadosList = new List({
    headers: ['Nome', 'Perfil', 'Categoria', 'Direção', 'Departamento', 'OU', 'Manager ID'],
    data: [],
    emptyListMessage: 'Sem dados. Importe um ficheiro CSV no separador Importar.',
    onItemSelectHandler: (rowData) => {
      const title = rowKeyToTitle.get(rowKey(rowData));
      if (title) showRoleDialog(title);
    },
  });

  let allEmployeeRows = [];
  const dadosCountText = new Text('', { type: 'p', class: 'pace-filter-count' });

  const searchField = new FormField('');
  const searchInput = new TextInput(searchField, { placeholder: 'Pesquisar por nome...' });

  const perfilField = new FormField(null);
  const perfilCombo = new ComboBox(perfilField, [], { placeholder: 'Perfil', allowFiltering: false });

  const catField = new FormField(null);
  const catCombo = new ComboBox(catField, [], { placeholder: 'Categoria', allowFiltering: true });

  const direcaoField = new FormField(null);
  const direcaoCombo = new ComboBox(direcaoField, [], { placeholder: 'Direção', allowFiltering: true });

  const departamentoField = new FormField(null);
  const departamentoCombo = new ComboBox(departamentoField, [], { placeholder: 'Departamento', allowFiltering: true });

  const ouField = new FormField(null);
  const ouCombo = new ComboBox(ouField, [], { placeholder: 'OU', allowFiltering: true });

  const filtersRow = new Container(
    [searchInput, perfilCombo, catCombo, direcaoCombo, departamentoCombo, ouCombo],
    { class: 'admin-filters-row' }
  );

  function employeeToRow(emp) {
    const role = deriveRoles(emp, allEmployeeRows)[0];
    const isOverride = emp.AppRole && emp.AppRole !== '';
    return [
      emp.ShortName,
      isOverride ? `${role} (manual)` : role,
      emp.Category,
      emp.Direcao || '',
      emp.Departamento || '',
      emp.OUID ? `${emp.OUID} — ${emp.OUDesc || ''}` : '',
      emp.ManagerId || '(raiz)',
    ];
  }

  function buildFilterOptions(values) {
    const unique = [...new Set(values.filter(Boolean))].sort();
    return [{ label: 'Todos', value: '' }, ...unique.map(v => ({ label: v, value: v }))];
  }

  function populateFilterOptions(employees) {
    perfilCombo.dataset = buildFilterOptions(employees.map(e => deriveRoles(e, employees)[0]));
    catCombo.dataset = buildFilterOptions(employees.map(e => e.Category));
    direcaoCombo.dataset = buildFilterOptions(employees.map(e => e.Direcao));
    departamentoCombo.dataset = buildFilterOptions(employees.map(e => e.Departamento));
    const ouMap = new Map();
    for (const e of employees) {
      if (e.OUID && !ouMap.has(e.OUID)) ouMap.set(e.OUID, e.OUDesc || '');
    }
    const ouOptions = [...ouMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, desc]) => ({ label: desc ? `${id} — ${desc}` : id, value: id }));
    ouCombo.dataset = [{ label: 'Todos', value: '' }, ...ouOptions];
  }

  function applyDadosFilter() {
    const query = searchField.value.toLowerCase().trim();
    const perfilVal = perfilField.value ? perfilField.value.value : '';
    const catVal = catField.value ? catField.value.value : '';
    const direcaoVal = direcaoField.value ? direcaoField.value.value : '';
    const departamentoVal = departamentoField.value ? departamentoField.value.value : '';
    const ouVal = ouField.value ? ouField.value.value : '';

    let filtered = allEmployeeRows;

    if (query) {
      filtered = filtered.filter(emp => (emp.ShortName || '').toLowerCase().includes(query));
    }
    if (perfilVal) filtered = filtered.filter(emp => deriveRoles(emp, allEmployeeRows)[0] === perfilVal);
    if (catVal) filtered = filtered.filter(emp => emp.Category === catVal);
    if (direcaoVal) filtered = filtered.filter(emp => emp.Direcao === direcaoVal);
    if (departamentoVal) filtered = filtered.filter(emp => emp.Departamento === departamentoVal);
    if (ouVal) filtered = filtered.filter(emp => emp.OUID === ouVal);

    const rows = filtered.map(employeeToRow);
    rowKeyToTitle.clear();
    filtered.forEach((emp, i) => rowKeyToTitle.set(rowKey(rows[i]), emp.Title));
    dadosList.data = rows;
    dadosCountText.children = [filtered.length === allEmployeeRows.length
      ? `${allEmployeeRows.length} colaboradores`
      : `${filtered.length} de ${allEmployeeRows.length} colaboradores`];
  }

  searchField.subscribe(applyDadosFilter);
  perfilField.subscribe(applyDadosFilter);
  catField.subscribe(applyDadosFilter);
  direcaoField.subscribe(applyDadosFilter);
  departamentoField.subscribe(applyDadosFilter);
  ouField.subscribe(applyDadosFilter);

  function showRoleDialog(employeeId) {
    const emp = allEmployeeRows.find(e => e.Title === employeeId);
    if (!emp) return;

    const currentRole = deriveRoles(emp)[0];
    const currentAppRole = emp.AppRole || '';

    const roleField = new FormField({
      value: APP_ROLE_OPTIONS.find(o => o.value === currentAppRole) || APP_ROLE_OPTIONS[0],
    });
    const roleCombo = new ComboBox(roleField, APP_ROLE_OPTIONS, {
      placeholder: 'Seleccionar perfil...',
      allowFiltering: false,
    });

    const cancelBtn = new Button('Cancelar', {
      variant: 'secondary',
      onClickHandler: () => { roleDialog.close(); roleDialog.remove(); },
    });

    const saveBtn = new Button('Guardar', {
      onClickHandler: async () => {
        const selected = roleField.value;
        const newAppRole = selected ? selected.value : '';

        if (newAppRole === currentAppRole) {
          roleDialog.close();
          roleDialog.remove();
          return;
        }

        saveBtn.isLoading = true;
        const loading = Toast.loading('A actualizar perfil...');
        try {
          await updateEmployeeRole(employeeId, newAppRole);
          roleDialog.close();
          roleDialog.remove();

          const currentUser = ContextStore.get('currentUser');
          const isSelf = currentUser && emp.Email === currentUser.get('email');
          if (isSelf) {
            loading.success('Perfil actualizado. A recarregar...');
            setTimeout(() => location.reload(), 1500);
          } else {
            loading.success('Perfil actualizado com sucesso.');
            invalidateCache();
            await loadDadosTab();
          }
        } catch (err) {
          console.error('[admin/updateEmployeeRole] failed', err);
          loading.error('Erro ao actualizar perfil.');
        } finally {
          saveBtn.isLoading = false;
        }
      },
    });

    const roleDialog = new Dialog({
      title: 'Alterar Perfil',
      class: 'pace-dialog--overflow-visible pt-v2',
      content: new Container([
        new Text(`${emp.ShortName}`, { type: 'p' }),
        new Text(`Perfil actual: ${currentRole}${currentAppRole ? ' (manual)' : ''}`, { type: 'p' }),
        roleCombo,
      ], { class: 'admin-role-dialog__content' }),
      footer: [cancelBtn, saveBtn],
      variant: 'default',
      closeOnFocusLoss: true,
      containerSelector: 'body',
    });

    roleDialog.render();
    roleDialog.open();
  }

  async function loadDadosTab() {
    if (dadosLoaded && !cacheStale) return;
    dadosView.children = [new Loader([], {})];
    try {
      allEmployeeRows = await getEmployees();
      searchField.value = '';
      perfilField.value = null;
      catField.value = null;
      direcaoField.value = null;
      departamentoField.value = null;
      ouField.value = null;
      populateFilterOptions(allEmployeeRows);
      applyDadosFilter();
      dadosView.children = [filtersRow, dadosCountText, dadosList];
      dadosLoaded = true;
    } catch (err) {
      console.error('[admin/loadDadosTab] failed', err);
      dadosView.children = [new Text('Erro ao carregar dados.', { type: 'p' })];
    }
  }

  // -- Tab 3: Hierarquia (Org Tree with AccordionItems) --

  function buildChildrenMap(employees) {
    const map = new Map();
    for (const emp of employees) {
      const key = emp.ManagerId || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(emp);
    }
    return map;
  }

  function buildTreeNode(emp, childrenMap) {
    const reports = childrenMap.get(emp.Title) || [];
    const name = emp.ShortName;
    const role = deriveRoles(emp)[0];
    const ou = emp.OUID ? `${emp.OUID} — ${emp.OUDesc || ''}` : '';

    if (reports.length === 0) {
      return new Container([
        new Text(`${name} -- ${role} -- ${ou}`, { type: 'span', class: 'admin-tree-name' }),
      ], { class: 'admin-tree-leaf' });
    }

    const childNodes = reports.map(r => buildTreeNode(r, childrenMap));
    return new AccordionItem(
      `${name} -- ${role} -- ${ou} [${reports.length}]`,
      new Container(childNodes, { class: 'admin-tree-children' }),
      { isInitialOpen: parseInt(emp.Depth, 10) < 2 }
    );
  }

  async function loadHierarquiaTab() {
    if (hierarquiaLoaded && !cacheStale) return;
    hierarquiaView.children = [new Loader([], {})];
    try {
      const employees = await getEmployees();
      if (employees.length === 0) {
        hierarquiaView.children = [
          new Text('Sem dados. Importe um ficheiro CSV no separador Importar.', {
            type: 'p',
            class: 'pace-empty',
          }),
        ];
        hierarquiaLoaded = true;
        return;
      }
      const childrenMap = buildChildrenMap(employees);
      const root = employees.find(e => !e.ManagerId);
      if (!root) {
        hierarquiaView.children = [
          new Text('Raiz da hierarquia não encontrada.', { type: 'p' }),
        ];
        return;
      }
      const ouCount = new Set(employees.map(e => e.OUID).filter(Boolean)).size;
      hierarquiaView.children = [
        new Text(`${employees.length} colaboradores em ${ouCount} OUs`, {
          type: 'p',
          class: 'pace-filter-count',
        }),
        buildTreeNode(root, childrenMap),
      ];
      hierarquiaLoaded = true;
    } catch (err) {
      console.error('[admin/loadHierarquiaTab] failed', err);
      hierarquiaView.children = [
        new Text('Erro ao carregar hierarquia.', { type: 'p' }),
      ];
    }
  }

  // -- Tab 4: Configurações (Savings Targets + Mentor Teams) --

  let configLoaded = false;
  let configTargets = [];
  let mentorTeamsData = [];

  /**
   * Formats a number as a compact Euro string (e.g. 80000 -> "€ 80.0k").
   */
  function formatEuro(value) {
    const num = parseFloat(value) || 0;
    if (num >= 1000) return '€ ' + (num / 1000).toFixed(1) + 'k';
    return '€ ' + num.toLocaleString('pt-PT');
  }

  /**
   * Builds the targets list rows from the cached configTargets array.
   */
  function buildTargetsListData() {
    return configTargets.map((t) => {
      const { hardTotal, softTotal, total } = computeTargetTotals(t.CategoryTargets);
      return [
        t.Title,
        String(t.FTETarget),
        formatEuro(hardTotal),
        formatEuro(softTotal),
        formatEuro(total),
      ];
    });
  }

  const targetsList = new List({
    headers: ['Ano', 'FTE', 'Hard (€)', 'Soft (€)', 'Total (€)'],
    data: [],
    emptyListMessage: 'Nenhum objectivo definido. Clique em "Adicionar Ano" para começar.',
    onItemSelectHandler: (rowData) => {
      const year = rowData[0];
      const target = configTargets.find((t) => t.Title === year);
      if (target) showTargetDialog(target);
    },
  });

  const mentorTeamsList = new List({
    headers: ['Mentor', 'Equipas'],
    data: [],
    emptyListMessage: 'Nenhum mentor configurado. Clique em "Adicionar Mentor" para começar.',
    onItemSelectHandler: (rowData) => {
      const mentorEmail = rowData[0];
      const record = mentorTeamsData.find((r) => r.MentorEmail === mentorEmail);
      if (record) showMentorTeamsDialog(record);
    },
  });

  async function refreshConfigList() {
    try {
      configTargets = await getAllTargets();
      targetsList.data = buildTargetsListData();
    } catch (err) {
      console.error('[admin/refreshConfigList] failed', err);
      Toast.error('Erro ao carregar objectivos de poupança.');
    }
  }

  async function refreshMentorTeamsList() {
    try {
      mentorTeamsData = await getAllMentorTeams();
      mentorTeamsList.data = mentorTeamsData.map((r) => [
        r.MentorEmail,
        Array.isArray(r.Teams) && r.Teams.length > 0 ? r.Teams.join(', ') : '(nenhuma)',
      ]);
    } catch (err) {
      console.error('[admin/refreshMentorTeamsList] failed', err);
      Toast.error('Erro ao carregar configuração de mentores.');
    }
  }

  async function loadConfigTab() {
    if (configLoaded) return;
    configView.children = [new Loader([], {})];
    try {
      await Promise.all([refreshConfigList(), refreshMentorTeamsList()]);

      const configCtaBanner = new Container(
        [
          new Container(
            [
              new Text('Objectivos Anuais de Poupança', {
                type: 'span',
                class: 'pace-cta-text',
              }),
              new Text(
                'Defina as metas anuais de poupança esperadas por categoria financeira e por FTE. Um registo por ano.',
                { type: 'p', class: 'pace-cta-text' }
              ),
            ],
            { as: 'div' }
          ),
        ],
        { class: 'pace-cta' }
      );

      const addBtn = new Button('Adicionar Ano', {
        class: 'admin-section-add-btn',
        onClickHandler: () => showTargetDialog(null),
      });

      const mentorCtaBanner = new Container(
        [
          new Container(
            [
              new Text('Mentores por Equipa', {
                type: 'span',
                class: 'pace-cta-text',
              }),
              new Text(
                'Iniciativas submetidas por equipas com mentor atribuído são encaminhadas automaticamente para esse mentor. Equipas sem mentor seguem o fluxo partilhado normal.',
                { type: 'p', class: 'pace-cta-text' }
              ),
            ],
            { as: 'div' }
          ),
        ],
        { class: 'pace-cta' }
      );

      const mentorAddBtn = new Button('Adicionar Mentor', {
        class: 'admin-section-add-btn',
        onClickHandler: () => showMentorTeamsDialog(null),
      });

      configView.children = [
        configCtaBanner, addBtn, targetsList,
        mentorCtaBanner, mentorAddBtn, mentorTeamsList,
      ];
      configLoaded = true;
    } catch (err) {
      console.error('[admin/loadConfigTab] failed', err);
      configView.children = [new Text('Erro ao carregar configurações.', { type: 'p' })];
    }
  }

  /**
   * Builds a live-updating totals summary container.
   * Returns { summaryContainer, refreshSummary }.
   */
  function buildTotalsSummary(categoryFields) {
    const hardText = new Text('€ 0', { type: 'span', class: 'pace-kpi-value' });
    const softText = new Text('€ 0', { type: 'span', class: 'pace-kpi-value' });
    const totalText = new Text('€ 0', { type: 'span', class: 'pace-kpi-value' });

    const summaryContainer = new Container(
      [
        new Container(
          [hardText, new Text('Hard Cost', { type: 'span', class: 'pace-kpi-label' })],
          { class: 'pace-kpi' }
        ),
        new Container(
          [softText, new Text('Soft Cost', { type: 'span', class: 'pace-kpi-label' })],
          { class: 'pace-kpi' }
        ),
        new Container(
          [totalText, new Text('Total', { type: 'span', class: 'pace-kpi-label' })],
          { class: 'pace-kpi' }
        ),
      ],
      { class: 'pace-kpi-row' }
    );

    function refreshSummary() {
      const snapshot = {};
      for (const [cat, field] of Object.entries(categoryFields)) {
        snapshot[cat] = parseFloat(field.value) || 0;
      }
      const { hardTotal, softTotal, total } = computeTargetTotals(snapshot);
      hardText.children = [formatEuro(hardTotal)];
      softText.children = [formatEuro(softTotal)];
      totalText.children = [formatEuro(total)];
    }

    return { summaryContainer, refreshSummary };
  }

  /**
   * Opens the create/edit dialog for a savings target.
   * @param {object|null} target - Existing target for edit, or null for create.
   */
  function showTargetDialog(target) {
    const isEdit = target !== null;

    // -- Year field --
    const yearField = new FormField(isEdit ? parseFloat(target.Title) : null);
    const yearInput = new NumberInput(yearField, {
      placeholder: 'Ex: 2027',
      min: 2020,
      max: 2100,
      step: 1,
    });
    const yearLabel = new FieldLabel('Ano', yearInput, { position: 'top' });

    // -- FTE field --
    const fteField = new FormField(isEdit ? target.FTETarget : 0);
    const fteInput = new NumberInput(fteField, {
      placeholder: 'Número de FTE',
      min: 0,
      step: 0.1,
    });
    const fteLabel = new FieldLabel('Objectivo FTE', fteInput, { position: 'top' });

    // -- Category fields (one per financial category) --
    const categoryFields = {};
    const categoryFieldLabels = [];
    for (const cat of FINANCIAL_CATEGORIES) {
      const existingVal = isEdit && target.CategoryTargets ? (parseFloat(target.CategoryTargets[cat]) || 0) : 0;
      const field = new FormField(existingVal);
      categoryFields[cat] = field;
      const type = getCategoryType(cat);
      const input = new NumberInput(field, { placeholder: '0', min: 0, step: 100 });
      const label = new FieldLabel(`${cat} (${type})`, input, { position: 'top' });
      categoryFieldLabels.push(label);
    }

    // -- Live totals summary --
    const { summaryContainer, refreshSummary } = buildTotalsSummary(categoryFields);
    refreshSummary();

    // Subscribe all category fields to update the summary on change
    const unsubscribers = Object.values(categoryFields).map((f) =>
      f.subscribe(refreshSummary)
    );

    // -- Dialog buttons --
    const cancelBtn = new Button('Cancelar', {
      variant: 'secondary',
      onClickHandler: () => {
        unsubscribers.forEach((u) => u());
        dialog.close();
        dialog.remove();
      },
    });

    const saveBtn = new Button(isEdit ? 'Guardar' : 'Adicionar', {
      onClickHandler: async () => {
        const year = yearField.value;
        const fte = parseFloat(fteField.value) || 0;

        if (!year || isNaN(year) || year < 2020 || year > 2100) {
          Toast.error('Introduza um ano válido (ex: 2026).');
          return;
        }

        const catTargets = {};
        for (const [cat, field] of Object.entries(categoryFields)) {
          catTargets[cat] = parseFloat(field.value) || 0;
        }

        saveBtn.isLoading = true;
        const loading = Toast.loading(isEdit ? 'A guardar objectivo...' : 'A criar objectivo...');

        try {
          if (isEdit) {
            // Re-fetch the item to get the current etag before updating
            const fresh = await getTargetByYear(target.Title);
            if (!fresh) throw new SystemError('NotFound', `Objectivo para ${target.Title} não encontrado.`, { breaksFlow: false });
            await updateTarget(fresh.Id, { fteTarget: fte, categoryTargets: catTargets }, fresh['odata.etag']);
            loading.success('Objectivo actualizado com sucesso.');
          } else {
            await createTarget({ year, fteTarget: fte, categoryTargets: catTargets });
            loading.success('Objectivo criado com sucesso.');
          }
          unsubscribers.forEach((u) => u());
          dialog.close();
          dialog.remove();
          configLoaded = false;
          await refreshConfigList();
          // Re-mark as loaded so the tab doesn't re-fetch on switch back (already refreshed)
          configLoaded = true;
        } catch (err) {
          console.error('[admin/saveTarget] failed', err);
          loading.error(err.message || 'Erro ao guardar objectivo.');
        } finally {
          saveBtn.isLoading = false;
        }
      },
    });

    const footerButtons = [cancelBtn];

    // Delete button only in edit mode
    if (isEdit) {
      const deleteBtn = new Button('Eliminar', {
        variant: 'danger',
        onClickHandler: () => {
          showDeleteConfirmDialog(target, dialog, unsubscribers);
        },
      });
      footerButtons.push(deleteBtn);
    }

    footerButtons.push(saveBtn);

    const dialogContent = new Container(
      [
        ...(isEdit ? [] : [yearLabel]),
        fteLabel,
        new Text('Metas por Categoria (€)', { type: 'p', class: 'pace-cta-text' }),
        ...categoryFieldLabels,
        new Text('Resumo Derivado', { type: 'p', class: 'pace-filter-count' }),
        summaryContainer,
      ],
      { class: 'admin-target-dialog__content' }
    );

    const dialogTitle = isEdit
      ? `Editar Objectivo — ${target.Title}`
      : 'Novo Objectivo Anual';

    const dialog = new Dialog({
      title: dialogTitle,
      class: 'pt-v2',
      content: dialogContent,
      footer: footerButtons,
      variant: 'default',
      closeOnFocusLoss: false,
      containerSelector: 'body',
    });

    dialog.render();
    dialog.open();
  }

  /**
   * Opens the create/edit dialog for a mentor-team assignment.
   * Teams are managed as a list (one row per team with a Remove button) rather than
   * a multi-select combo, mirroring the "Gerir Acesso" UX in workflow-actions.js.
   * @param {object|null} record - Existing MentorTeams record for edit, or null for create.
   */
  async function showMentorTeamsDialog(record) {
    const isEdit = record !== null;

    // Pre-load mentor users and team options before building the dialog
    let mentorOptions = [];
    let allTeamOptions = [];
    try {
      const [mentors, teams] = await Promise.all([getMentorUsers(), getTeamOptions()]);
      mentorOptions = mentors.map((m) => ({ label: m.displayName, value: m.email }));
      allTeamOptions = teams;
    } catch (err) {
      console.error('[admin/showMentorTeamsDialog] failed to load options', err);
      Toast.error('Erro ao carregar dados. Tente novamente.');
      return;
    }

    // -- Mentor selector (single; disabled/prefilled in edit mode) --
    const initialMentorOption = isEdit
      ? (mentorOptions.find((o) => o.value === record.MentorEmail) || { label: record.MentorEmail, value: record.MentorEmail })
      : null;
    const mentorField = new FormField({ value: initialMentorOption });
    const mentorCombo = new ComboBox(mentorField, mentorOptions, {
      placeholder: 'Seleccionar mentor...',
      allowFiltering: true,
      isDisabled: isEdit,
    });
    const mentorLabel = new FieldLabel('Mentor', mentorCombo, { position: 'top' });

    // -- Teams list: one row per assigned team, with Remove control --
    // assignedTeams is the live array of ouid strings (source of truth on save).
    const assignedTeams = isEdit && Array.isArray(record.Teams)
      ? record.Teams.slice()
      : [];

    // Container that holds the team rows (rebuilt on every add/remove).
    const teamsListContainer = new Container([], { class: 'admin-mentor-teams-list' });

    /**
     * Builds the options available for the add-team ComboBox:
     * all teams minus those already in assignedTeams.
     * Returns FRESH clones -- allTeamOptions comes from getTeamOptions()'s
     * module-level cache, and ComboBox mutates `.checked` on its dataset objects.
     * Passing shared objects lets a stale `.checked` flag survive across dialog
     * sessions and dataset reassignments, which (a) pre-selects a team on open and
     * (b) resurrects a just-removed team via the `set dataset` preChecked re-select.
     */
    function getAvailableTeamOptions() {
      return allTeamOptions
        .filter((o) => !assignedTeams.includes(o.value))
        .map((o) => ({ label: o.label, value: o.value }));
    }

    // Single-select ComboBox for adding one team at a time.
    // Initialized with available options right away (avoids a dataset setter call before render).
    const addTeamField = new FormField({ value: null });
    const addTeamCombo = new ComboBox(addTeamField, getAvailableTeamOptions(), {
      placeholder: 'Adicionar equipa...',
      allowFiltering: true,
    });
    const addTeamLabel = new FieldLabel('Adicionar Equipa', addTeamCombo, { position: 'top' });

    /**
     * Builds a single assigned-team row: label chip + Remove button.
     * Mirrors buildAccessRow from workflow-actions.js.
     * @param {string} ouid
     * @returns {Container}
     */
    function buildTeamRow(ouid) {
      const option = allTeamOptions.find((o) => o.value === ouid);
      const displayLabel = option ? option.label : ouid;

      const removeBtn = new Button('Remover', {
        variant: 'danger',
        isOutlined: true,
        onClickHandler: () => {
          const idx = assignedTeams.indexOf(ouid);
          if (idx >= 0) assignedTeams.splice(idx, 1);
          rebuildTeamsList();
          // Refresh available options in the add ComboBox after removal.
          addTeamCombo.dataset = getAvailableTeamOptions();
        },
      });

      return new Container(
        [
          new Container(
            [new Text(displayLabel, { type: 'span', class: 'pace-access-name' })],
            { class: 'pace-access-row-info' }
          ),
          removeBtn,
        ],
        { class: 'pace-access-row' }
      );
    }

    /**
     * Rebuilds the teams list container from the current assignedTeams array.
     */
    function rebuildTeamsList() {
      if (assignedTeams.length === 0) {
        teamsListContainer.children = [
          new Text('Nenhuma equipa atribuída.', { type: 'p', class: 'pace-empty-hint' }),
        ];
        return;
      }
      teamsListContainer.children = assignedTeams.map(buildTeamRow);
    }

    // Initial render of teams list.
    rebuildTeamsList();

    // When user picks a team in the add-combo, append it and reset the combo.
    addTeamField.subscribe((val) => {
      if (!val) return;
      const ouid = extractComboBoxValue(val);
      if (typeof ouid !== 'string' || !ouid) return;
      if (!assignedTeams.includes(ouid)) {
        assignedTeams.push(ouid);
        rebuildTeamsList();
        addTeamCombo.dataset = getAvailableTeamOptions();
      }
      // Reset the combo so the user can pick the next team.
      addTeamField.value = null;
    });

    // -- Dialog buttons --
    const cancelBtn = new Button('Cancelar', {
      variant: 'secondary',
      onClickHandler: () => { dialog.close(); dialog.remove(); },
    });

    const saveBtn = new Button(isEdit ? 'Guardar' : 'Adicionar', {
      onClickHandler: async () => {
        const selectedMentor = mentorField.value;
        const mentorEmail = extractComboBoxValue(selectedMentor) || '';

        if (!mentorEmail) {
          Toast.error('Seleccione um mentor.');
          return;
        }

        // Empty team list is allowed -- a mentor with no teams simply routes nothing
        // until teams are re-added. Full removal is done via the Eliminar button.

        // Uniqueness enforcement: check if any requested team is held by a different mentor.
        let conflicts = [];
        try {
          conflicts = await findTeamConflicts(assignedTeams, isEdit ? record.MentorEmail : undefined);
        } catch (err) {
          console.error('[admin/showMentorTeamsDialog] findTeamConflicts failed', err);
          Toast.error('Erro ao verificar conflitos. Tente novamente.');
          return;
        }

        if (conflicts.length > 0) {
          const details = conflicts.map((c) => `${c.ouid} (${c.mentorName})`).join(', ');
          Toast.error(`Equipas já atribuídas a outro mentor: ${details}`);
          return;
        }

        saveBtn.isLoading = true;
        const loading = Toast.loading(isEdit ? 'A guardar configuração...' : 'A criar configuração...');

        try {
          if (isEdit) {
            // Re-fetch to get fresh etag before update.
            const fresh = await getMentorTeamsByEmail(record.MentorEmail);
            if (!fresh) throw new SystemError('NotFound', `Configuração para ${record.MentorEmail} não encontrada.`, { breaksFlow: false });
            await updateMentorTeams(fresh.Id, { teams: assignedTeams }, fresh['odata.etag']);
            loading.success('Configuração actualizada com sucesso.');
          } else {
            const mentorDisplayName = (selectedMentor && typeof selectedMentor === 'object' ? selectedMentor.label : null) || mentorEmail;
            await createMentorTeams({ mentor: { email: mentorEmail, displayName: mentorDisplayName }, teams: assignedTeams });
            loading.success('Configuração criada com sucesso.');
          }

          dialog.close();
          dialog.remove();
          await refreshMentorTeamsList();
        } catch (err) {
          console.error('[admin/saveMentorTeams] failed', err);
          loading.error(err.message || 'Erro ao guardar configuração.');
        } finally {
          saveBtn.isLoading = false;
        }
      },
    });

    const footerButtons = [cancelBtn];

    if (isEdit) {
      const deleteBtn = new Button('Eliminar', {
        variant: 'danger',
        onClickHandler: () => { showDeleteMentorConfirmDialog(record, dialog); },
      });
      footerButtons.push(deleteBtn);
    }

    footerButtons.push(saveBtn);

    const dialogTitle = isEdit
      ? `Editar Mentor — ${record.MentorEmail}`
      : 'Novo Mentor por Equipa';

    const dialog = new Dialog({
      title: dialogTitle,
      class: 'pace-dialog--overflow-visible pt-v2',
      content: new Container(
        [mentorLabel, teamsListContainer, addTeamLabel],
        { class: 'admin-mentor-dialog__content' }
      ),
      footer: footerButtons,
      variant: 'default',
      closeOnFocusLoss: false,
      containerSelector: 'body',
    });

    dialog.render();
    dialog.open();
  }

  /**
   * Shows a confirm-before-delete dialog for a mentor-teams record.
   */
  function showDeleteMentorConfirmDialog(record, parentDialog) {
    const cancelBtn = new Button('Cancelar', {
      variant: 'secondary',
      onClickHandler: () => { confirmDialog.close(); confirmDialog.remove(); },
    });

    const confirmBtn = new Button('Confirmar Eliminação', {
      variant: 'danger',
      onClickHandler: async () => {
        confirmBtn.isLoading = true;
        const loading = Toast.loading('A eliminar configuração...');
        try {
          const fresh = await getMentorTeamsByEmail(record.MentorEmail);
          if (!fresh) throw new SystemError('NotFound', `Configuração para ${record.MentorEmail} não encontrada.`, { breaksFlow: false });
          await deleteMentorTeams(fresh.Id, fresh['odata.etag']);
          loading.success('Configuração eliminada com sucesso.');
          confirmDialog.close();
          confirmDialog.remove();
          parentDialog.close();
          parentDialog.remove();
          await refreshMentorTeamsList();
        } catch (err) {
          console.error('[admin/deleteMentorTeams] failed', err);
          loading.error(err.message || 'Erro ao eliminar configuração.');
        } finally {
          confirmBtn.isLoading = false;
        }
      },
    });

    const confirmDialog = new Dialog({
      title: 'Confirmar Eliminação',
      class: 'pt-v2',
      content: new Text(
        `Tem a certeza que pretende remover a configuração de equipas do mentor ${record.MentorEmail}? Esta acção não pode ser revertida.`,
        { type: 'p' }
      ),
      footer: [cancelBtn, confirmBtn],
      variant: 'warning',
      closeOnFocusLoss: false,
      containerSelector: 'body',
    });

    confirmDialog.render();
    confirmDialog.open();
  }

  /**
   * Shows a confirm-before-delete dialog.
   */
  function showDeleteConfirmDialog(target, parentDialog, parentUnsubscribers) {
    const cancelBtn = new Button('Cancelar', {
      variant: 'secondary',
      onClickHandler: () => { confirmDialog.close(); confirmDialog.remove(); },
    });

    const confirmBtn = new Button('Confirmar Eliminação', {
      variant: 'danger',
      onClickHandler: async () => {
        confirmBtn.isLoading = true;
        const loading = Toast.loading('A eliminar objectivo...');
        try {
          const fresh = await getTargetByYear(target.Title);
          if (!fresh) throw new SystemError('NotFound', `Objectivo para ${target.Title} não encontrado.`, { breaksFlow: false });
          await deleteTarget(fresh.Id, fresh['odata.etag']);
          loading.success('Objectivo eliminado com sucesso.');
          parentUnsubscribers.forEach((u) => u());
          confirmDialog.close();
          confirmDialog.remove();
          parentDialog.close();
          parentDialog.remove();
          configLoaded = false;
          await refreshConfigList();
          configLoaded = true;
        } catch (err) {
          console.error('[admin/deleteTarget] failed', err);
          loading.error(err.message || 'Erro ao eliminar objectivo.');
        } finally {
          confirmBtn.isLoading = false;
        }
      },
    });

    const confirmDialog = new Dialog({
      title: 'Confirmar Eliminação',
      class: 'pt-v2',
      content: new Text(
        `Tem a certeza que pretende eliminar o objectivo do ano ${target.Title}? Esta acção não pode ser revertida.`,
        { type: 'p' }
      ),
      footer: [cancelBtn, confirmBtn],
      variant: 'warning',
      closeOnFocusLoss: false,
      containerSelector: 'body',
    });

    confirmDialog.render();
    confirmDialog.open();
  }

  // -- Tab 5: Exportação --

  let exportLoaded = false;

  async function loadExportarTab() {
    if (exportLoaded) return;
    exportarView.children = [new Loader([], {})];
    try {
      const allInitiatives = await initiativesApi.getAll();

      const exportCtaBanner = new Container(
        [
          new Container(
            [
              new Text('Exportação de Iniciativas', {
                type: 'span',
                class: 'pace-cta-text',
              }),
              new Text(
                'Exportar todas as iniciativas para um ficheiro CSV (aberto no Excel). Inclui iniciativas confidenciais e todos os dados financeiros.',
                { type: 'p', class: 'pace-cta-text' }
              ),
            ],
            { as: 'div' }
          ),
        ],
        { class: 'pace-cta' }
      );

      const countText = new Text(`${allInitiatives.length} iniciativa(s)`, {
        type: 'p',
        class: 'pace-filter-count',
      });

      const exportBtn = createExportButton({
        getRows: () => allInitiatives,
        filenamePrefix: 'todas-iniciativas',
        label: 'Exportar todas as iniciativas',
        detailed: true,
      });

      exportarView.children = [exportCtaBanner, countText, exportBtn];
      exportLoaded = true;
    } catch (err) {
      console.error('[admin/loadExportarTab] failed', err);
      exportarView.children = [
        new Text('Erro ao carregar iniciativas para exportação.', { type: 'p' }),
      ];
    }
  }

  // -- Tab assembly --

  const tabs = new TabGroup([
    { key: 'importar', label: 'Importar', view: importView },
    { key: 'dados', label: 'Dados', view: dadosView },
    { key: 'hierarquia', label: 'Hierarquia', view: hierarquiaView },
    { key: 'config', label: 'Configurações', view: configView },
    { key: 'exportar', label: 'Exportação', view: exportarView },
  ], {
    selectedTabKey: 'importar',
    onTabChangeHandler: (tabConfig) => {
      if (tabConfig.key === 'dados') loadDadosTab();
      if (tabConfig.key === 'hierarquia') loadHierarquiaTab();
      if (tabConfig.key === 'config') loadConfigTab();
      if (tabConfig.key === 'exportar') loadExportarTab();
    },
  });

  // -- init --

  async function initialize() {
    await refreshStats();
    showReadyState();
  }

  initialize();

  return createPageLayout([tabs], { contentClass: 'pt-v2' });
});
