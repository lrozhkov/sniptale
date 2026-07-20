import { NumericRow, type NumericRowProps } from '../../chrome/ui';

export function resolveInspectorNumericUnit(
  valueText: string,
  options: { degree?: boolean } = {}
): NumericRowProps['unit'] {
  if (valueText.endsWith('%')) {
    return '%';
  }
  if (valueText.endsWith('px')) {
    return 'px';
  }
  if (options.degree && valueText.endsWith('°')) {
    return 'deg';
  }
  if (valueText.endsWith('x')) {
    return 'x';
  }
  return '';
}

export type InspectorNumericRowOptions = {
  ariaLabel?: string;
  key?: string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  scalePercent?: boolean;
  step?: number;
  unit?: NumericRowProps['unit'];
  value: number;
  valueText: string;
};

export function renderInspectorNumericRow(
  options: InspectorNumericRowOptions & { commit: () => void }
) {
  const percent = options.scalePercent === true && options.valueText.endsWith('%');
  const step = options.step ?? (percent ? 0.05 : 1);
  const viewValue = percent ? Math.round(options.value * 100) : options.value;
  const viewMin = percent ? Math.round(options.min * 100) : options.min;
  const viewMax = percent ? Math.round(options.max * 100) : options.max;
  const viewStep = percent ? Math.round(step * 100) : step;
  const toModelValue = (value: number) => (percent ? value / 100 : value);

  return (
    <NumericRow
      key={options.key}
      label={options.label}
      value={viewValue}
      unit={options.unit ?? resolveInspectorNumericUnit(options.valueText)}
      min={viewMin}
      max={viewMax}
      step={viewStep}
      onPreviewValue={(nextValue) => options.onChange(toModelValue(nextValue))}
      onCommitValue={(nextValue) => {
        options.onChange(toModelValue(nextValue));
        options.commit();
      }}
      scrub={{ min: viewMin, max: viewMax, step: viewStep }}
    />
  );
}
