const CSS_HEX_ESCAPE_PATTERN = /^[0-9a-fA-F]{1,6}[ \n\t]?/u;
const MAX_CSS_CODE_POINT = 0x10ffff;

function preprocessCssInput(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\f/g, '\n').replace(/\0/g, '\uFFFD');
}

function readCssEscape(value: string, index: number): { nextIndex: number; value: string } {
  const afterSlash = value.slice(index + 1);
  if (afterSlash.startsWith('\n')) {
    return { nextIndex: Math.min(index + 2, value.length), value: '' };
  }
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
  const source = preprocessCssInput(value);
  let normalized = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < source.length; ) {
    const char = source[index] ?? '';
    const nextChar = source[index + 1] ?? '';
    if (quote) {
      if (char === '\\') {
        index = readCssEscape(source, index).nextIndex;
        continue;
      }
      if (char === '\n') {
        quote = null;
        normalized += ' ';
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      index += 2;
      while (index < source.length && source.slice(index, index + 2) !== '*/') {
        index += 1;
      }
      index = Math.min(index + 2, source.length);
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      normalized += ' ';
      index += 1;
      continue;
    }

    if (char === '\\') {
      const escaped = readCssEscape(source, index);
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

export function containsCssFunction(value: string, functionName: string): boolean {
  const normalized = normalizeCssForFetchDetection(value);

  for (let index = 0; index < normalized.length; index += 1) {
    if (startsCssFunction(normalized, index, functionName.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export function containsUnsafeCssSyntax(value: string): boolean {
  const normalized = normalizeCssForFetchDetection(value);

  for (let index = 0; index < normalized.length; index += 1) {
    if (
      normalized.startsWith('@import', index) ||
      startsCssUrlFunction(normalized, index) ||
      startsCssFunction(normalized, index, 'expression') ||
      startsCssFunction(normalized, index, 'image') ||
      startsCssFunction(normalized, index, 'image-set') ||
      startsCssFunction(normalized, index, '-webkit-image-set') ||
      startsCssFunction(normalized, index, 'src') ||
      startsCssFunction(normalized, index, 'var') ||
      startsCssProtocol(normalized, index, 'javascript') ||
      startsCssProtocol(normalized, index, 'data')
    ) {
      return true;
    }
  }

  return false;
}
