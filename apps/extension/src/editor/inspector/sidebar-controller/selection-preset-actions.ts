import type { EditorShapeSettings } from '../../../features/editor/document/types';
import type { EditorShapeSettingsOwner } from '../../../features/editor/document/shape-settings';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import type { useEditorController } from '../../application/controller-context';
import type { SidebarActionArgs } from './types';

type PresetHeaderActionArgs = Pick<
  SidebarActionArgs,
  | 'updateBlurSettings'
  | 'updateArrowSettings'
  | 'updateLineSettings'
  | 'updateBrushSettings'
  | 'updateSelectionBlurSettings'
  | 'updateSelectionArrowSettings'
  | 'updateSelectionLineSettings'
  | 'updateSelectionBrushSettings'
  | 'updateSelectionShapeSettings'
  | 'updateSelectionStepSettings'
  | 'updateSelectionTextSettings'
  | 'updateShapeSettings'
  | 'updateStepSettings'
  | 'updateTextSettings'
> & {
  controller: Pick<
    ReturnType<typeof useEditorController>,
    'applyActiveSettingsToSelection' | 'refreshActiveToolSettingsPreview'
  >;
  selectionSettingsEnabled: boolean;
};

type PresetHeaderActions = {
  applyArrowPresetSettings: (settings: EditorToolSettings['arrow']) => void;
  applyLinePresetSettings: (settings: EditorToolSettings['line']) => void;
  applyBlurPresetSettings: (settings: EditorToolSettings['blur']) => void;
  applyBrushPresetSettings: (
    tool: 'pencil' | 'highlighter',
    settings: EditorToolSettings['pencil']
  ) => void;
  applyShapePresetSettings: (
    owner: EditorShapeSettingsOwner,
    settings: EditorShapeSettings
  ) => void;
  setPencilShapeCorrection: (
    shapeCorrection: EditorToolSettings['pencil']['shapeCorrection']
  ) => void;
  applyStepPresetSettings: (settings: EditorToolSettings['step']) => void;
  applyTextPresetSettings: (settings: EditorToolSettings['text']) => void;
};

export function createPresetHeaderActions(args: PresetHeaderActionArgs): PresetHeaderActions {
  const applyPresetSettings = (applySelectionPatch: () => void, applyDefaultPatch: () => void) => {
    if (args.selectionSettingsEnabled) {
      applySelectionPatch();
      applyDefaultPatch();
      args.controller.applyActiveSettingsToSelection();
      return;
    }

    applyDefaultPatch();
    args.controller.refreshActiveToolSettingsPreview();
  };

  return {
    ...createLinearPresetActions(args, applyPresetSettings),
    ...createBrushAndShapePresetActions(args, applyPresetSettings),
    ...createTextPresetActions(args, applyPresetSettings),
  };
}

function createLinearPresetActions(
  args: PresetHeaderActionArgs,
  applyPresetSettings: (applySelectionPatch: () => void, applyDefaultPatch: () => void) => void
): Pick<
  PresetHeaderActions,
  'applyBlurPresetSettings' | 'applyArrowPresetSettings' | 'applyLinePresetSettings'
> {
  return {
    applyBlurPresetSettings: (settings) =>
      applyPresetSettings(
        () => args.updateSelectionBlurSettings(settings),
        () => args.updateBlurSettings(settings)
      ),
    applyArrowPresetSettings: (settings) =>
      applyPresetSettings(
        () => args.updateSelectionArrowSettings(settings),
        () => args.updateArrowSettings(settings)
      ),
    applyLinePresetSettings: (settings) =>
      applyPresetSettings(
        () => args.updateSelectionLineSettings?.(settings),
        () => args.updateLineSettings?.(settings)
      ),
  };
}

function createBrushAndShapePresetActions(
  args: PresetHeaderActionArgs,
  applyPresetSettings: (applySelectionPatch: () => void, applyDefaultPatch: () => void) => void
): Pick<
  PresetHeaderActions,
  'applyBrushPresetSettings' | 'setPencilShapeCorrection' | 'applyShapePresetSettings'
> {
  return {
    applyBrushPresetSettings: (tool, settings) =>
      applyPresetSettings(
        () => args.updateSelectionBrushSettings(tool, settings),
        () => args.updateBrushSettings(tool, settings)
      ),
    setPencilShapeCorrection: (shapeCorrection) => {
      args.updateBrushSettings('pencil', { shapeCorrection });
      if (args.selectionSettingsEnabled) {
        args.updateSelectionBrushSettings('pencil', { shapeCorrection });
      }
    },
    applyShapePresetSettings: (owner, settings) =>
      applyPresetSettings(
        () => args.updateSelectionShapeSettings(owner, settings),
        () => args.updateShapeSettings(owner, settings)
      ),
  };
}

function createTextPresetActions(
  args: PresetHeaderActionArgs,
  applyPresetSettings: (applySelectionPatch: () => void, applyDefaultPatch: () => void) => void
): Pick<PresetHeaderActions, 'applyStepPresetSettings' | 'applyTextPresetSettings'> {
  return {
    applyStepPresetSettings: (settings) =>
      applyPresetSettings(
        () => args.updateSelectionStepSettings(settings),
        () => args.updateStepSettings(settings)
      ),
    applyTextPresetSettings: (settings) =>
      applyPresetSettings(
        () => args.updateSelectionTextSettings(settings),
        () => args.updateTextSettings(settings)
      ),
  };
}
