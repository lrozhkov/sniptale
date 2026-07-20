import type React from 'react';
import { formatBorderShadowIntensityValue } from '../../../../features/highlighter/style';
import { translate } from '../../../../platform/i18n';
import { CompactColorSwatchTrigger, CompactCommandField, type CompactCommand } from '..';
import { ColorField, NumericRow, type NumericRowProps } from '../../../chrome/ui';
import type { ToolCommandParams } from './types';

type ShadowPatch = {
  shadow?: number;
  shadowAngle?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowDistance?: number;
};

type ShadowSettings = {
  shadow: number;
  shadowAngle?: number;
  shadowBlur?: number;
  shadowColor?: string;
  shadowDistance?: number;
};

interface ShadowCompactCommandArgs {
  applyPatch: (patch: ShadowPatch) => void;
  fallbackColor: string;
  id: string;
  icon?: CompactCommand['icon'];
  palette: readonly string[];
  params: Pick<
    ToolCommandParams,
    'commitPendingSelectionSettings' | 'previewColor' | 'recentColors' | 'updateColor'
  >;
  previewPatch: (patch: ShadowPatch) => void;
  settings: ShadowSettings;
  trigger?: React.ReactNode;
}

function ShadowRangeControl(props: {
  label: string;
  max: number;
  unit?: 'degree' | 'percent' | 'px';
  value: number;
  onChange: (value: number) => void;
  onValueCommit: () => void;
}) {
  return (
    <NumericRow
      label={props.label}
      value={props.value}
      unit={resolveShadowNumericUnit(props.unit)}
      min={0}
      max={props.max}
      step={1}
      onPreviewValue={props.onChange}
      onCommitValue={(value) => {
        props.onChange(value);
        props.onValueCommit();
      }}
      scrub={{ min: 0, max: props.max, step: 1 }}
    />
  );
}

function resolveShadowNumericUnit(
  unit: 'degree' | 'percent' | 'px' | undefined
): NumericRowProps['unit'] {
  if (unit === 'degree') {
    return 'deg';
  }

  if (unit === 'percent') {
    return '%';
  }

  return unit ?? '';
}

function ShadowColorControl(props: {
  args: ShadowCompactCommandArgs;
  label: string;
  shadowColor: string;
}) {
  const { args } = props;
  const label = translate('editor.compact.shadowColor');

  return (
    <ColorField
      title={props.label}
      label={label}
      value={props.shadowColor}
      recentColors={args.params.recentColors}
      palette={args.palette}
      onChange={(color) =>
        args.params.updateColor((next) => args.applyPatch({ shadowColor: next }), color)
      }
      onPreviewChange={(color) =>
        args.params.previewColor((next) => args.applyPatch({ shadowColor: next }), color)
      }
      onPreviewReset={(color) =>
        args.params.previewColor((next) => args.applyPatch({ shadowColor: next }), color)
      }
    />
  );
}

function ShadowCommandContent(props: {
  args: ShadowCompactCommandArgs;
  label: string;
  shadowColor: string;
}) {
  const { args } = props;

  return (
    <CompactCommandField label={props.label}>
      <div className="space-y-4">
        <ShadowRangeControl
          label={translate('editor.compact.shadowSize')}
          max={100}
          unit="percent"
          value={args.settings.shadow}
          onChange={(shadow) => args.previewPatch({ shadow })}
          onValueCommit={args.params.commitPendingSelectionSettings}
        />
        <ShadowColorControl args={args} label={props.label} shadowColor={props.shadowColor} />
        <ShadowRangeControl
          label={translate('editor.compact.shadowAngle')}
          max={360}
          unit="degree"
          value={args.settings.shadowAngle ?? 90}
          onChange={(shadowAngle) => args.previewPatch({ shadowAngle })}
          onValueCommit={args.params.commitPendingSelectionSettings}
        />
        <ShadowRangeControl
          label={translate('editor.compact.shadowDistance')}
          max={64}
          unit="px"
          value={args.settings.shadowDistance ?? 4}
          onChange={(shadowDistance) => args.previewPatch({ shadowDistance })}
          onValueCommit={args.params.commitPendingSelectionSettings}
        />
        <ShadowRangeControl
          label={translate('editor.compact.shadowBlur')}
          max={64}
          unit="px"
          value={args.settings.shadowBlur ?? 12}
          onChange={(shadowBlur) => args.previewPatch({ shadowBlur })}
          onValueCommit={args.params.commitPendingSelectionSettings}
        />
      </div>
    </CompactCommandField>
  );
}

export function buildShadowCompactCommand(args: ShadowCompactCommandArgs): CompactCommand {
  const label = translate('highlighter.editor.shadowLabel');
  const shadowColor = args.settings.shadowColor ?? args.fallbackColor;
  const shadowLabel = formatBorderShadowIntensityValue(args.settings.shadow);

  return {
    id: args.id,
    icon: args.icon ?? 'trajectory',
    title: label,
    trigger: args.trigger ?? <CompactColorSwatchTrigger color={shadowColor} mode="stroke" />,
    value: shadowLabel,
    content: <ShadowCommandContent args={args} label={label} shadowColor={shadowColor} />,
  };
}
