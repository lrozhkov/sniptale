import type { EditorShapeSettings } from '../../../features/editor/document/types';
import type {
  EditorShapeSettingsOwner,
  EditorShapeTool,
} from '../../../features/editor/document/shape-settings';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import type { useEditorController } from '../../application/controller-context';
import { getTextSettingsStylePatch } from '../../controller/text-formatting';
import type { EditorTextInlineStyleCommand } from '../../controller/text-formatting';
import { useSelectionSettingsHistoryPreview } from './history-preview';
import { shouldUseSelectionToolSettings } from './actions.helpers';
import type { ResolvedToolSettingTargets, SidebarActionArgs } from './types';
export { createPresetHeaderActions } from './selection-preset-actions';

type SidebarStylePresetPatch = {
  shape: Partial<EditorShapeSettings>;
  step: Partial<EditorToolSettings['step']>;
};

type SelectionPatchActionArgs = {
  commitPendingSelectionSettings: () => void;
  controller: ReturnType<typeof useEditorController>;
  previewSelectionSettings: (applyPreviewPatch?: () => void) => void;
  selectionSettingsEnabled: boolean;
  shapeTool: SidebarActionArgs['shapeTool'];
  targets: ResolvedToolSettingTargets;
  textSettings: EditorToolSettings['text'];
  updateShapeSettings: SidebarActionArgs['updateShapeSettings'];
  updateStepSettings: SidebarActionArgs['updateStepSettings'];
};

type SelectionPatchActions = {
  applyArrowPatch: (patch: Partial<EditorToolSettings['arrow']>) => void;
  applyLinePatch: (patch: Partial<EditorToolSettings['line']>) => void;
  applyBlurPatch: (patch: Partial<EditorToolSettings['blur']>) => void;
  applyBrushPatch: (
    tool: 'pencil' | 'highlighter',
    patch: Partial<EditorToolSettings['pencil']>
  ) => void;
  applyPresetPatch: (patch: SidebarStylePresetPatch) => void;
  applyShapePatch: (patch: Partial<EditorShapeSettings>) => void;
  applyStepPatch: (patch: Partial<EditorToolSettings['step']>) => void;
  applyTextPatch: (patch: Partial<EditorToolSettings['text']>) => void;
  applyImagePatch: (patch: Partial<EditorToolSettings['image']>) => void;
  applyTextStyle: (command: EditorTextInlineStyleCommand) => void;
  commitPendingSelectionSettings: () => void;
  previewArrowPatch: (patch: Partial<EditorToolSettings['arrow']>) => void;
  previewLinePatch: (patch: Partial<EditorToolSettings['line']>) => void;
  previewBlurPatch: (patch: Partial<EditorToolSettings['blur']>) => void;
  previewBrushPatch: (
    tool: 'pencil' | 'highlighter',
    patch: Partial<EditorToolSettings['pencil']>
  ) => void;
  previewShapePatch: (patch: Partial<EditorShapeSettings>) => void;
  previewStepPatch: (patch: Partial<EditorToolSettings['step']>) => void;
  previewTextPatch: (patch: Partial<EditorToolSettings['text']>) => void;
  previewImagePatch: (patch: Partial<EditorToolSettings['image']>) => void;
};

function resolvePresetShapeOwner(shapeTool: EditorShapeTool): EditorShapeSettingsOwner {
  return shapeTool === 'ellipse' ? 'ellipse' : 'rectangle';
}

function applyTextStyleCommand(args: {
  applyTextPatch: (patch: Partial<EditorToolSettings['text']>) => void;
  command: EditorTextInlineStyleCommand;
  controller: ReturnType<typeof useEditorController>;
  textSettings: EditorToolSettings['text'];
}) {
  if (args.controller.applyTextSelectionStyle(args.command)) {
    return;
  }

  args.applyTextPatch(getTextSettingsStylePatch(args.textSettings, args.command));
}

function createSelectionPatchCommitter(args: SelectionPatchActionArgs) {
  function applyPostPatch() {
    if (args.selectionSettingsEnabled) {
      args.controller.applyActiveSettingsToSelection();
      return;
    }

    args.controller.refreshActiveToolSettingsPreview();
  }

  return {
    applyPostPatch,
    commitPendingSelectionSettings: () => {
      if (args.selectionSettingsEnabled) {
        args.commitPendingSelectionSettings();
      }
    },
  };
}

function createPreviewToolPatch<T>(args: {
  applyPatch: (patch: T) => void;
  previewSelectionSettings: (applyPreviewPatch?: () => void) => void;
}) {
  return (patch: T) => {
    args.previewSelectionSettings(() => {
      args.applyPatch(patch);
    });
  };
}

function createBrushPatchHandlers(
  args: Pick<SelectionPatchActionArgs, 'previewSelectionSettings' | 'targets'>,
  applyPostPatch: () => void
) {
  return {
    applyBrushPatch(tool: 'pencil' | 'highlighter', patch: Partial<EditorToolSettings['pencil']>) {
      args.targets.brush(tool, patch);
      applyPostPatch();
    },
    previewBrushPatch(
      tool: 'pencil' | 'highlighter',
      patch: Partial<EditorToolSettings['pencil']>
    ) {
      args.previewSelectionSettings(() => {
        args.targets.brush(tool, patch);
      });
    },
  };
}

function createPresetPatchAction(
  args: SelectionPatchActionArgs,
  applyPostPatch: () => void
): SelectionPatchActions['applyPresetPatch'] {
  return (patch) => {
    if (args.selectionSettingsEnabled) {
      args.targets.shape(patch.shape);
      args.targets.step(patch.step);
    }

    args.updateShapeSettings(resolvePresetShapeOwner(args.shapeTool), patch.shape);
    args.updateStepSettings(patch.step);
    applyPostPatch();
  };
}

function createPreviewPatchActions(args: SelectionPatchActionArgs) {
  const lineTarget = args.targets.line ?? (() => undefined);
  const imageTarget = args.targets.image ?? (() => undefined);
  return {
    previewArrowPatch: createPreviewToolPatch({
      applyPatch: args.targets.arrow,
      previewSelectionSettings: args.previewSelectionSettings,
    }),
    previewLinePatch: createPreviewToolPatch({
      applyPatch: lineTarget,
      previewSelectionSettings: args.previewSelectionSettings,
    }),
    previewBlurPatch: createPreviewToolPatch({
      applyPatch: args.targets.blur,
      previewSelectionSettings: args.previewSelectionSettings,
    }),
    previewShapePatch: createPreviewToolPatch({
      applyPatch: args.targets.shape,
      previewSelectionSettings: args.previewSelectionSettings,
    }),
    previewStepPatch: createPreviewToolPatch({
      applyPatch: args.targets.step,
      previewSelectionSettings: args.previewSelectionSettings,
    }),
    previewTextPatch: createPreviewToolPatch({
      applyPatch: args.targets.text,
      previewSelectionSettings: args.previewSelectionSettings,
    }),
    previewImagePatch: createPreviewToolPatch({
      applyPatch: imageTarget,
      previewSelectionSettings: args.previewSelectionSettings,
    }),
  };
}

function createSelectionPatchActions(args: SelectionPatchActionArgs): SelectionPatchActions {
  const { applyPostPatch, commitPendingSelectionSettings } = createSelectionPatchCommitter(args);
  const { applyBrushPatch, previewBrushPatch } = createBrushPatchHandlers(args, applyPostPatch);
  const previewPatchActions = createPreviewPatchActions(args);
  const applyToolPatch = <T>(applyPatch: (patch: T) => void, patch: T) => {
    applyPatch(patch);
    applyPostPatch();
  };
  const applyLineTarget = args.targets.line ?? (() => undefined);
  const applyImageTarget = args.targets.image ?? (() => undefined);

  return {
    applyArrowPatch: (patch) => applyToolPatch(args.targets.arrow, patch),
    applyLinePatch: (patch) => applyToolPatch(applyLineTarget, patch),
    applyBlurPatch: (patch) => applyToolPatch(args.targets.blur, patch),
    applyBrushPatch,
    applyPresetPatch: createPresetPatchAction(args, applyPostPatch),
    applyShapePatch: (patch) => applyToolPatch(args.targets.shape, patch),
    applyStepPatch: (patch) => applyToolPatch(args.targets.step, patch),
    applyTextPatch: (patch) => applyToolPatch(args.targets.text, patch),
    applyImagePatch: (patch) => applyToolPatch(applyImageTarget, patch),
    applyTextStyle: (command) =>
      applyTextStyleCommand({
        command,
        controller: args.controller,
        textSettings: args.textSettings,
        applyTextPatch: (patch) => applyToolPatch(args.targets.text, patch),
      }),
    commitPendingSelectionSettings,
    previewArrowPatch: previewPatchActions.previewArrowPatch,
    previewLinePatch: previewPatchActions.previewLinePatch,
    previewBlurPatch: previewPatchActions.previewBlurPatch,
    previewBrushPatch,
    previewShapePatch: previewPatchActions.previewShapePatch,
    previewStepPatch: previewPatchActions.previewStepPatch,
    previewTextPatch: previewPatchActions.previewTextPatch,
    previewImagePatch: previewPatchActions.previewImagePatch,
  };
}

export function useSidebarSelectionPatchActions(args: {
  activeTool: SidebarActionArgs['activeTool'];
  controller: ReturnType<typeof useEditorController>;
  shapeTool: SidebarActionArgs['shapeTool'];
  selection: SidebarActionArgs['selection'];
  targets: ResolvedToolSettingTargets;
  textSettings: SidebarActionArgs['textSettings'];
  updateShapeSettings: SidebarActionArgs['updateShapeSettings'];
  updateStepSettings: SidebarActionArgs['updateStepSettings'];
}) {
  const selectionSettingsEnabled = shouldUseSelectionToolSettings({
    activeTool: args.activeTool,
    selection: args.selection,
  });
  const { commitPendingSelectionSettings, previewSelectionSettings } =
    useSelectionSettingsHistoryPreview({
      controller: args.controller,
      selectionSettingsEnabled,
    });

  return {
    selectionPatchActions: createSelectionPatchActions({
      commitPendingSelectionSettings,
      controller: args.controller,
      previewSelectionSettings,
      selectionSettingsEnabled,
      shapeTool: args.shapeTool,
      targets: args.targets,
      textSettings: args.textSettings,
      updateShapeSettings: args.updateShapeSettings,
      updateStepSettings: args.updateStepSettings,
    }),
    selectionSettingsEnabled,
  };
}
