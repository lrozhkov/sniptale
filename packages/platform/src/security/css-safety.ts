const CSS_HEX_ESCAPE_PATTERN = /^[0-9a-fA-F]{1,6}\s?/u;
const MAX_CSS_CODE_POINT = 0x10ffff;

interface CssScanState {
  inBlockComment: boolean;
  quote: '"' | "'" | null;
}

function readCssEscape(value: string, index: number): { nextIndex: number; value: string } {
  const afterSlash = value.slice(index + 1);
  const hexMatch = CSS_HEX_ESCAPE_PATTERN.exec(afterSlash);
  if (hexMatch) {
    const hexValue = hexMatch[0].trim();
    const codePoint = Number.parseInt(hexValue, 16);
    return {
      nextIndex: index + 1 + hexMatch[0].length,
      value:
        Number.isFinite(codePoint) && codePoint <= MAX_CSS_CODE_POINT
          ? String.fromCodePoint(codePoint)
          : '',
    };
  }

  return {
    nextIndex: Math.min(index + 2, value.length),
    value: value[index + 1] ?? '',
  };
}

function normalizeCssForFetchDetection(value: string): string {
  let normalized = '';
  const state: CssScanState = { inBlockComment: false, quote: null };

  for (let index = 0; index < value.length; ) {
    const char = value[index] ?? '';
    const nextChar = value[index + 1] ?? '';
    if (state.inBlockComment) {
      if (char === '*' && nextChar === '/') {
        state.inBlockComment = false;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }

    if (!state.quote && char === '/' && nextChar === '*') {
      state.inBlockComment = true;
      index += 2;
      continue;
    }

    if (char === '\\') {
      const escaped = readCssEscape(value, index);
      normalized += escaped.value;
      index = escaped.nextIndex;
      continue;
    }

    normalized += char;
    index += 1;
  }

  return normalized.toLowerCase();
}

export function startsCssKeyword(value: string, index: number, keyword: string): boolean {
  if (index + keyword.length > value.length) {
    return false;
  }

  for (let offset = 0; offset < keyword.length; offset += 1) {
    if ((value[index + offset] ?? '').toLowerCase() !== keyword[offset]) {
      return false;
    }
  }

  return true;
}

export function startsCssUrlFunction(value: string, index: number): boolean {
  if (!startsCssKeyword(value, index, 'url')) {
    return false;
  }

  let cursor = index + 'url'.length;
  while (/\s/u.test(value[cursor] ?? '')) {
    cursor += 1;
  }
  return value[cursor] === '(';
}

function startsCssProtocol(value: string, index: number, protocol: string): boolean {
  if (!startsCssKeyword(value, index, protocol)) {
    return false;
  }

  let cursor = index + protocol.length;
  while (/\s/u.test(value[cursor] ?? '')) {
    cursor += 1;
  }
  return value[cursor] === ':';
}

function startsCssFunction(value: string, index: number, functionName: string): boolean {
  if (!startsCssKeyword(value, index, functionName)) {
    return false;
  }

  let cursor = index + functionName.length;
  while (/\s/u.test(value[cursor] ?? '')) {
    cursor += 1;
  }
  return value[cursor] === '(';
}

export function containsUnsafeCssSyntax(value: string): boolean {
  const normalized = normalizeCssForFetchDetection(value);
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index] ?? '';
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (
      normalized.startsWith('@import', index) ||
      startsCssUrlFunction(normalized, index) ||
      startsCssFunction(normalized, index, 'expression') ||
      startsCssProtocol(normalized, index, 'javascript') ||
      startsCssProtocol(normalized, index, 'data')
    ) {
      return true;
    }
  }

  return false;
}
