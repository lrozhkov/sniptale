import type { ViewportPreset } from '../../../../../contracts/settings';
import { settingsListRowClassName } from '../../../../section-surface/panel-controls';
import { PresetRowActions } from '../preset-row-actions';
import { PresetRowMeta } from './meta';
import { PresetRowShell } from './shell';

export function PresetRow(props: {
  hoveredViewportId: string | null;
  onDelete: (preset: ViewportPreset) => void;
  onEdit: (preset: ViewportPreset) => void;
  onHoverChange: (id: string | null) => void;
  preset: ViewportPreset;
}) {
  const isHovered = props.hoveredViewportId === props.preset.id;

  return (
    <PresetRowShell
      className={settingsListRowClassName}
      onHoverChange={props.onHoverChange}
      presetId={props.preset.id}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <PresetRowMeta preset={props.preset} />
      </div>
      <PresetRowActions
        isHovered={isHovered}
        onDelete={() => props.onDelete(props.preset)}
        onEdit={() => props.onEdit(props.preset)}
      />
    </PresetRowShell>
  );
}
