import { cx } from '../../chrome/ui';
import type { EditorLayerItem } from '../../../features/editor/document/types';

export const LAYER_TRIGGER_CLASS_NAME =
  'flex min-h-8 min-w-0 w-full flex-1 items-center overflow-hidden rounded-[7px] ' +
  'px-1 py-0.5 text-left transition';
export const LAYER_ICON_CLASS_NAME =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border';
export const LAYER_ICON_SURFACE_CLASS_NAME =
  'border-[color:var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_82%,transparent)] ' +
  'text-[color:var(--sniptale-color-text-secondary)]';
export const PANEL_ICON_CLASS_NAME =
  'flex h-9 w-9 items-center justify-center rounded-[8px] border';
export const PANEL_ICON_SURFACE_CLASS_NAME =
  'border-[color:var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_72%,transparent)] ' +
  'text-[color:var(--sniptale-color-text-primary)]';
export const EMPTY_STATE_CLASS_NAME =
  'rounded-[16px] border border-[color:var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_74%,transparent)] ' +
  'px-4 py-6 text-center text-sm text-[color:var(--sniptale-color-text-muted)]';

export function getLayerRowClassName(
  layer: EditorLayerItem,
  dragOverLayerId: string | null,
  isImmutable: boolean
) {
  return cx(
    [
      'group relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-[9px] border',
      'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_72%,transparent)]',
    ].join(' '),
    'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_42%,transparent)] px-1.5 py-1 transition',
    'hover:border-[color:var(--sniptale-color-border-strong)]',
    layer.selected &&
      'border-[color:var(--sniptale-color-border-strong)] ' +
        'bg-[color:var(--sniptale-color-surface-hover)] ' +
        'before:absolute before:inset-y-1.5 before:left-0 before:w-[2px] before:rounded-full ' +
        'before:bg-[color:var(--sniptale-color-accent)]',
    dragOverLayerId === layer.id &&
      'border-[color:var(--sniptale-color-border-accent-strong)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_82%,transparent)]',
    !isImmutable && 'cursor-default'
  );
}
