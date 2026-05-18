import {
  Text,
  Container,
  Button,
  ComboBox,
  FormField,
  Toast,
  defineRoute,
  getIcon,
  __dayjs,
  __lodash,
} from '../../libs/nofbiz/nofbiz.base.js';
import { getTeamOptions } from '../../utils/org-hierarchy-api.js';
import { getAll } from '../../utils/initiatives-api.js';
import {
  STATUS,
  STATUS_LABELS,
  statusLabel,
  chipClass,
} from '../../utils/status-helpers.js';
import {
  parseSaving,
  ownerName,
  getComboVal,
  buildKpi,
  buildTableHeader,
} from '../../utils/format-helpers.js';
import { createPageLayout } from '../../utils/navbar.js';

export default defineRoute((config) => {
  config.setRouteTitle('Dashboard');

  // -- heat map helper --

  function heatClass(n, max) {
    if (!n || !max) return 'pace-heat-0';
    const ratio = n / max;
    if (ratio <= 0) return 'pace-heat-0';
    if (ratio <= 0.15) return 'pace-heat-1';
    if (ratio <= 0.3) return 'pace-heat-2';
    if (ratio <= 0.5) return 'pace-heat-3';
    if (ratio <= 0.75) return 'pace-heat-4';
    return 'pace-heat-5';
  }

  // Status-to-column mapping
  const STATE_COLS = [
    { key: 'total', label: 'Total', status: null },
    { key: 'rasc', label: 'Rascunho', status: STATUS.RASCUNHO },
    { key: 'val', label: 'Validação', status: STATUS.SUBMETIDO },
    { key: 'exec', label: 'Execução', status: STATUS.EM_EXECUCAO },
    { key: 'valSav', label: 'Val. Savings', status: STATUS.POR_VALIDAR },
    { key: 'rev', label: 'Revisão', status: STATUS.EM_REVISAO },
    { key: 'impl', label: 'Implementadas', status: STATUS.IMPLEMENTADO },
    { key: 'cancel', label: 'Canceladas', status: STATUS.CANCELADO },
  ];

  // -- state --

  let allItems = [];
  let teamOptions = [];
  const scopeField = new FormField({ value: 'todas' });
  const periodField = new FormField({ value: '' });
  const teamFilterField = new FormField({ value: '' });
  const statusFilterField = new FormField({ value: '' });

  let expandedTeams = new Set();
  let activeDrill = null;

  // -- layout containers --

  const ctaBanner = new Container([], { class: 'pace-cta' });
  const kpiRow = new Container([], { class: 'pace-kpi-row pace-kpi-row--4' });
  const filterBar = new Container([], { class: 'pace-filters' });
  const metricsTable = new Container([]);
  const drillDetail = new Container([]);

  // -- data loading --

  async function loadData() {
    const loading = Toast.loading('A carregar dashboard...');
    try {
      [allItems, teamOptions] = await Promise.all([getAll(), getTeamOptions()]);
      loading.dismiss();
      buildUI();
    } catch (error) {
      console.error('[dashboard/loadData] failed', error);
      loading.error('Erro ao carregar dados');
    }
  }

  // -- filtering --

  function getFilteredItems() {
    let items = [...allItems];

    // Period filter
    const period = getComboVal(periodField);
    if (period && period !== 'Tudo') {
      const now = __dayjs();
      let cutoff;
      if (period === 'Último mês') cutoff = now.subtract(1, 'month');
      else if (period === 'Últimos 3 meses') cutoff = now.subtract(3, 'month');
      else if (period === 'Últimos 6 meses') cutoff = now.subtract(6, 'month');
      else if (period === 'Último ano') cutoff = now.subtract(1, 'year');
      if (cutoff) {
        items = items.filter(
          (i) => i.SubmittedDate && __dayjs(i.SubmittedDate).isAfter(cutoff)
        );
      }
    }

    // Team filter
    const teamVal = getComboVal(teamFilterField);
    if (teamVal) {
      items = items.filter((i) => i.Team === teamVal);
    }

    // Status filter
    const statusVal = getComboVal(statusFilterField);
    if (statusVal) {
      const matchedStatus = Object.entries(STATUS_LABELS).find(
        ([, label]) => label === statusVal
      );
      if (matchedStatus) {
        items = items.filter((i) => i.Status === matchedStatus[0]);
      }
    }

    return items;
  }

  // -- build UI --

  function buildUI() {
    buildCTA();
    rebuildKPIs();
    buildFilters();
    rebuildMetrics();

    periodField.subscribe(() => { rebuildKPIs(); rebuildMetrics(); });
    teamFilterField.subscribe(() => { rebuildKPIs(); rebuildMetrics(); });
    statusFilterField.subscribe(() => { rebuildKPIs(); rebuildMetrics(); });
  }

  function buildCTA() {
    ctaBanner.children = [
      new Container(
        [
          new Text('Visão Geral das Iniciativas', {
            type: 'span',
            class: 'pace-cta-text',
          }),
          new Text(
            'Acompanhe o progresso das iniciativas PDCA em todas as equipas.',
            { type: 'p', class: 'pace-cta-text' }
          ),
        ],
        { as: 'div' }
      ),
      new Button([
        new Container([getIcon('download-line')], { as: 'span', class: 'pace-btn-icon' }),
        'Exportar Relatório',
      ], {
        variant: 'secondary',
        onClickHandler: () => {
          alert('Exportar Relatório (placeholder)');
        },
      }),
    ];
  }

  function rebuildKPIs() {
    const items = getFilteredItems();
    const emCurso = items.filter(
      (i) =>
        i.Status === STATUS.EM_EXECUCAO ||
        i.Status === STATUS.SUBMETIDO ||
        i.Status === STATUS.POR_VALIDAR ||
        i.Status === STATUS.EM_REVISAO
    );
    const implementados = items.filter((i) => i.Status === STATUS.IMPLEMENTADO);
    const savingsTotal = implementados.reduce(
      (sum, i) => sum + parseSaving(i.SavingValidated),
      0
    );

    kpiRow.children = [
      buildKpi(String(items.length), 'Total Iniciativas'),
      buildKpi(String(emCurso.length), 'Em Curso'),
      buildKpi(String(implementados.length), 'Implementadas'),
      buildKpi(`EUR ${(savingsTotal / 1000).toFixed(1)}k`, 'Savings Acumulados', true),
    ];
  }

  function buildFilters() {
    const scopeBtnTodas = new Button('Todas', {
      variant: scopeField.value === 'todas' ? 'primary' : 'secondary',
      class: scopeField.value === 'todas' ? 'pace-toggle-btn pace-toggle-btn--active' : 'pace-toggle-btn',
      onClickHandler: () => {
        scopeField.value = 'todas';
        rebuildFiltersAndMetrics();
      },
    });
    const scopeBtnEquipa = new Button('Minha Equipa', {
      variant: scopeField.value === 'equipa' ? 'primary' : 'secondary',
      class: scopeField.value === 'equipa' ? 'pace-toggle-btn pace-toggle-btn--active' : 'pace-toggle-btn',
      onClickHandler: () => {
        scopeField.value = 'equipa';
        rebuildFiltersAndMetrics();
      },
    });

    const periodOptions = ['Tudo', 'Último mês', 'Últimos 3 meses', 'Últimos 6 meses', 'Último ano'];
    const periodCombo = new ComboBox(periodField, periodOptions, { placeholder: 'Período...' });

    const teamCombo = new ComboBox(teamFilterField, teamOptions, { placeholder: 'Equipa...' });

    const statusOptions = Object.values(STATUS_LABELS);
    const statusCombo = new ComboBox(statusFilterField, statusOptions, { placeholder: 'Estado...' });

    const clearBtn = new Button('Limpar', {
      variant: 'secondary',
      onClickHandler: () => {
        periodField.value = '';
        teamFilterField.value = '';
        statusFilterField.value = '';
        scopeField.value = 'todas';
        expandedTeams.clear();
        activeDrill = null;
        rebuildFiltersAndMetrics();
      },
    });

    const countText = new Text(
      [() => `${getFilteredItems().length} iniciativas`],
      { type: 'span', class: 'pace-filter-count' }
    );

    filterBar.children = [
      new Container([scopeBtnTodas, scopeBtnEquipa], { class: 'pace-toggle' }),
      periodCombo,
      teamCombo,
      statusCombo,
      clearBtn,
      countText,
    ];
  }

  function rebuildFiltersAndMetrics() {
    buildFilters();
    rebuildKPIs();
    rebuildMetrics();
  }

  // -- metrics table --

  function rebuildMetrics() {
    const items = getFilteredItems();
    const grouped = __lodash.groupBy(items, 'Team');

    const teamData = teamOptions.map(({ value: team }) => {
      const teamItems = grouped[team] || [];
      const row = { team, items: teamItems };
      STATE_COLS.forEach((col) => {
        row[col.key] = col.status === null
          ? teamItems.length
          : teamItems.filter((i) => i.Status === col.status).length;
      });
      return row;
    });

    // Max value for heat map (excluding 'total' column)
    let maxVal = 0;
    teamData.forEach((row) => {
      STATE_COLS.forEach((col) => {
        if (col.key !== 'total' && row[col.key] > maxVal) {
          maxVal = row[col.key];
        }
      });
    });

    // Header row
    const headerRow = new Container(
      [
        new Text('Equipa', { type: 'span', class: 'pace-table-th pace-metric-team-th' }),
        ...STATE_COLS.map(
          (col) => new Text(col.label, { type: 'span', class: 'pace-table-th pace-metric-th' })
        ),
      ],
      { class: 'pace-table-row pace-table-row--header' }
    );

    // Team rows with optional drill-down
    const teamRows = [];
    teamData.forEach((row) => {
      teamRows.push(buildTeamRow(row, maxVal));
      if (expandedTeams.has(row.team)) {
        teamRows.push(...buildCollabDrillDown(row));
      }
    });

    // Totals row
    const totals = {};
    STATE_COLS.forEach((col) => {
      totals[col.key] = teamData.reduce((sum, row) => sum + row[col.key], 0);
    });
    const totalsRow = new Container(
      [
        new Text('Total', { type: 'span', class: 'pace-metric-team pace-totals-label' }),
        ...STATE_COLS.map(
          (col) => new Text(String(totals[col.key]), { type: 'span', class: 'pace-metric-val pace-totals-cell' })
        ),
      ],
      { class: 'pace-table-row pace-totals-row' }
    );

    metricsTable.children = [
      new Text('Métricas por Equipa', { type: 'h2', class: 'pace-sec-title' }),
      new Container([headerRow, ...teamRows, totalsRow], {
        class: 'pace-table-wrap pace-dashboard-table',
      }),
    ];

    // Drill detail
    if (activeDrill) {
      buildDrillDetail();
    } else {
      drillDetail.children = [];
    }
  }

  function buildTeamRow(row, maxVal) {
    const teamBtn = new Button(row.team, {
      variant: 'secondary',
      isOutlined: true,
      class: 'pace-metric-team-btn',
      onClickHandler: () => {
        if (expandedTeams.has(row.team)) {
          expandedTeams.delete(row.team);
        } else {
          expandedTeams.add(row.team);
        }
        activeDrill = null;
        rebuildMetrics();
      },
    });

    const cells = STATE_COLS.map((col) => {
      const n = row[col.key];
      const heat = col.key === 'total' ? '' : heatClass(n, maxVal);

      if (n > 0) {
        return new Button(String(n), {
          variant: 'secondary',
          isOutlined: true,
          class: `pace-metric-val pace-metric-val--clickable ${heat}`,
          onClickHandler: () => {
            activeDrill = { team: row.team, colab: null, stateKey: col.key };
            rebuildMetrics();
          },
        });
      }
      return new Text(String(n), {
        type: 'span',
        class: `pace-metric-val ${heat}`,
      });
    });

    return new Container([teamBtn, ...cells], {
      class: `pace-table-row pace-team-row${expandedTeams.has(row.team) ? ' pace-team-row--expanded' : ''}`,
    });
  }

  function buildCollabDrillDown(teamRow) {
    const byOwner = __lodash.groupBy(teamRow.items, (i) => ownerName(i));
    return Object.entries(byOwner).map(([name, items]) => {
      const localMax = Math.max(
        ...STATE_COLS.filter((c) => c.key !== 'total').map((col) =>
          col.status === null
            ? items.length
            : items.filter((i) => i.Status === col.status).length
        ),
        1
      );

      const cells = STATE_COLS.map((col) => {
        const n = col.status === null
          ? items.length
          : items.filter((i) => i.Status === col.status).length;
        const heat = col.key === 'total' ? '' : heatClass(n, localMax);

        if (n > 0) {
          return new Button(String(n), {
            variant: 'secondary',
            isOutlined: true,
            class: `pace-metric-val pace-metric-val--clickable ${heat}`,
            onClickHandler: () => {
              activeDrill = { team: teamRow.team, colab: name, stateKey: col.key };
              rebuildMetrics();
            },
          });
        }
        return new Text(String(n), {
          type: 'span',
          class: `pace-metric-val ${heat}`,
        });
      });

      return new Container(
        [new Text(name, { type: 'span', class: 'pace-drill-team' }), ...cells],
        { class: 'pace-table-row pace-drill-row' }
      );
    });
  }

  function buildDrillDetail() {
    if (!activeDrill) {
      drillDetail.children = [];
      return;
    }

    const { team, colab, stateKey } = activeDrill;
    const colDef = STATE_COLS.find((c) => c.key === stateKey);
    let items = getFilteredItems().filter((i) => i.Team === team);

    if (colab) {
      items = items.filter((i) => ownerName(i) === colab);
    }
    if (colDef && colDef.status) {
      items = items.filter((i) => i.Status === colDef.status);
    }

    const label = colab
      ? `${colab} -- ${colDef ? colDef.label : 'Total'} (${team})`
      : `${team} -- ${colDef ? colDef.label : 'Total'}`;

    const detailCols = ['Iniciativa', 'Estado', 'Colaborador', 'Saving'];

    drillDetail.children = [
      new Container(
        [
          new Text(label, { type: 'h2', class: 'pace-sec-title' }),
          new Button('Fechar', {
            variant: 'secondary',
            onClickHandler: () => {
              activeDrill = null;
              rebuildMetrics();
            },
          }),
        ],
        { class: 'pace-drill-header' }
      ),
      new Container(
        [
          buildTableHeader(detailCols),
          ...items.map((item) =>
            new Container(
              [
                new Button(item.Title, {
                  variant: 'secondary',
                  isOutlined: true,
                  onClickHandler: () => {
                    alert('Detalhe da iniciativa (placeholder)');
                  },
                  class: 'pace-table-link-btn',
                }),
                new Text(statusLabel(item.Status), {
                  type: 'span',
                  class: `pace-chip ${chipClass(item.Status)}`,
                }),
                new Text(ownerName(item), { type: 'span' }),
                new Text(
                  parseSaving(item.SavingValidated || item.SavingsValue)
                    ? `EUR ${parseSaving(item.SavingValidated || item.SavingsValue).toLocaleString()}`
                    : '---',
                  { type: 'span' }
                ),
              ],
              { class: 'pace-table-row' }
            )
          ),
          ...(items.length === 0
            ? [new Text('Sem iniciativas nesta categoria.', { type: 'p', class: 'pace-empty' })]
            : []),
        ],
        { class: 'pace-table-wrap' }
      ),
    ];
  }

  // -- init --

  loadData();

  return createPageLayout([ctaBanner, kpiRow, filterBar, metricsTable, drillDetail]);
});
