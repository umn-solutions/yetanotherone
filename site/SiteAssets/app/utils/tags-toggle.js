import { Container, Button } from '../libs/nofbiz/nofbiz.base.js';
import { INITIATIVE_TAGS } from './constants.js';

export function createTagsToggle(field, { items = INITIATIVE_TAGS, dangerItems = [], isDisabled = false, gridClass = 'pace-tags-grid' } = {}) {
  function buildButtons() {
    return items.map(tag => {
      const selected = (field.value ?? []).includes(tag);
      const isDanger = dangerItems.includes(tag);
      return new Button(tag, {
        variant: selected ? (isDanger ? 'danger' : 'primary') : 'secondary',
        isOutlined: !selected,
        isDisabled,
        onClickHandler: () => {
          const current = field.value ?? [];
          field.value = current.includes(tag)
            ? current.filter(t => t !== tag)
            : [...current, tag];
          grid.children = buildButtons();
        },
      });
    });
  }

  const grid = new Container(buildButtons(), { class: gridClass });
  return grid;
}

/**
 * Single-select segmented toggle. Stores the selected option ({ label, value })
 * in the FormField -- same shape as ComboBox so downstream code (extractComboBoxValue,
 * parseForList) keeps working.
 *
 * @param {FormField} field
 * @param {Array<{ label: string, value: string }>} options
 * @param {{ isDisabled?: boolean, gridClass?: string, allowDeselect?: boolean }} [opts]
 */
export function createSegmentedToggle(field, options, { isDisabled = false, gridClass = 'pace-segmented-toggle', allowDeselect = false } = {}) {
  function getCurrentValue() {
    const v = field.value;
    if (v == null || v === '') return null;
    return typeof v === 'object' ? v.value : v;
  }

  function buildButtons() {
    const current = getCurrentValue();
    return options.map(opt => {
      const selected = current === opt.value;
      return new Button(opt.label, {
        variant: selected ? 'primary' : 'secondary',
        isOutlined: !selected,
        isDisabled,
        onClickHandler: () => {
          if (selected && allowDeselect) {
            field.value = null;
          } else if (!selected) {
            field.value = { label: opt.label, value: opt.value };
          }
          grid.children = buildButtons();
        },
      });
    });
  }

  const grid = new Container(buildButtons(), { class: gridClass });
  return grid;
}
