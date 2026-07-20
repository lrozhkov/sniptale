import type { ToolCommandParams } from '../../../compact/tool-commands/types';

type TextToolSettings = ToolCommandParams['inspectorToolSettings']['text'];

type TextCommandLabelOptions = Pick<
  ToolCommandParams,
  'fontOptions' | 'textAlignOptions' | 'textVerticalAlignOptions'
>;

export function resolveTextFontLabel(
  params: Pick<TextCommandLabelOptions, 'fontOptions'>,
  settings: TextToolSettings
): string {
  return (
    params.fontOptions.find((item) => item.value === settings.fontFamily)?.label ??
    settings.fontFamily
  );
}

export function resolveTextAlignLabel(
  params: Pick<TextCommandLabelOptions, 'textAlignOptions'>,
  settings: TextToolSettings
): string {
  const options = params.textAlignOptions ?? [];
  return options.find((item) => item.value === settings.textAlign)?.label ?? settings.textAlign;
}

export function resolveTextVerticalAlignLabel(
  params: Pick<TextCommandLabelOptions, 'textVerticalAlignOptions'>,
  settings: TextToolSettings
): string {
  const options = params.textVerticalAlignOptions ?? [];
  return (
    options.find((item) => item.value === settings.verticalAlign)?.label ?? settings.verticalAlign
  );
}
