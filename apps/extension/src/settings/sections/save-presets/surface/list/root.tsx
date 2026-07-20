import { PresetsListBody, PresetsListHeader } from '.';
import { pickPresetsListBodyProps } from './props';
import { PresetsListOverlays } from '../overlays';
import type { SavePresetsListProps } from '../../state/types';

export function PresetsList(props: SavePresetsListProps) {
  const bodyProps = pickPresetsListBodyProps(props);

  return (
    <>
      <div className="mb-4">
        <PresetsListHeader presetCountLabel={props.presetCountLabel} presets={props.presets} />
        <PresetsListBody {...bodyProps} />
      </div>
      <PresetsListOverlays
        confirmDelete={props.confirmDelete}
        confirmDeletePreset={props.confirmDeletePreset}
        isEditorOpen={props.isEditorOpen}
        onCloseDeleteDialog={props.onCloseDeleteDialog}
        onCloseEditor={props.onCloseEditor}
        onSavePreset={props.onSavePreset}
        {...(props.editingPreset === undefined ? {} : { editingPreset: props.editingPreset })}
      />
    </>
  );
}
