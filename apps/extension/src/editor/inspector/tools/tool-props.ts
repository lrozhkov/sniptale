import { selectSharedToolProps } from './helpers';
import type { EditorInspectorToolsPanelProps } from './types';

export function createStepControlsProps(props: EditorInspectorToolsPanelProps) {
  return {
    ...selectSharedToolProps(props),
    applyStepPatch: props.applyStepPatch,
    commitPendingSelectionSettings: props.commitPendingSelectionSettings,
    previewStepPatch: props.previewStepPatch,
    shapeStrokePalette: props.shapeStrokePalette,
    stepTypeOptions: props.stepTypeOptions,
    stepAlphabetOptions: props.stepAlphabetOptions,
    textColorPalette: props.textColorPalette,
    toolPresetHeader: props.toolPresetHeader,
  };
}
