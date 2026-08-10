import { CompactCommandField, CompactCommandToken, type CompactCommand } from '..';
import { NumericRow, type NumericRowProps } from '../../../chrome/ui';
import type React from 'react';

export function buildRangeCompactCommand(args: {
  id: string;
  icon: 'opacity' | 'size';
  label: string;
  token: 'OP' | 'PX' | 'SM' | 'RAD';
  trigger?: React.ReactNode;
  value: number;
  valueText: string;
  min: number;
  max: number;
  step?: number;
  onChange: (rawValue: string) => void;
  onValueCommit?: () => void;
}): CompactCommand {
  const percentUnit = args.valueText.endsWith('%');
  const percentRatio = percentUnit && args.max <= 1;
  const value = percentRatio ? Math.round(args.value * 100) : args.value;
  const min = percentRatio ? Math.round(args.min * 100) : args.min;
  const max = percentRatio ? Math.round(args.max * 100) : args.max;
  const step = percentRatio ? Math.round((args.step ?? 0.05) * 100) : args.step;
  const toCommandValue = (nextValue: number) => (percentRatio ? nextValue / 100 : nextValue);

  return {
    id: args.id,
    icon: args.icon,
    title: args.label,
    trigger: args.trigger ?? <CompactCommandToken>{args.token}</CompactCommandToken>,
    value: args.valueText,
    content: (
      <CompactCommandField label={args.label} value={args.valueText}>
        <NumericRow
          label={args.label}
          unit={resolveRangeCommandUnit(args.valueText)}
          min={min}
          max={max}
          step={step}
          value={value}
          onPreviewValue={(nextValue) => args.onChange(String(toCommandValue(nextValue)))}
          onCommitValue={(nextValue) => {
            args.onChange(String(toCommandValue(nextValue)));
            args.onValueCommit?.();
          }}
          scrub={{ min, max, step }}
        />
      </CompactCommandField>
    ),
  };
}

function resolveRangeCommandUnit(valueText: string): NumericRowProps['unit'] {
  if (valueText.endsWith('%')) {
    return '%';
  }

  if (valueText.endsWith('px')) {
    return 'px';
  }

  if (valueText.endsWith('°')) {
    return 'deg';
  }

  return '';
}
