import type { SavePreset } from '../../../../../contracts/settings';
import { settingsListRowClassName } from '../../../../section-surface/panel-controls';

export function getPresetRowClassName(props: {
  draggedId: string | null;
  dragOverId: string | null;
  preset: SavePreset;
}): string {
  return [
    settingsListRowClassName,
    !props.preset.enabled && 'opacity-50',
    props.draggedId === props.preset.id && 'scale-[0.98] opacity-50',
    props.dragOverId === props.preset.id &&
      'border-[color:color-mix(in_srgb,var(--sniptale-color-success)_36%,var(--sniptale-color-border-soft)_64%)]',
    props.dragOverId === props.preset.id &&
      'bg-[color:color-mix(in_srgb,var(--sniptale-color-success)_8%,transparent)]',
  ]
    .filter(Boolean)
    .join(' ');
}
