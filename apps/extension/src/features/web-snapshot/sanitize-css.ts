import {
  containsUnsafeCssSyntax,
  startsCssKeyword,
  startsCssUrlFunction,
} from '@sniptale/platform/security/css-safety';

export { containsUnsafeCssSyntax } from '@sniptale/platform/security/css-safety';

interface CssScanState {
  inBlockComment: boolean;
  quote: '"' | "'" | null;
}

interface CopiedCssQuotedCharacter {
  nextIndex: number;
  quote: '"' | "'" | null;
  value: string;
}

function skipCssImport(value: string, index: number): number {
  let cursor = index;
  while (cursor < value.length && value[cursor] !== ';') {
    cursor += 1;
  }
  return cursor < value.length ? cursor + 1 : cursor;
}

function skipCssUrlFunction(value: string, index: number): number {
  let cursor = index + 'url'.length;
  while (/\s/u.test(value[cursor] ?? '')) {
    cursor += 1;
  }
  if (value[cursor] !== '(') {
    return index + 1;
  }

  cursor += 1;
  let quote: '"' | "'" | null = null;
  while (cursor < value.length) {
    const char = value[cursor] ?? '';
    if (quote) {
      if (char === '\\') {
        cursor += 2;
        continue;
      }
      if (char === quote) {
        quote = null;
      }
      cursor += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      cursor += 1;
      continue;
    }
    if (char === ')') {
      return cursor + 1;
    }
    cursor += 1;
  }

  return cursor;
}

function copyCssQuotedCharacter(
  value: string,
  index: number,
  quote: '"' | "'"
): CopiedCssQuotedCharacter {
  const char = value[index] ?? '';
  const nextChar = value[index + 1] ?? '';
  if (char === '\\') {
    return {
      nextIndex: index + 2,
      quote,
      value: `${char}${nextChar}`,
    };
  }

  return {
    nextIndex: index + 1,
    quote: char === quote ? null : quote,
    value: char,
  };
}

function skipLiteralCssFetch(value: string, index: number): number | null {
  if (startsCssKeyword(value, index, '@import')) {
    return skipCssImport(value, index);
  }
  if (startsCssUrlFunction(value, index)) {
    return skipCssUrlFunction(value, index);
  }
  return null;
}

function advanceCssBlockComment(value: string, index: number, state: CssScanState): number | null {
  const char = value[index] ?? '';
  const nextChar = value[index + 1] ?? '';
  if (!state.inBlockComment) {
    return null;
  }
  if (char === '*' && nextChar === '/') {
    state.inBlockComment = false;
    return index + 2;
  }
  return index + 1;
}

function stripLiteralCssFetchSyntax(value: string): string {
  let sanitized = '';
  const state: CssScanState = { inBlockComment: false, quote: null };

  for (let index = 0; index < value.length; ) {
    const char = value[index] ?? '';
    const nextChar = value[index + 1] ?? '';

    const commentIndex = advanceCssBlockComment(value, index, state);
    if (commentIndex !== null) {
      index = commentIndex;
      continue;
    }

    if (!state.quote && char === '/' && nextChar === '*') {
      state.inBlockComment = true;
      index += 2;
      continue;
    }

    if (state.quote) {
      const copied = copyCssQuotedCharacter(value, index, state.quote);
      sanitized += copied.value;
      state.quote = copied.quote;
      index = copied.nextIndex;
      continue;
    }

    if (char === '"' || char === "'") {
      state.quote = char;
      sanitized += char;
      index += 1;
      continue;
    }

    const nextIndex = skipLiteralCssFetch(value, index);
    if (nextIndex !== null) {
      index = nextIndex;
      continue;
    }

    sanitized += char;
    index += 1;
  }

  return sanitized;
}

export function sanitizeWebSnapshotCssText(value: string): string {
  const sanitized = stripLiteralCssFetchSyntax(value);
  return containsUnsafeCssSyntax(sanitized) ? '' : sanitized;
}
