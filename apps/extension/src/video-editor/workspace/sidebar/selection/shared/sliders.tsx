import { NumericRow } from '../../../../../ui/compact-inspector-controls';
import type { CompactInspectorUnit } from '../../../../../ui/compact-inspector-controls/shared';
import { useDedupedNumberChange } from './number-commit';

type SliderDisplayMapping = {
  max: number;
  min: number;
  precision: number | undefined;
  step: number;
  toDomainValue: (value: number) => number;
  unit: CompactInspectorUnit;
  value: number;
};

type SliderFieldProps = {
  disabled?: boolean;
  formatValue?: (value: number) => string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
  scrubMax?: number;
  scrubMin?: number;
  scrubStep?: number;
  scrubValue?: number;
  scrubValueToDisplayValue?: (value: number) => number;
  step?: number;
  value: number;
};

function resolveSliderPrecision(step: number | undefined) {
  if (!step || Number.isInteger(step)) {
    return 0;
  }
  const fraction = String(step).split('.')[1];
  return fraction ? Math.min(fraction.length, 3) : undefined;
}

function isCompactInspectorUnit(value: string): value is CompactInspectorUnit {
  return (
    value === '' ||
    value === '%' ||
    value === 'px' ||
    value === 'deg' ||
    value === 's' ||
    value === 'x'
  );
}

function readLeadingNumber(input: string): { length: number; value: number } | null {
  let index = input.startsWith('-') ? 1 : 0;
  let hasDigit = false;
  while (index < input.length && isAsciiDigit(input[index])) {
    hasDigit = true;
    index += 1;
  }
  if (input[index] === '.' || input[index] === ',') {
    index += 1;
    while (index < input.length && isAsciiDigit(input[index])) {
      hasDigit = true;
      index += 1;
    }
  }
  if (!hasDigit) {
    return null;
  }
  const parsed = Number(input.slice(0, index).replace(',', '.'));
  return Number.isFinite(parsed) ? { length: index, value: parsed } : null;
}

function isAsciiDigit(value: string | undefined): boolean {
  return value !== undefined && value >= '0' && value <= '9';
}

function readFormattedSliderNumber(
  value: number,
  formatter?: (value: number) => string
): { unit: CompactInspectorUnit; value: number } | null {
  if (!formatter) {
    return null;
  }

  const formatted = formatter(value).trim();
  const parsed = readLeadingNumber(formatted);
  if (!parsed) {
    return null;
  }
  const unit = formatted.slice(parsed.length).trimStart();
  if (!isCompactInspectorUnit(unit)) {
    return null;
  }
  return { unit, value: parsed.value };
}

function resolveSliderDisplayMapping(args: {
  formatValue?: ((value: number) => string) | undefined;
  max: number;
  min: number;
  step: number;
  value: number;
}): SliderDisplayMapping {
  const formattedMin = readFormattedSliderNumber(args.min, args.formatValue);
  const formattedMax = readFormattedSliderNumber(args.max, args.formatValue);
  const formattedValue = readFormattedSliderNumber(args.value, args.formatValue);
  const canMapFormattedRange =
    formattedMin &&
    formattedMax &&
    formattedValue &&
    formattedMin.unit === formattedMax.unit &&
    formattedMin.unit === formattedValue.unit &&
    formattedMax.value !== formattedMin.value &&
    args.max !== args.min;

  if (!canMapFormattedRange) {
    return {
      max: args.max,
      min: args.min,
      precision: resolveSliderPrecision(args.step),
      step: args.step,
      toDomainValue: (value) => value,
      unit: formattedValue?.unit ?? '',
      value: args.value,
    };
  }

  const displayRange = formattedMax.value - formattedMin.value;
  const domainRange = args.max - args.min;
  const displayStep = Math.abs((args.step * displayRange) / domainRange);
  return {
    max: formattedMax.value,
    min: formattedMin.value,
    precision: resolveSliderPrecision(displayStep),
    step: displayStep,
    toDomainValue: (value) =>
      args.min + ((value - formattedMin.value) * domainRange) / displayRange,
    unit: formattedValue.unit,
    value: formattedValue.value,
  };
}

function resolveSliderUnit(
  value: number,
  formatter?: (value: number) => string
): CompactInspectorUnit {
  const formatted = readFormattedSliderNumber(value, formatter);
  return formatted?.unit ?? '';
}

function resolveSliderScrub(props: SliderFieldProps, display: SliderDisplayMapping, step: number) {
  return {
    max: props.scrubValue === undefined ? display.max : (props.scrubMax ?? props.max),
    min: props.scrubValue === undefined ? display.min : (props.scrubMin ?? props.min),
    step: props.scrubValue === undefined ? display.step : (props.scrubStep ?? step),
    ...(props.scrubValue === undefined ? {} : { value: props.scrubValue }),
    ...(props.scrubValueToDisplayValue === undefined
      ? {}
      : { toValue: props.scrubValueToDisplayValue }),
  };
}

export function SliderField(props: SliderFieldProps) {
  const disabledProps = props.disabled === undefined ? {} : { disabled: props.disabled };
  const changeValue = useDedupedNumberChange(props.onChange);
  const separateCommitValue = useDedupedNumberChange(props.onCommit ?? props.onChange);
  const commitValue = props.onCommit ? separateCommitValue : changeValue;
  const step = props.step ?? 1;
  const display = resolveSliderDisplayMapping({
    formatValue: props.formatValue,
    max: props.max,
    min: props.min,
    step,
    value: props.value,
  });
  const previewValue = (value: number) => {
    const nextValue = display.toDomainValue(value);
    if (props.onCommit) {
      props.onChange(nextValue);
      return;
    }
    changeValue(nextValue);
  };
  const commitDisplayValue = (value: number) => {
    commitValue(display.toDomainValue(value));
  };

  return (
    <NumericRow
      label={props.label}
      max={display.max}
      min={display.min}
      precision={display.precision}
      scrub={resolveSliderScrub(props, display, step)}
      step={display.step}
      unit={resolveSliderUnit(props.value, props.formatValue) || display.unit}
      value={display.value}
      {...disabledProps}
      onPreviewValue={previewValue}
      onCommitValue={commitDisplayValue}
    />
  );
}
