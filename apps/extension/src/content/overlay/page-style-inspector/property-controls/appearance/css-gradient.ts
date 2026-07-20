type CssGradientMode = 'linear' | 'none' | 'unsupported';

export type CssLinearGradient = {
  angle: number;
  from: string;
  to: string;
};

const DEFAULT_GRADIENT: CssLinearGradient = {
  angle: 90,
  from: '#ffffff',
  to: '#000000',
};

function normalizeAngle(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_GRADIENT.angle;
  }

  return Math.round(((value % 360) + 360) % 360);
}

export function createDefaultLinearGradient(): CssLinearGradient {
  return { ...DEFAULT_GRADIENT };
}

function isNoneGradientValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'none';
}

function isCssWhitespace(character: string | undefined): boolean {
  return character === ' ' || character === '\n' || character === '\t';
}

function readTrailingToken(value: string): { startIndex: number; token: string } | null {
  let tokenEnd = value.length - 1;
  while (isCssWhitespace(value[tokenEnd])) {
    tokenEnd -= 1;
  }

  if (tokenEnd < 0) {
    return null;
  }

  let tokenStart = tokenEnd;
  while (tokenStart >= 0 && !isCssWhitespace(value[tokenStart])) {
    tokenStart -= 1;
  }

  return {
    startIndex: tokenStart + 1,
    token: value.slice(tokenStart + 1, tokenEnd + 1),
  };
}

function parseGradientColorStop(value: string, fallback: string): string {
  const trimmed = value.trim();
  const trailingToken = readTrailingToken(trimmed);
  if (!trailingToken) {
    return fallback;
  }

  if (
    trailingToken.token.endsWith('%') &&
    Number.isFinite(Number(trailingToken.token.slice(0, -1)))
  ) {
    return trimmed.slice(0, trailingToken.startIndex).trim() || fallback;
  }

  return trimmed || fallback;
}

function splitTopLevelCommaList(value: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let partStartIndex = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth < 0) {
        return null;
      }
    } else if (character === ',' && depth === 0) {
      parts.push(value.slice(partStartIndex, index).trim());
      partStartIndex = index + 1;
    }
  }

  if (depth !== 0) {
    return null;
  }

  parts.push(value.slice(partStartIndex).trim());
  return parts.filter(Boolean);
}

export function parseCssLinearGradient(value: string): CssLinearGradient | null {
  const trimmed = value.trim();
  if (!trimmed.toLowerCase().startsWith('linear-gradient(') || !trimmed.endsWith(')')) {
    return null;
  }

  const inner = trimmed.slice('linear-gradient('.length, -1);
  const parts = splitTopLevelCommaList(inner);
  if (!parts) {
    return null;
  }
  const anglePart = parts[0]?.toLowerCase().endsWith('deg') ? parts.shift() : null;
  if (parts.length !== 2) {
    return null;
  }

  return {
    angle: normalizeAngle(anglePart ? Number(anglePart.slice(0, -3)) : DEFAULT_GRADIENT.angle),
    from: parseGradientColorStop(parts[0] ?? '', DEFAULT_GRADIENT.from),
    to: parseGradientColorStop(parts[1] ?? '', DEFAULT_GRADIENT.to),
  };
}

export function serializeCssLinearGradient(gradient: CssLinearGradient): string {
  return [
    `linear-gradient(${normalizeAngle(gradient.angle)}deg`,
    `${gradient.from.trim() || DEFAULT_GRADIENT.from} 0%`,
    `${gradient.to.trim() || DEFAULT_GRADIENT.to} 100%)`,
  ].join(', ');
}

export function resolveCssGradient(value: string): {
  gradient: CssLinearGradient;
  mode: CssGradientMode;
} {
  if (isNoneGradientValue(value)) {
    return { gradient: createDefaultLinearGradient(), mode: 'none' };
  }

  const parsed = parseCssLinearGradient(value);
  return parsed
    ? { gradient: parsed, mode: 'linear' }
    : { gradient: createDefaultLinearGradient(), mode: 'unsupported' };
}
