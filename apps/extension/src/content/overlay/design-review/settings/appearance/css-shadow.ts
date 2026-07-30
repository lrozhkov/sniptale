type CssShadowMode = 'enabled' | 'none' | 'unsupported';

export type CssBoxShadow = {
  blur: string;
  color: string;
  spread: string;
  x: string;
  y: string;
};

const DEFAULT_SHADOW: CssBoxShadow = {
  blur: '18px',
  color: 'rgba(0, 0, 0, 0.2)',
  spread: '0px',
  x: '0px',
  y: '8px',
};

function normalizeLength(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return fallback;
  }

  return trimmed.endsWith('px') ? trimmed : `${trimmed}px`;
}

function isCssWhitespace(character: string | undefined): boolean {
  return character === ' ' || character === '\n' || character === '\t';
}

function readNextToken(
  source: string,
  startIndex: number
): { endIndex: number; token: string } | null {
  let tokenStart = startIndex;
  while (isCssWhitespace(source[tokenStart])) {
    tokenStart += 1;
  }

  if (tokenStart >= source.length) {
    return null;
  }

  let tokenEnd = tokenStart;
  while (tokenEnd < source.length && !isCssWhitespace(source[tokenEnd])) {
    tokenEnd += 1;
  }

  return { endIndex: tokenEnd, token: source.slice(tokenStart, tokenEnd) };
}

function parseLengthToken(source: string, startIndex: number) {
  const nextToken = readNextToken(source, startIndex);
  if (!nextToken) {
    return null;
  }

  const lengthValue = nextToken.token.endsWith('px')
    ? nextToken.token.slice(0, -2)
    : nextToken.token;
  return Number.isFinite(Number(lengthValue))
    ? { endIndex: nextToken.endIndex, value: nextToken.token }
    : null;
}

export function createDefaultBoxShadow(): CssBoxShadow {
  return { ...DEFAULT_SHADOW };
}

function isNoneShadowValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '' || normalized === 'none';
}

export function parseCssBoxShadow(value: string): CssBoxShadow | null {
  const x = parseLengthToken(value, 0);
  const y = x ? parseLengthToken(value, x.endIndex) : null;
  if (!x || !y) {
    return null;
  }
  const blur = parseLengthToken(value, y.endIndex);
  const spread = parseLengthToken(value, blur?.endIndex ?? y.endIndex);
  const colorStartIndex = spread?.endIndex ?? blur?.endIndex ?? y.endIndex;
  const color = value.slice(colorStartIndex).trim();

  return {
    x: normalizeLength(x.value, DEFAULT_SHADOW.x),
    y: normalizeLength(y.value, DEFAULT_SHADOW.y),
    blur: normalizeLength(blur?.value, DEFAULT_SHADOW.blur),
    spread: normalizeLength(spread?.value, DEFAULT_SHADOW.spread),
    color: color || DEFAULT_SHADOW.color,
  };
}

export function serializeCssBoxShadow(shadow: CssBoxShadow): string {
  return [shadow.x, shadow.y, shadow.blur, shadow.spread, shadow.color].join(' ');
}

export function resolveCssBoxShadow(value: string): {
  mode: CssShadowMode;
  shadow: CssBoxShadow;
} {
  if (isNoneShadowValue(value)) {
    return { mode: 'none', shadow: createDefaultBoxShadow() };
  }

  const parsed = parseCssBoxShadow(value);
  return parsed
    ? { mode: 'enabled', shadow: parsed }
    : { mode: 'unsupported', shadow: createDefaultBoxShadow() };
}
