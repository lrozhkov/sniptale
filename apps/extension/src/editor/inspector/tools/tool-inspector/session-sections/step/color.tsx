import {
  EDITOR_TOOL_SHAPE_STROKE_PALETTE,
  EDITOR_TOOL_TEXT_COLOR_PALETTE,
} from '../../../../../../features/editor/document/constants';
import { translate } from '../../../../../../platform/i18n';
import type { ComponentProps } from 'react';
import {
  CompactColorSwatchTrigger,
  CompactCommandField,
  type CompactCommand,
} from '../../../../compact';
import type { ToolCommandParams } from '../../../../compact/tool-commands/types';
import { ColorField } from '../../../../../chrome/ui';
import { createEditorColorPatchHandlers } from '../../../color-actions';

type StepSettings = ToolCommandParams['inspectorToolSettings']['step'];
type StepColorPatchKey = 'color' | 'strokeColor' | 'textColor';
type StepColorPatchCommandArgs = {
  id: string;
  label: string;
  palette: readonly string[];
  patchKey: StepColorPatchKey;
  settings: StepSettings;
  swatchMode?: ComponentProps<typeof CompactColorSwatchTrigger>['mode'];
  params: ToolCommandParams;
};

function createStepColorPatch(key: StepColorPatchKey, value: string): Partial<StepSettings> {
  if (key === 'strokeColor') {
    return { strokeColor: value };
  }
  if (key === 'textColor') {
    return { textColor: value };
  }
  return { color: value };
}

function buildStepColorPatchContent(args: StepColorPatchCommandArgs, value: string) {
  const colorHandlers = createEditorColorPatchHandlers({
    applyPatch: args.params.applyStepPatch,
    createPatch: (next: string) => createStepColorPatch(args.patchKey, next),
    previewColor: args.params.previewColor,
    updateColor: args.params.updateColor,
  });

  return (
    <CompactCommandField label={args.label} value={value}>
      <ColorField
        title={args.label}
        label={args.label}
        value={value}
        recentColors={args.params.recentColors}
        palette={args.palette}
        {...colorHandlers}
      />
    </CompactCommandField>
  );
}

function buildStepColorPatchCommand(args: StepColorPatchCommandArgs): CompactCommand {
  const value = args.settings[args.patchKey];

  return {
    id: args.id,
    icon: 'color',
    title: args.label,
    trigger: (
      <CompactColorSwatchTrigger
        color={value}
        {...(args.swatchMode ? { mode: args.swatchMode } : {})}
      />
    ),
    value,
    content: buildStepColorPatchContent(args, value),
  };
}

export function buildStepTextColorCommand(
  params: ToolCommandParams,
  settings: StepSettings
): CompactCommand {
  return {
    ...buildStepColorPatchCommand({
      id: 'step-text-color',
      label: translate('editor.compact.stepTextColor'),
      palette: EDITOR_TOOL_TEXT_COLOR_PALETTE,
      patchKey: 'textColor',
      params,
      settings,
      swatchMode: 'text',
    }),
    preservePopoverLabel: true,
  };
}

export function buildStepColorCommand(
  params: ToolCommandParams,
  settings: StepSettings
): CompactCommand {
  return buildStepColorPatchCommand({
    id: 'step-color',
    label: translate('editor.compact.stepShapeColor'),
    palette: EDITOR_TOOL_SHAPE_STROKE_PALETTE,
    patchKey: 'color',
    params,
    settings,
  });
}

export function buildStepStrokeColorCommand(
  params: ToolCommandParams,
  settings: StepSettings
): CompactCommand {
  return buildStepColorPatchCommand({
    id: 'step-stroke-color',
    label: translate('editor.compact.stepStrokeColor'),
    palette: EDITOR_TOOL_SHAPE_STROKE_PALETTE,
    patchKey: 'strokeColor',
    params,
    settings,
  });
}
