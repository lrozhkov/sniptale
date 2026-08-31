import {
  isSensitiveDiagnosticQueryName,
  sanitizeDiagnosticMessage,
  sanitizeDiagnosticUrl,
} from '@sniptale/platform/observability/diagnostics/sanitizer';

const MAX_CSS_DIAGNOSTIC_INPUT_LENGTH = 4_096;

function summarizeEmbeddedUrl(value: string): string {
  const mimeType = value.slice(5).split(/[;,]/u, 1)[0]?.trim().toLowerCase();
  const safeMimeType = mimeType?.match(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/u)?.[0] ?? 'unknown';
  return `[embedded ${safeMimeType}]`;
}

function sanitizeCssUrlValue(value: string): string {
  const unquoted = value
    .trim()
    .replace(/^["']|["']$/gu, '')
    .trim();
  if (/^data:/iu.test(unquoted)) {
    return summarizeEmbeddedUrl(unquoted);
  }

  return sanitizeDiagnosticUrl(unquoted) ?? '[invalid URL]';
}

function replaceCssUrls(value: string): string {
  let cursor = 0;
  let output = '';

  while (cursor < value.length) {
    const matchIndex = value.toLowerCase().indexOf('url(', cursor);
    if (matchIndex < 0) {
      output += value.slice(cursor);
      break;
    }

    output += value.slice(cursor, matchIndex);
    let quote: '"' | "'" | null = null;
    let escaped = false;
    let endIndex = matchIndex + 4;
    for (; endIndex < value.length; endIndex += 1) {
      const character = value[endIndex];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (quote) {
        if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === ')') break;
    }

    if (endIndex >= value.length) {
      const incompleteUrl = value.slice(matchIndex + 4);
      output += /^\s*["']?data:/iu.test(incompleteUrl)
        ? `url(${JSON.stringify(sanitizeCssUrlValue(incompleteUrl))})`
        : 'url("[malformed URL redacted]")';
      return output;
    }

    const rawUrl = value.slice(matchIndex + 4, endIndex);
    output += `url(${JSON.stringify(sanitizeCssUrlValue(rawUrl))})`;
    cursor = endIndex + 1;
  }

  return output;
}

function redactSensitiveSelectorAttributes(value: string): string {
  return value.replace(
    /(\[\s*([a-zA-Z0-9_-]+)\s*(?:[*^$|~]?=)\s*)(?:"[^"]*"|'[^']*'|[^\]\s]+)/gu,
    (match, prefix: string, attributeName: string) =>
      isSensitiveDiagnosticQueryName(attributeName) ? `${prefix}"***"` : match
  );
}

/** Bounds page-authored CSS evidence and removes reusable or embedded URL payloads. */
export function sanitizeCssDiagnosticScalar(value: string): string {
  const boundedInput = value.slice(0, MAX_CSS_DIAGNOSTIC_INPUT_LENGTH);
  const withoutCssUrlPayloads = redactSensitiveSelectorAttributes(
    replaceCssUrls(boundedInput)
  ).replace(/data:[^\s"'<>)]*/giu, '[embedded data redacted]');
  const sanitized = sanitizeDiagnosticMessage(withoutCssUrlPayloads);
  return value.length > MAX_CSS_DIAGNOSTIC_INPUT_LENGTH && !sanitized.endsWith('[truncated]')
    ? `${sanitized}... [truncated]`
    : sanitized;
}

/** Preserves icon-font glyph evidence but never persists authored pseudo-element text. */
export function sanitizeCssDiagnosticContent(value: string): string {
  const trimmed = value.trim();
  if (/^["']?\\[0-9a-f]{1,6}\s?["']?$/iu.test(trimmed)) {
    return sanitizeCssDiagnosticScalar(trimmed);
  }

  return `[text content redacted: ${value.length} chars]`;
}
