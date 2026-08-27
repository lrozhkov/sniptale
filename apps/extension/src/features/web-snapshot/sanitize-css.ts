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

type WebSnapshotCssUrlRewriter = (url: string) => string | null;

interface ParsedCssUrlFunction {
  nextIndex: number;
  url: string;
}

interface ParsedCssString {
  nextIndex: number;
  url: string;
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

function parseCssUrlFunction(value: string, index: number): ParsedCssUrlFunction | null {
  let cursor = index + 'url'.length;
  while (/\s/u.test(value[cursor] ?? '')) {
    cursor += 1;
  }
  cursor += 1;
  while (/\s/u.test(value[cursor] ?? '')) {
    cursor += 1;
  }
  const quote = value[cursor] === '"' || value[cursor] === "'" ? value[cursor] : null;
  if (quote) cursor += 1;
  const start = cursor;

  while (cursor < value.length) {
    const char = value[cursor] ?? '';
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (quote ? char === quote : char === ')') {
      const url = value.slice(start, cursor).trim();
      cursor += 1;
      if (quote) {
        while (/\s/u.test(value[cursor] ?? '')) cursor += 1;
        if (value[cursor] !== ')') return null;
        cursor += 1;
      }
      return { nextIndex: cursor, url };
    }
    cursor += 1;
  }

  return null;
}

function parseCssString(value: string, index: number): ParsedCssString | null {
  const quote = value[index];
  if (quote !== '"' && quote !== "'") return null;
  let cursor = index + 1;
  const start = cursor;
  while (cursor < value.length) {
    const char = value[cursor] ?? '';
    if (char === '\\') {
      cursor += 2;
      continue;
    }
    if (char === quote) {
      return { nextIndex: cursor + 1, url: value.slice(start, cursor) };
    }
    if (char === '\n' || char === '\r' || char === '\f') return null;
    cursor += 1;
  }
  return null;
}

function serializeCssUrl(url: string): string {
  const escaped = url
    .replace(/\\/gu, '\\\\')
    .replace(/"/gu, '\\"')
    .replace(/[\n\r\f]/gu, '');
  return `url("${escaped}")`;
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

type CssResourceScan = {
  nextIndex: number;
  safetyProjection: string;
  sanitized: string;
};

function rewriteCssImportAt(
  value: string,
  index: number,
  rewriteUrl?: WebSnapshotCssUrlRewriter
): CssResourceScan | null {
  if (!startsCssKeyword(value, index, '@import')) return null;
  const importEnd = skipCssImport(value, index);
  let cursor = index + '@import'.length;
  while (/\s/u.test(value[cursor] ?? '')) cursor += 1;
  const parsed = startsCssUrlFunction(value, cursor)
    ? parseCssUrlFunction(value, cursor)
    : parseCssString(value, cursor);
  const rewritten = parsed ? (rewriteUrl?.(parsed.url) ?? null) : null;
  if (!parsed || rewritten === null || parsed.nextIndex > importEnd) {
    return { nextIndex: importEnd, safetyProjection: '', sanitized: '' };
  }

  const suffixEnd = value[importEnd - 1] === ';' ? importEnd - 1 : importEnd;
  const suffix = value.slice(parsed.nextIndex, suffixEnd);
  return {
    nextIndex: importEnd,
    safetyProjection: `resource-token${suffix};`,
    sanitized: `@import ${serializeCssUrl(rewritten)}${suffix};`,
  };
}

function rewriteCssUrlAt(
  value: string,
  index: number,
  rewriteUrl?: WebSnapshotCssUrlRewriter
): CssResourceScan | null {
  if (!startsCssUrlFunction(value, index)) return null;
  const parsed = parseCssUrlFunction(value, index);
  if (!parsed) {
    return {
      nextIndex: skipCssUrlFunction(value, index),
      safetyProjection: '',
      sanitized: '',
    };
  }
  const rewritten = rewriteUrl?.(parsed.url) ?? null;
  return {
    nextIndex: parsed.nextIndex,
    safetyProjection: rewritten === null ? '' : 'resource-token',
    sanitized: rewritten === null ? '' : serializeCssUrl(rewritten),
  };
}

function rewriteCssResourceAt(
  value: string,
  index: number,
  rewriteUrl?: WebSnapshotCssUrlRewriter
): CssResourceScan | null {
  return rewriteCssImportAt(value, index, rewriteUrl) ?? rewriteCssUrlAt(value, index, rewriteUrl);
}

function stripOrRewriteLiteralCssFetchSyntax(
  value: string,
  rewriteUrl?: WebSnapshotCssUrlRewriter
): { sanitized: string; safetyProjection: string } {
  let sanitized = '';
  let safetyProjection = '';
  const state: CssScanState = { inBlockComment: false, quote: null };

  for (let index = 0; index < value.length;) {
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
      safetyProjection += copied.value;
      state.quote = copied.quote;
      index = copied.nextIndex;
      continue;
    }

    if (char === '"' || char === "'") {
      state.quote = char;
      sanitized += char;
      safetyProjection += char;
      index += 1;
      continue;
    }

    const resource = rewriteCssResourceAt(value, index, rewriteUrl);
    if (resource) {
      sanitized += resource.sanitized;
      safetyProjection += resource.safetyProjection;
      index = resource.nextIndex;
      continue;
    }

    sanitized += char;
    safetyProjection += char;
    index += 1;
  }

  return { sanitized, safetyProjection };
}

function removeLiteralVarFunctionNames(value: string): string {
  return value.replace(/\bvar\s*\(/giu, '(');
}

function splitStylesheetRules(cssText: string): string[] {
  const rules: string[] = [];
  let blockDepth = 0;
  let inComment = false;
  let quote: '"' | "'" | null = null;
  let start = 0;
  for (let index = 0; index < cssText.length; index += 1) {
    const char = cssText[index] ?? '';
    const next = cssText[index + 1] ?? '';
    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '*') {
      inComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') blockDepth += 1;
    else if (char === '}') blockDepth = Math.max(0, blockDepth - 1);
    if ((char === '}' || char === ';') && blockDepth === 0) {
      rules.push(cssText.slice(start, index + 1));
      start = index + 1;
    }
  }
  if (start < cssText.length) rules.push(cssText.slice(start));
  return rules;
}

export function sanitizeWebSnapshotCssText(
  value: string,
  rewriteUrl?: WebSnapshotCssUrlRewriter
): string {
  const transformed = stripOrRewriteLiteralCssFetchSyntax(value, rewriteUrl);
  const sanitized = transformed.sanitized;
  const safetyProjection = rewriteUrl
    ? removeLiteralVarFunctionNames(transformed.safetyProjection)
    : sanitized;
  return containsUnsafeCssSyntax(safetyProjection) ? '' : sanitized;
}

export function sanitizeWebSnapshotStylesheetText(
  value: string,
  rewriteUrl?: WebSnapshotCssUrlRewriter
): string {
  return splitStylesheetRules(value)
    .map((rule) => sanitizeWebSnapshotCssText(rule, rewriteUrl))
    .filter(Boolean)
    .join('\n');
}
