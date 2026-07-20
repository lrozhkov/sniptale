import { SettingsDragHandle } from '../../../../section-surface/panel-controls';
import { PresetRowActions } from './preset-row-actions';
import { PresetRowContent } from './preset-row-content';
import { getPresetRowClassName } from './row-class-name';
import { PresetRowShell } from './preset-row-shell';
import type { SavePresetsRowProps } from '../../state/types';

function PresetRowHandle() {
  return (
    <div className="flex-shrink-0" onDragStart={(event) => event.stopPropagation()}>
      <SettingsDragHandle />
    </div>
  );
}

export function PresetRow(props: SavePresetsRowProps) {
  const className = getPresetRowClassName(props);

  return (
    <PresetRowShell
      className={className}
      presetId={props.preset.id}
      onDragEnd={props.onDragEnd}
      onDragLeave={props.onDragLeave}
      onDragOver={props.onDragOver}
      onDragStart={props.onDragStart}
      onDrop={props.onDrop}
      onHoverChange={props.onHoverChange}
    >
      <PresetRowHandle />
      <PresetRowContent preset={props.preset} />
      <PresetRowActions
        hovered={props.hoveredPresetId === props.preset.id}
        onDelete={() => props.onDelete(props.preset)}
        onEdit={() => props.onEdit(props.preset)}
        onToggleEnabled={() => props.onToggleEnabled(props.preset)}
        preset={props.preset}
      />
    </PresetRowShell>
  );
}
