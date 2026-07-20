import type { SavePreset } from '../../../../../contracts/settings';
import type {
  SavePresetsListBodyProps,
  SavePresetsListProps,
  SavePresetsRowProps,
} from '../../state/types';

type SavePresetsRowSharedProps = Omit<SavePresetsRowProps, 'preset'>;

function pickPresetRowSharedProps(props: SavePresetsRowSharedProps): SavePresetsRowSharedProps {
  return {
    draggedId: props.draggedId,
    dragOverId: props.dragOverId,
    hoveredPresetId: props.hoveredPresetId,
    onDelete: props.onDelete,
    onDragEnd: props.onDragEnd,
    onDragLeave: props.onDragLeave,
    onDragOver: props.onDragOver,
    onDragStart: props.onDragStart,
    onDrop: props.onDrop,
    onEdit: props.onEdit,
    onHoverChange: props.onHoverChange,
    onToggleEnabled: props.onToggleEnabled,
  };
}

export function pickPresetsListBodyProps(props: SavePresetsListProps): SavePresetsListBodyProps {
  return {
    ...pickPresetRowSharedProps(props),
    presets: props.presets,
  };
}

export function createPresetRowProps(
  props: SavePresetsListBodyProps,
  preset: SavePreset
): SavePresetsRowProps {
  return {
    preset,
    ...pickPresetRowSharedProps(props),
  };
}
