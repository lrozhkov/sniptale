import type React from 'react';
import { translate } from '../../../../../platform/i18n';
import { CompactCommandField, type CompactCommand } from '../../../compact';
import type { ToolCommandParams } from '../../../compact/tool-commands/types';
import { SegmentedSelector, SelectField, type CompactSelectOption } from '../../../../chrome/ui';
import { TablerIcon } from '../../../compact/tabler-icon';
import {
  resolveTextAlignLabel,
  resolveTextFontLabel,
  resolveTextVerticalAlignLabel,
} from './labels';

const TEXT_FONT_SIZE_PRESETS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48] as const;

function buildFontSizeOptions(fontSize: number): CompactSelectOption<string>[] {
  const values = new Set<number>([...TEXT_FONT_SIZE_PRESETS, fontSize]);

  return [...values]
    .sort((left, right) => left - right)
    .map((value) => ({ value: String(value), label: `${value}px` }));
}

function getTextAlignIcon(value: string) {
  if (value === 'center') {
    return <TablerIcon icon="tabler:align-center" />;
  }
  if (value === 'right') {
    return <TablerIcon icon="tabler:align-right-2" />;
  }
  if (value === 'justify') {
    return <TablerIcon icon="tabler:align-justified" />;
  }
  return <TablerIcon icon="tabler:align-left-2" />;
}

function getTextVerticalAlignIcon(value: string) {
  if (value === 'center') {
    return <TablerIcon icon="tabler:layout-align-center" />;
  }
  if (value === 'bottom') {
    return <TablerIcon icon="tabler:layout-align-bottom" />;
  }
  return <TablerIcon icon="tabler:layout-align-top" />;
}

function getTextVerticalAlignOptions(params: ToolCommandParams) {
  if ((params.textVerticalAlignOptions?.length ?? 0) > 0) {
    return params.textVerticalAlignOptions ?? [];
  }

  return [
    { value: 'top' as const, label: translate('editor.compact.verticalAlignTop') },
    { value: 'center' as const, label: translate('editor.compact.verticalAlignCenter') },
    { value: 'bottom' as const, label: translate('editor.compact.verticalAlignBottom') },
  ];
}

function buildTextFontCommand(params: ToolCommandParams, fontLabel: string): CompactCommand {
  const settings = params.inspectorToolSettings.text;

  return {
    id: 'text-font',
    title: translate('editor.compact.font'),
    trigger: <TablerIcon icon="tabler:text-size" />,
    value: fontLabel,
    content: (
      <CompactCommandField hideLabel label={translate('editor.compact.font')} value={fontLabel}>
        <SelectField
          label={translate('editor.compact.font')}
          value={settings.fontFamily}
          onChange={(value) => params.applyTextPatch({ fontFamily: value })}
          options={params.fontOptions}
        />
      </CompactCommandField>
    ),
  };
}

function buildTextFontSizeCommand(params: ToolCommandParams): CompactCommand {
  const settings = params.inspectorToolSettings.text;
  const value = `${settings.fontSize}${translate('editor.compact.unitPx')}`;

  return {
    id: 'text-font-size',
    title: translate('editor.compact.fontSize'),
    trigger: (
      <span className="min-w-8 text-center text-xs font-semibold tracking-normal text-current">
        {value}
      </span>
    ),
    value,
    content: (
      <CompactCommandField hideLabel label={translate('editor.compact.fontSize')} value={value}>
        <SelectField
          label={translate('editor.compact.fontSize')}
          value={String(settings.fontSize)}
          options={buildFontSizeOptions(settings.fontSize)}
          onChange={(value) =>
            params.applyTextPatch({
              fontSize: params.toNumber(value, settings.fontSize),
            })
          }
        />
      </CompactCommandField>
    ),
  };
}

function buildTextAlignCommand(params: ToolCommandParams, alignLabel: string): CompactCommand {
  const settings = params.inspectorToolSettings.text;
  const options = (params.textAlignOptions ?? []).map((option) => ({
    ...option,
    icon: getTextAlignIcon(option.value),
  }));

  return {
    id: 'text-align',
    title: translate('editor.compact.textAlign'),
    trigger: getTextAlignIcon(settings.textAlign),
    value: alignLabel,
    content: (
      <CompactCommandField label={translate('editor.compact.textAlign')} value={alignLabel}>
        <SegmentedSelector
          ariaLabel={translate('editor.compact.textAlign')}
          value={settings.textAlign}
          onChange={(textAlign) => params.applyTextPatch({ textAlign })}
          options={options}
          columns={3}
        />
      </CompactCommandField>
    ),
  };
}

function buildTextVerticalAlignCommand(
  params: ToolCommandParams,
  verticalAlignLabel: string
): CompactCommand {
  const settings = params.inspectorToolSettings.text;
  const options = getTextVerticalAlignOptions(params).map((option) => ({
    ...option,
    icon: getTextVerticalAlignIcon(option.value),
  }));

  return {
    id: 'text-vertical-align',
    title: translate('editor.compact.verticalAlign'),
    trigger: getTextVerticalAlignIcon(settings.verticalAlign),
    value: verticalAlignLabel,
    content: (
      <CompactCommandField
        label={translate('editor.compact.verticalAlign')}
        value={verticalAlignLabel}
      >
        <SegmentedSelector
          ariaLabel={translate('editor.compact.verticalAlign')}
          value={settings.verticalAlign}
          onChange={(verticalAlign) => params.applyTextPatch({ verticalAlign })}
          options={options}
          columns={3}
        />
      </CompactCommandField>
    ),
  };
}

function preventTextboxSelectionLoss(event: React.MouseEvent<HTMLButtonElement>): void {
  event.preventDefault();
}

function buildTextStyleCommand(
  params: ToolCommandParams,
  options: {
    active: boolean;
    command: Parameters<ToolCommandParams['applyTextStyle']>[0];
    id: string;
    title: string;
    token: React.ReactNode;
  }
): CompactCommand {
  return {
    id: options.id,
    title: options.title,
    trigger: options.token,
    active: options.active,
    onMouseDown: preventTextboxSelectionLoss,
    onClick: () => params.applyTextStyle(options.command),
  };
}

function buildTextStyleCommands(params: ToolCommandParams): CompactCommand[] {
  const settings = params.inspectorToolSettings.text;

  return [
    buildTextStyleCommand(params, {
      active: settings.fontWeight === 'bold',
      command: 'bold',
      id: 'text-bold',
      title: translate('editor.compact.bold'),
      token: <TablerIcon icon="tabler:bold" />,
    }),
    buildTextStyleCommand(params, {
      active: settings.fontStyle === 'italic',
      command: 'italic',
      id: 'text-italic',
      title: translate('editor.compact.italic'),
      token: <TablerIcon icon="tabler:italic" />,
    }),
    buildTextStyleCommand(params, {
      active: settings.underline,
      command: 'underline',
      id: 'text-underline',
      title: translate('editor.compact.underline'),
      token: <TablerIcon icon="tabler:underline" />,
    }),
    buildTextStyleCommand(params, {
      active: settings.linethrough,
      command: 'linethrough',
      id: 'text-linethrough',
      title: translate('editor.compact.strikethrough'),
      token: <TablerIcon icon="tabler:strikethrough" />,
    }),
  ];
}

export function buildTextTypographyCommands(params: ToolCommandParams): CompactCommand[] {
  const settings = params.inspectorToolSettings.text;
  const fontLabel = resolveTextFontLabel(params, settings);
  const textAlignLabel = resolveTextAlignLabel(params, settings);
  const textVerticalAlignLabel = resolveTextVerticalAlignLabel(params, settings);

  return [
    buildTextFontCommand(params, fontLabel),
    buildTextFontSizeCommand(params),
    buildTextAlignCommand(params, textAlignLabel),
    buildTextVerticalAlignCommand(params, textVerticalAlignLabel),
    ...buildTextStyleCommands(params),
  ];
}
