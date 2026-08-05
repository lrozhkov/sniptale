import baseStyles from '@sniptale/ui/styles?inline';
import aiModalStyles from '@sniptale/ui/styles/ai-modal?inline';
import glassStyles from '@sniptale/ui/styles/glass?inline';
import toolbarStyles from '@sniptale/ui/styles/toolbar?inline';
import overlayStyles from '@sniptale/ui/styles/overlays?inline';
import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import contentRuntimeEffectsStyles from './effects.css?inline';
import contentAiPickerStyles from '../../overlay/ai/pick/runtime/styles.css?inline';
import frameSettingsPopoverStyles from '../../selection/frame-settings-popover/styles.css?inline';
import calloutSettingsPopoverStyles from '../../selection/callout-settings-popover/styles.css?inline';
import settingsPopoverStyles from '../../selection/popover-sync/styles.css?inline';
import contentHostStyles from './host.css?inline';

const CONTENT_ENTRYPOINT_FONT_URL_PATTERNS = [
  /url\((['"]?)\/node_modules\/@fontsource-variable\/manrope\/files\/(manrope-[\w-]+\.woff2)\1\)/g,
  /url\((['"]?)@fontsource-variable\/manrope\/files\/(manrope-[\w-]+\.woff2)\1\)/g,
  /url\((['"]?)\.\/(manrope-[\w-]+\.woff2)\1\)/g,
] as const;

const CONTENT_ENTRYPOINT_REM_BASE_PX = 16;

function formatCssNumber(value: number): string {
  const rounded = Math.round(value * 10_000) / 10_000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function isAsciiDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9';
}

function isCssIdentifierCharacter(character: string | undefined): boolean {
  if (character === undefined) return false;
  return (
    isAsciiDigit(character) ||
    (character >= 'a' && character <= 'z') ||
    (character >= 'A' && character <= 'Z') ||
    character === '_'
  );
}

function findCssRemUnitEnd(css: string, start: number): number | null {
  let cursor = css[start] === '-' ? start + 1 : start;
  const integerStart = cursor;
  while (isAsciiDigit(css[cursor])) cursor += 1;
  const hasInteger = cursor > integerStart;

  let hasFraction = false;
  if (css[cursor] === '.') {
    cursor += 1;
    const fractionStart = cursor;
    while (isAsciiDigit(css[cursor])) cursor += 1;
    hasFraction = cursor > fractionStart;
  }

  if ((!hasInteger && !hasFraction) || css.slice(cursor, cursor + 3) !== 'rem') return null;
  const unitEnd = cursor + 3;
  return isCssIdentifierCharacter(css[unitEnd]) ? null : unitEnd;
}

function normalizeCssCodeRemUnits(css: string): string {
  const normalized: string[] = [];
  let codeStart = 0;
  let cursor = 0;
  while (cursor < css.length) {
    const remUnitEnd = findCssRemUnitEnd(css, cursor);
    if (remUnitEnd === null) {
      cursor += 1;
      continue;
    }

    normalized.push(css.slice(codeStart, cursor));
    const remValue = Number(css.slice(cursor, remUnitEnd - 3));
    normalized.push(`${formatCssNumber(remValue * CONTENT_ENTRYPOINT_REM_BASE_PX)}px`);
    cursor = remUnitEnd;
    codeStart = remUnitEnd;
  }
  normalized.push(css.slice(codeStart));
  return normalized.join('');
}

function findCssStringEnd(styles: string, start: number, quote: string): number {
  let cursor = start + 1;
  while (cursor < styles.length) {
    if (styles[cursor] === '\\') {
      cursor += 2;
      continue;
    }
    if (styles[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return styles.length;
}

function findCssCommentEnd(styles: string, start: number): number {
  const closingIndex = styles.indexOf('*/', start + 2);
  return closingIndex === -1 ? styles.length : closingIndex + 2;
}

function normalizeCssRemUnitsPreservingLiterals(styles: string): string {
  const normalized: string[] = [];
  let codeStart = 0;
  let cursor = 0;
  while (cursor < styles.length) {
    const isComment = styles.startsWith('/*', cursor);
    const quote = styles[cursor] === '"' || styles[cursor] === "'" ? styles[cursor]! : null;
    if (!isComment && !quote) {
      cursor += 1;
      continue;
    }

    normalized.push(normalizeCssCodeRemUnits(styles.slice(codeStart, cursor)));
    const literalEnd = isComment
      ? findCssCommentEnd(styles, cursor)
      : findCssStringEnd(styles, cursor, quote!);
    normalized.push(styles.slice(cursor, literalEnd));
    cursor = literalEnd;
    codeStart = literalEnd;
  }
  normalized.push(normalizeCssCodeRemUnits(styles.slice(codeStart)));
  return normalized.join('');
}

function isCssWhitespace(character: string | undefined): boolean {
  return (
    character === ' ' ||
    character === '\n' ||
    character === '\r' ||
    character === '\t' ||
    character === '\f'
  );
}

function findFirstCssCodeIndex(styles: string): number | null {
  let cursor = 0;
  while (cursor < styles.length) {
    if (isCssWhitespace(styles[cursor])) {
      cursor += 1;
      continue;
    }
    if (styles.startsWith('/*', cursor)) {
      cursor = findCssCommentEnd(styles, cursor);
      continue;
    }
    return cursor;
  }
  return null;
}

function findCssDeclarationColon(styles: string): number | null {
  let parenthesesDepth = 0;
  let bracketsDepth = 0;
  let cursor = 0;
  while (cursor < styles.length) {
    if (styles.startsWith('/*', cursor)) {
      cursor = findCssCommentEnd(styles, cursor);
      continue;
    }
    const character = styles[cursor]!;
    if (character === '"' || character === "'") {
      cursor = findCssStringEnd(styles, cursor, character);
      continue;
    }
    if (character === '\\') {
      cursor += 2;
      continue;
    }
    if (character === '(') parenthesesDepth += 1;
    if (character === ')') parenthesesDepth = Math.max(0, parenthesesDepth - 1);
    if (character === '[') bracketsDepth += 1;
    if (character === ']') bracketsDepth = Math.max(0, bracketsDepth - 1);
    if (character === ':' && parenthesesDepth === 0 && bracketsDepth === 0) return cursor;
    cursor += 1;
  }
  return null;
}

function normalizeCssStatement(styles: string): string {
  const firstCodeIndex = findFirstCssCodeIndex(styles);
  if (firstCodeIndex === null) return styles;
  if (styles[firstCodeIndex] === '@') return normalizeCssRemUnitsPreservingLiterals(styles);

  const colonIndex = findCssDeclarationColon(styles);
  if (colonIndex === null) return styles;
  return `${styles.slice(0, colonIndex + 1)}${normalizeCssRemUnitsPreservingLiterals(
    styles.slice(colonIndex + 1)
  )}`;
}

function normalizeCssRulePrelude(styles: string): string {
  const firstCodeIndex = findFirstCssCodeIndex(styles);
  return firstCodeIndex !== null && styles[firstCodeIndex] === '@'
    ? normalizeCssRemUnitsPreservingLiterals(styles)
    : styles;
}

function normalizeCssScope(
  styles: string,
  start: number,
  stopAtClosingBrace: boolean
): { end: number; styles: string } {
  const normalized: string[] = [];
  let segmentStart = start;
  let cursor = start;
  let parenthesesDepth = 0;
  let bracketsDepth = 0;

  while (cursor < styles.length) {
    if (styles.startsWith('/*', cursor)) {
      cursor = findCssCommentEnd(styles, cursor);
      continue;
    }
    const character = styles[cursor]!;
    if (character === '"' || character === "'") {
      cursor = findCssStringEnd(styles, cursor, character);
      continue;
    }
    if (character === '\\') {
      cursor += 2;
      continue;
    }
    if (character === '(') parenthesesDepth += 1;
    if (character === ')') parenthesesDepth = Math.max(0, parenthesesDepth - 1);
    if (character === '[') bracketsDepth += 1;
    if (character === ']') bracketsDepth = Math.max(0, bracketsDepth - 1);

    const isStructural = parenthesesDepth === 0 && bracketsDepth === 0;
    if (isStructural && character === '{') {
      normalized.push(normalizeCssRulePrelude(styles.slice(segmentStart, cursor)), '{');
      const child = normalizeCssScope(styles, cursor + 1, true);
      normalized.push(child.styles);
      if (child.end < styles.length) normalized.push('}');
      cursor = child.end + 1;
      segmentStart = cursor;
      continue;
    }
    if (isStructural && character === ';') {
      normalized.push(normalizeCssStatement(styles.slice(segmentStart, cursor)), ';');
      cursor += 1;
      segmentStart = cursor;
      continue;
    }
    if (isStructural && character === '}' && stopAtClosingBrace) {
      normalized.push(normalizeCssStatement(styles.slice(segmentStart, cursor)));
      return { end: cursor, styles: normalized.join('') };
    }
    cursor += 1;
  }

  normalized.push(normalizeCssStatement(styles.slice(segmentStart)));
  return { end: styles.length, styles: normalized.join('') };
}

/**
 * Resolves root-relative units before the stylesheet enters a host-page ShadowRoot.
 * Shadow DOM blocks page selectors, but `rem` still resolves against the page's `<html>` size.
 */
export function normalizeContentEntrypointRemUnits(styles: string): string {
  return normalizeCssScope(styles, 0, false).styles;
}

function resolveRuntimeAssetUrl(resourcePath: string): string | null {
  try {
    return runtimeInfo.getURL(resourcePath);
  } catch {
    return null;
  }
}

export function resolveContentEntrypointStyleUrls(styles: string): string {
  return CONTENT_ENTRYPOINT_FONT_URL_PATTERNS.reduce((resolvedStyles, pattern, index) => {
    return resolvedStyles.replace(pattern, (_match, _quote: string, fileName: string) => {
      const resourcePath =
        index === 0
          ? `node_modules/@fontsource-variable/manrope/files/${fileName}`
          : `fonts/${fileName}`;
      const runtimeUrl = resolveRuntimeAssetUrl(resourcePath);

      return runtimeUrl ? `url("${runtimeUrl}")` : _match;
    });
  }, styles);
}

export function createContentEntrypointStyles(): string {
  return normalizeContentEntrypointRemUnits(
    resolveContentEntrypointStyleUrls(
      [
        contentHostStyles,
        baseStyles,
        aiModalStyles,
        glassStyles,
        toolbarStyles,
        overlayStyles,
        contentRuntimeEffectsStyles,
        contentAiPickerStyles,
        frameSettingsPopoverStyles,
        calloutSettingsPopoverStyles,
        settingsPopoverStyles,
      ].join('\n')
    )
  );
}

export { createContentEntrypointStyles as createPreparationSurfaceStyles };
