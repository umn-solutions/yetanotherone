import { Container, Text, getIcon } from '../libs/nofbiz/nofbiz.base.js';

/**
 * Creates a sortable table with grid-based rows (consistent with pace-table-row layout).
 *
 * Header cells with a `sortAccessor` are clickable. Clicking the active column toggles
 * between ascending and descending; clicking a different column switches to that column
 * ascending. At least one column is always sorted: if no `defaultSort` is supplied, the
 * first sortable column is used in ascending order.
 *
 * @param {Object} options
 * @param {Array<{ label: string, sortAccessor?: (item: any) => any }>} options.columns
 * @param {(item: any) => any} options.buildRow - Returns a Container for a single row.
 * @param {string} [options.emptyMessage='Sem dados.']
 * @param {string} [options.wrapClass='pace-table-wrap']
 * @param {{ columnIndex: number, direction?: 'asc' | 'desc' }} [options.defaultSort]
 * @returns {{ container: Container, setItems: (items: any[]) => void }}
 */
export function createSortableTable({
  columns,
  buildRow,
  emptyMessage = 'Sem dados.',
  wrapClass = 'pace-table-wrap',
  defaultSort,
}) {
  let sortIdx = -1;
  let sortDir = 'asc';
  let items = [];

  if (defaultSort && columns[defaultSort.columnIndex]?.sortAccessor) {
    sortIdx = defaultSort.columnIndex;
    sortDir = defaultSort.direction === 'desc' ? 'desc' : 'asc';
  } else {
    const firstSortable = columns.findIndex((c) => typeof c.sortAccessor === 'function');
    if (firstSortable >= 0) {
      sortIdx = firstSortable;
      sortDir = 'asc';
    }
  }

  const wrap = new Container([], { class: wrapClass });

  function buildHeader() {
    const cells = columns.map((col, idx) => {
      const sortable = typeof col.sortAccessor === 'function';
      const isActive = sortable && idx === sortIdx;

      const classes = ['pace-table-th'];
      if (sortable) classes.push('pace-table-th--sortable');
      if (isActive) classes.push('pace-table-th--active', `pace-table-th--${sortDir}`);

      const children = [new Text(col.label, { type: 'span', class: 'pace-table-th__label' })];
      if (sortable) {
        const iconName = isActive && sortDir === 'desc' ? 'sort-desc' : 'sort-asc';
        children.push(
          new Container([getIcon(iconName)], { as: 'span', class: 'pace-sort-icon' }),
        );
      }

      const cell = new Container(children, { class: classes.join(' ') });
      if (sortable) cell.setEventHandler('click', () => handleSort(idx));
      return cell;
    });

    return new Container(cells, { class: 'pace-table-row pace-table-row--header' });
  }

  function handleSort(idx) {
    if (sortIdx === idx) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      sortIdx = idx;
      sortDir = 'asc';
    }
    render();
  }

  function sortItems(arr) {
    if (sortIdx < 0) return arr;
    const accessor = columns[sortIdx].sortAccessor;
    if (!accessor) return arr;

    const sorted = [...arr].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      const aNil = va === null || va === undefined || va === '';
      const bNil = vb === null || vb === undefined || vb === '';
      if (aNil && bNil) return 0;
      if (aNil) return 1;
      if (bNil) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return va - vb;
      return String(va).localeCompare(String(vb), 'pt', { sensitivity: 'base' });
    });

    return sortDir === 'desc' ? sorted.reverse() : sorted;
  }

  function render() {
    if (!items.length) {
      wrap.children = [new Text(emptyMessage, { type: 'p', class: 'pace-empty' })];
      return;
    }
    const sorted = sortItems(items);
    wrap.children = [buildHeader(), ...sorted.map(buildRow)];
  }

  function setItems(newItems) {
    items = Array.isArray(newItems) ? newItems : [];
    render();
  }

  return { container: wrap, setItems };
}
