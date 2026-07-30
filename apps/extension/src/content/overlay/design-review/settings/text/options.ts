export type TextSelectOption = {
  label: string;
  value: string;
};

const FONT_FAMILY_VALUES = [
  'Arial, sans-serif',
  'Inter, sans-serif',
  'Manrope, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'JetBrains Mono, monospace',
  'system-ui, sans-serif',
];

const LINE_HEIGHT_VALUES = ['normal', '1', '1.15', '1.25', '1.4', '1.5', '1.75', '2'];

const LETTER_SPACING_VALUES = ['normal', '0px', '0.2px', '0.5px', '1px', '2px', '4px'];

function createValueOptions(values: readonly string[]): TextSelectOption[] {
  return values.map((value) => ({ label: value, value }));
}

function normalizeOptionKey(value: string): string {
  return value.trim().toLowerCase();
}

function addCurrentOption(
  options: readonly TextSelectOption[],
  currentValue: string,
  resolveLabel: (value: string) => string = (value) => value
): TextSelectOption[] {
  const trimmedValue = currentValue.trim();

  if (!trimmedValue) {
    return [...options];
  }

  const currentKey = normalizeOptionKey(trimmedValue);
  if (options.some((option) => normalizeOptionKey(option.value) === currentKey)) {
    return [...options];
  }

  return [{ value: currentValue, label: resolveLabel(trimmedValue) }, ...options];
}

export function getFontFamilyOptions(currentValue: string): TextSelectOption[] {
  const fontOptions = FONT_FAMILY_VALUES.map((value) => ({
    label: getPrimaryFontFamilyName(value),
    value,
  }));
  return addCurrentOption(fontOptions, currentValue, getPrimaryFontFamilyName);
}

function getPrimaryFontFamilyName(value: string): string {
  const primaryFamily = value.split(',')[0]?.trim() ?? value;
  const quotedFamily = primaryFamily.match(/^(?:"([^"]+)"|'([^']+)')$/);
  const unquotedFamily = quotedFamily?.[1] ?? quotedFamily?.[2] ?? primaryFamily;
  return unquotedFamily.toLowerCase() === 'system-ui' ? 'System UI' : unquotedFamily;
}

export function getLineHeightOptions(currentValue: string): TextSelectOption[] {
  return addCurrentOption(createValueOptions(LINE_HEIGHT_VALUES), currentValue);
}

export function getLetterSpacingOptions(currentValue: string): TextSelectOption[] {
  return addCurrentOption(createValueOptions(LETTER_SPACING_VALUES), currentValue);
}
