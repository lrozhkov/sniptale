type TextDecorationLine = 'line-through' | 'underline';

const TEXT_DECORATION_LINE_ORDER: TextDecorationLine[] = ['underline', 'line-through'];

function isTextDecorationLine(value: string): value is TextDecorationLine {
  return value === 'underline' || value === 'line-through';
}

export function getTextDecorationLines(value: string): TextDecorationLine[] {
  const tokens = value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const lines = new Set(tokens.filter(isTextDecorationLine));
  return TEXT_DECORATION_LINE_ORDER.filter((line) => lines.has(line));
}

export function hasTextDecorationLine(value: string, line: TextDecorationLine): boolean {
  return getTextDecorationLines(value).includes(line);
}

export function toggleTextDecorationLine(value: string, line: TextDecorationLine): string {
  const lines = new Set(getTextDecorationLines(value));

  if (lines.has(line)) {
    lines.delete(line);
  } else {
    lines.add(line);
  }

  const nextValue = TEXT_DECORATION_LINE_ORDER.filter((item) => lines.has(item)).join(' ');
  return nextValue || 'none';
}
