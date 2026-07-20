export function splitCssLength(value: string): { numberText: string; unit: string } {
  const trimmed = value.trim();
  const numberText = readCssLengthNumber(trimmed);

  if (!numberText) {
    return { numberText: value, unit: '' };
  }

  const unit = trimmed.slice(numberText.length);
  if (!isCssLengthUnit(unit)) {
    return { numberText: value, unit: '' };
  }

  return { numberText, unit: unit || 'px' };
}

export function isCssNumericLength(value: string): boolean {
  const parsed = splitCssLength(value);
  return parsed.unit.length > 0 && parsed.numberText !== value;
}

export function normalizeCssLengthInput(
  rawValue: string,
  fallbackValue: string | undefined,
  defaultUnit = 'px'
): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return rawValue;
  }

  if (isUnitlessNumberText(trimmed)) {
    return `${trimmed}${splitCssLength(fallbackValue ?? '').unit || defaultUnit}`;
  }

  return rawValue;
}

function isUnitlessNumberText(value: string): boolean {
  const normalized = value.replace(',', '.');
  if (!Number.isFinite(Number(normalized))) {
    return false;
  }

  return normalized.split('.').length <= 2 && !/[a-z%]/i.test(normalized);
}

function readCssLengthNumber(value: string): string {
  let cursor = value.startsWith('-') ? 1 : 0;
  let hasDigit = false;
  let hasDecimalSeparator = false;

  while (cursor < value.length) {
    const char = value[cursor];
    if (char && char >= '0' && char <= '9') {
      hasDigit = true;
      cursor += 1;
      continue;
    }

    if ((char === '.' || char === ',') && !hasDecimalSeparator) {
      hasDecimalSeparator = true;
      cursor += 1;
      continue;
    }

    break;
  }

  return hasDigit ? value.slice(0, cursor) : '';
}

function isCssLengthUnit(unit: string): boolean {
  for (const char of unit) {
    const lower = char.toLowerCase();
    if ((lower < 'a' || lower > 'z') && lower !== '%') {
      return false;
    }
  }

  return true;
}

export function stepCssLength(
  value: string,
  fallbackValue: string | undefined,
  direction: -1 | 1
): string {
  const parsed = splitCssLength(value);
  const fallbackUnit = splitCssLength(fallbackValue ?? '').unit || 'px';
  const numericValue = Number(parsed.numberText.replace(',', '.'));

  if (!Number.isFinite(numericValue)) {
    return `${direction}${parsed.unit || fallbackUnit}`;
  }

  return `${numericValue + direction}${parsed.unit || fallbackUnit}`;
}
