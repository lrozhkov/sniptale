import { Plus } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';

const addButtonClassName = [
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-3',
  'border border-[var(--sniptale-color-border-soft)] text-xs font-medium',
  'text-[var(--sniptale-color-text-secondary)] transition-colors',
  'hover:bg-[var(--sniptale-color-surface-hover)] hover:text-[var(--sniptale-color-text-primary)]',
  'disabled:cursor-not-allowed disabled:opacity-45',
].join(' ');

export function AddViewportPresetButton(props: { disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={addButtonClassName}
      data-ui="settings.viewport-presets.add"
    >
      <Plus size={16} />
      {translate('viewportPresets.section.addButton')}
    </button>
  );
}
