import {
  Container,
  Text,
  TextInput,
  ComboBox,
  Button,
  FormField,
  View,
  __lodash,
} from '../libs/nofbiz/nofbiz.base.js';

/**
 * Creates a reusable filter bar with optional status, saving type, team, and search inputs.
 *
 * @param {Object} options
 * @param {string[]} [options.statusOptions] - Status values for the status filter ComboBox
 * @param {string[]} [options.savingOptions] - Saving type values for the saving filter ComboBox
 * @param {Array<{ label: string, value: string }>} [options.teamOptions] - Team options for the team filter ComboBox
 * @param {string} [options.searchPlaceholder] - Placeholder for the search input
 * @param {(filters: { status: string, savingType: string, team: string, searchQuery: string }) => void} options.onFilterChange
 * @returns {{ container: Container, getFilters: () => Object, setCount: (n: number) => void, clear: () => void }}
 */
export function createFilterBar({ statusOptions, savingOptions, teamOptions, searchPlaceholder, onFilterChange }) {
  const statusField = new FormField({ value: '' });
  const savingField = new FormField({ value: '' });
  const teamField = new FormField({ value: '' });
  const searchField = new FormField({ value: '' });

  let countText = new Text('0 resultados', { type: 'span', class: 'pace-filter-count' });

  const getFilters = () => {
    const statusVal = statusField.value;
    const savingVal = savingField.value;
    const teamVal = teamField.value;
    return {
      status: statusVal && typeof statusVal === 'object' ? statusVal.label : (statusVal || ''),
      savingType: savingVal && typeof savingVal === 'object' ? savingVal.label : (savingVal || ''),
      team: teamVal && typeof teamVal === 'object' ? teamVal.value : (teamVal || ''),
      searchQuery: searchField.value || '',
    };
  };

  const notifyChange = __lodash.debounce(() => {
    onFilterChange(getFilters());
  }, 100);

  const children = [];

  let statusView = null;
  const buildStatusCombo = (opts) => new ComboBox(statusField, opts, {
    placeholder: 'Estado...',
    onSelectHandler: () => notifyChange(),
  });
  if (statusOptions) {
    statusView = new View([buildStatusCombo(statusOptions)], { showOnRender: true });
    children.push(statusView);
  }

  if (savingOptions) {
    const savingCombo = new ComboBox(savingField, savingOptions, {
      placeholder: 'Tipo Saving...',
      onSelectHandler: () => notifyChange(),
    });
    children.push(savingCombo);
  }

  if (teamOptions) {
    const teamCombo = new ComboBox(teamField, teamOptions, {
      placeholder: 'Equipa...',
      onSelectHandler: () => notifyChange(),
    });
    children.push(teamCombo);
  }

  const searchInput = new TextInput(searchField, {
    placeholder: searchPlaceholder || 'Pesquisar...',
    debounceMs: 300,
  });
  children.push(searchInput);

  searchField.subscribe(() => notifyChange());

  const clearBtn = new Button('Limpar', {
    variant: 'secondary',
    isOutlined: true,
    onClickHandler: () => {
      statusField.value = '';
      savingField.value = '';
      teamField.value = '';
      searchField.value = '';
      notifyChange();
    },
  });
  children.push(clearBtn);
  children.push(countText);

  const container = new Container(children, { class: 'pace-filters' });

  const setCount = (n) => {
    countText.children = `${n} resultado${n !== 1 ? 's' : ''}`;
  };

  const clear = () => {
    statusField.value = '';
    savingField.value = '';
    teamField.value = '';
    searchField.value = '';
    notifyChange();
  };

  const setStatusVisible = (visible) => {
    if (!statusView) return;
    if (visible) {
      statusView.show();
    } else {
      statusField.value = '';
      statusView.hide();
    }
  };

  const setStatusOptions = (newOptions) => {
    if (!statusView) return;
    statusField.value = '';
    statusView.children = [buildStatusCombo(newOptions)];
  };

  return { container, getFilters, setCount, clear, setStatusVisible, setStatusOptions };
}
