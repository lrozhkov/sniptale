export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export type CompactInspectorUnit = 'px' | '%' | 'deg' | 's' | 'x' | '';

export type CompactInspectorNumericScrub = {
  min: number;
  max: number;
  step?: number | undefined;
  toValue?: ((scrubValue: number) => number) | undefined;
  value?: number | undefined;
};

type CompactInspectorNumericFormat = {
  precision?: number | undefined;
  unit?: CompactInspectorUnit | undefined;
};

export function clampNumber(value: number, min?: number, max?: number): number {
  if (!Number.isFinite(value)) {
    return min ?? 0;
  }

  return Math.min(max ?? value, Math.max(min ?? value, value));
}

export function resolveCompactUnitLabel(unit: CompactInspectorUnit = ''): string {
  return unit === 'deg' ? '°' : unit;
}

export function formatCompactEditNumber(
  value: number | null,
  { precision }: Pick<CompactInspectorNumericFormat, 'precision'> = {}
): string {
  if (value === null) {
    return '';
  }
  if (!Number.isFinite(value)) {
    return '0';
  }

  const normalizedPrecision = precision ?? (Number.isInteger(value) ? 0 : 2);
  const fixed = value.toFixed(normalizedPrecision);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

export function parseCompactNumber(value: string, unit: CompactInspectorUnit = ''): number | null {
  const trimmed = value.trim();
  const unitLabel = resolveCompactUnitLabel(unit);
  const withoutApiUnit = unit && trimmed.endsWith(unit) ? trimmed.slice(0, -unit.length) : trimmed;
  const withoutUnit =
    unitLabel && withoutApiUnit.endsWith(unitLabel)
      ? withoutApiUnit.slice(0, -unitLabel.length)
      : withoutApiUnit;
  const parsed = Number(withoutUnit.trim());
  return Number.isFinite(parsed) ? parsed : null;
}
