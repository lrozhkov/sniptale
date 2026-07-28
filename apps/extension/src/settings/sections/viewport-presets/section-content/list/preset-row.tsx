import type { ViewportPreset } from '../../../../../contracts/settings';
import { PresetRowActions } from '../preset-row-actions';
import { PresetRowMeta } from './meta';
import { PresetRowShell } from './shell';

export function PresetRow(props: {
  hoveredViewportId: string | null;
  isLoading: boolean;
  onDelete: (preset: ViewportPreset) => void;
  onEdit: (preset: ViewportPreset) => void;
  onMove: (presetId: string, direction: -1 | 1) => Promise<void>;
  onReset: (preset: ViewportPreset) => Promise<void>;
  onToggle: (preset: ViewportPreset) => Promise<void>;
  onHoverChange: (id: string | null) => void;
  preset: ViewportPreset;
  canMoveDown: boolean;
  canMoveUp: boolean;
}) {
  const isHovered = props.hoveredViewportId === props.preset.id;

  return (
    <PresetRowShell
      className={[
        'group relative flex min-h-12 items-center gap-3 px-3 py-2 transition-colors',
        'border-b border-[var(--sniptale-color-border-subtle)] last:border-b-0',
        'hover:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-hover)_68%,transparent)]',
      ].join(' ')}
      onHoverChange={props.onHoverChange}
      presetId={props.preset.id}
    >
      <div className="flex min-w-0 flex-1 items-center">
        <PresetRowMeta preset={props.preset} />
      </div>
      <PresetRowActions
        canMoveDown={props.canMoveDown}
        canMoveUp={props.canMoveUp}
        isHovered={isHovered}
        isLoading={props.isLoading}
        onDelete={() => props.onDelete(props.preset)}
        onEdit={() => props.onEdit(props.preset)}
        onMove={(direction) => void props.onMove(props.preset.id, direction)}
        onReset={() => void props.onReset(props.preset)}
        onToggle={() => void props.onToggle(props.preset)}
        preset={props.preset}
      />
    </PresetRowShell>
  );
}
