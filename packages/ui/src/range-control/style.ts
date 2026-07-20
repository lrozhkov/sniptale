import type { CSSProperties, InputHTMLAttributes } from 'react';

type RangeInputValue = InputHTMLAttributes<HTMLInputElement>['value'];
type RangeInputDefaultValue = InputHTMLAttributes<HTMLInputElement>['defaultValue'];
type RangeVisualStyle = CSSProperties & { '--sniptale-range-fill-ratio': string };

interface RangeVisualStyleArgs {
  defaultValue?: RangeInputDefaultValue | undefined;
  max?: number | string | undefined;
  min?: number | string | undefined;
  style?: CSSProperties | undefined;
  value?: RangeInputValue | undefined;
}

export function resolveRangeVisualStyle(args: RangeVisualStyleArgs): CSSProperties {
  const range = resolveRangeBounds(args.min, args.max);
  const rawValue =
    parseFiniteNumber(args.value) ?? parseFiniteNumber(args.defaultValue) ?? range.min;
  const ratio = clampRatio((rawValue - range.min) / (range.max - range.min));

  return {
    ...args.style,
    '--sniptale-range-fill-ratio': formatRangeFillRatio(ratio),
  } as RangeVisualStyle;
}

function resolveRangeBounds(min: number | string | undefined, max: number | string | undefined) {
  const parsedMin = parseFiniteNumber(min);
  const parsedMax = parseFiniteNumber(max);

  if (parsedMin !== null && parsedMax !== null && parsedMax > parsedMin) {
    return { min: parsedMin, max: parsedMax };
  }

  return { min: 0, max: 100 };
}

function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function clampRatio(value: number) {
  return Math.min(1, Math.max(0, value));
}

function formatRangeFillRatio(ratio: number) {
  return `${Math.round(ratio * 1000) / 10}%`;
}
