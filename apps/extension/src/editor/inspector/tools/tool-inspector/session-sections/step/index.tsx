import type { CompactCommand } from '../../../../compact';
import { buildRangeCompactCommand } from '../../../../compact/tool-commands/shared';
import type { ToolCommandParams } from '../../../../compact/tool-commands/types';
import { buildStepAlphabetCommand } from './alphabet';
import {
  buildStepColorCommand,
  buildStepStrokeColorCommand,
  buildStepTextColorCommand,
} from './color';
import { buildStepSizeCommand } from './size';
import { buildStepTypeCommand } from './type';
import { buildStepValueCommand } from './value';
import { translate } from '../../../../../../platform/i18n';

type StepSettings = ToolCommandParams['inspectorToolSettings']['step'];

function buildStepOpacityCommand(
  params: ToolCommandParams,
  settings: StepSettings
): CompactCommand {
  const label = translate('editor.compact.opacity');

  return buildRangeCompactCommand({
    id: 'step-opacity',
    icon: 'opacity',
    label,
    max: 1,
    min: 0,
    onChange: (rawValue) =>
      params.previewStepPatch({ opacity: params.toNumber(rawValue, settings.opacity) }),
    onValueCommit: params.commitPendingSelectionSettings,
    step: 0.05,
    token: 'OP',
    value: settings.opacity,
    valueText: `${Math.round(settings.opacity * 100)}%`,
  });
}

function buildStepStrokeWidthCommand(
  params: ToolCommandParams,
  settings: StepSettings
): CompactCommand {
  const label = translate('editor.compact.stepStrokeWidth');

  return buildRangeCompactCommand({
    id: 'step-stroke-width',
    icon: 'size',
    label,
    max: 12,
    min: 0,
    onChange: (rawValue) =>
      params.previewStepPatch({ strokeWidth: params.toNumber(rawValue, settings.strokeWidth) }),
    onValueCommit: params.commitPendingSelectionSettings,
    step: 1,
    token: 'PX',
    value: settings.strokeWidth,
    valueText: `${settings.strokeWidth}px`,
  });
}

function buildStepStrokeOpacityCommand(
  params: ToolCommandParams,
  settings: StepSettings
): CompactCommand {
  const label = translate('editor.compact.opacity');

  return buildRangeCompactCommand({
    id: 'step-stroke-opacity',
    icon: 'opacity',
    label,
    max: 1,
    min: 0,
    onChange: (rawValue) =>
      params.previewStepPatch({
        strokeOpacity: params.toNumber(rawValue, settings.strokeOpacity),
      }),
    onValueCommit: params.commitPendingSelectionSettings,
    step: 0.05,
    token: 'OP',
    value: settings.strokeOpacity,
    valueText: `${Math.round(settings.strokeOpacity * 100)}%`,
  });
}

export function buildStepCompactCommands(params: ToolCommandParams): CompactCommand[] {
  const settings = params.inspectorToolSettings.step;
  const typeLabel =
    params.stepTypeOptions.find((item) => item.value === settings.type)?.label ?? settings.type;
  const alphabetLabel =
    params.stepAlphabetOptions.find((item) => item.value === settings.alphabet)?.label ??
    settings.alphabet;
  const valueLabel = settings.value || '--';
  const commands = [
    buildStepTypeCommand(params, typeLabel, settings),
    buildStepValueCommand(params, valueLabel, settings),
  ];

  if (settings.type === 'letter') {
    commands.push(buildStepAlphabetCommand(params, alphabetLabel, settings));
  }

  return [
    ...commands,
    buildStepTextColorCommand(params, settings),
    buildStepSizeCommand(params, settings),
    buildStepColorCommand(params, settings),
    buildStepOpacityCommand(params, settings),
    buildStepStrokeWidthCommand(params, settings),
    buildStepStrokeColorCommand(params, settings),
    buildStepStrokeOpacityCommand(params, settings),
  ];
}
