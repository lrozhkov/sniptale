import { redactSensitiveString } from './secret-redaction';
import {
  AI_REDACTED_VALUE,
  AI_SECRET_TEXT_MAX_LENGTH,
  SENSITIVE_AUTOCOMPLETE_VALUES,
  SENSITIVE_INPUT_TYPES,
  isHighEntropySecretLikeValue,
  isSensitiveAiFieldName,
  isTableContextLabelHeader,
} from './ai-payload-privacy.rules.ts';
export { isSensitiveAiFieldName } from './ai-payload-privacy.rules.ts';

type MarkdownTableState = {
  activeHeaders: string[] | null;
  pendingHeaders: string[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasLikelySensitiveRowLabel(rowData: Record<string, string>): boolean {
  return Object.entries(rowData).some(
    ([header, value]) => isTableContextLabelHeader(header) && isSensitiveAiFieldName(value)
  );
}

export function shouldRedactSensitiveAiTableCell(params: {
  header: string;
  rowData: Record<string, string>;
  value: string;
}): boolean {
  if (isSensitiveAiFieldName(params.header)) {
    return true;
  }

  if (hasLikelySensitiveRowLabel(params.rowData) && !isTableContextLabelHeader(params.header)) {
    return true;
  }

  return (
    redactSensitiveString(params.value, AI_SECRET_TEXT_MAX_LENGTH) !== params.value ||
    isHighEntropySecretLikeValue(params.value)
  );
}

function sanitizeAiTableRowData(rowData: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(rowData).map(([header, value]) => [
      header,
      shouldRedactSensitiveAiTableCell({ header, rowData, value })
        ? AI_REDACTED_VALUE
        : redactSensitiveString(value, AI_SECRET_TEXT_MAX_LENGTH),
    ])
  );
}

function redactUnknownValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return AI_REDACTED_VALUE;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return AI_REDACTED_VALUE;
  }
  if (Array.isArray(value)) {
    return value.map(() => AI_REDACTED_VALUE);
  }
  if (isRecord(value)) {
    return AI_REDACTED_VALUE;
  }
  return value;
}

function sanitizeAiPayloadValue(value: unknown, keyHint?: string): unknown {
  if (keyHint !== undefined && isSensitiveAiFieldName(keyHint)) {
    return redactUnknownValue(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAiPayloadValue(item));
  }

  if (!isRecord(value)) {
    return typeof value === 'string'
      ? redactSensitiveString(value, AI_SECRET_TEXT_MAX_LENGTH)
      : value;
  }

  const source = value;
  if (isRecord(source['d'])) {
    const { d: _rowData, ...rest } = source;
    const sanitizedRest = sanitizeAiPayloadValue(rest);
    return {
      ...(isRecord(sanitizedRest) ? sanitizedRest : {}),
      d: sanitizeAiTableRowData(
        Object.fromEntries(
          Object.entries(source['d']).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      ),
    };
  }

  const output: Record<string, unknown> = {};
  const label = typeof source['n'] === 'string' ? source['n'] : undefined;
  for (const [key, childValue] of Object.entries(source)) {
    const shouldRedactEditableValue =
      key === 'c' && label !== undefined && isSensitiveAiFieldName(label);
    output[key] = shouldRedactEditableValue
      ? redactUnknownValue(childValue)
      : sanitizeAiPayloadValue(childValue, key);
  }
  return output;
}

export function isSensitiveAiFormControl(element: HTMLElement, label?: string): boolean {
  if (label !== undefined && isSensitiveAiFieldName(label)) {
    return true;
  }

  if (element instanceof HTMLInputElement) {
    const inputType = element.type.toLowerCase();
    if (SENSITIVE_INPUT_TYPES.has(inputType)) {
      return true;
    }
  }

  const metadata = [
    element.getAttribute('name'),
    element.id,
    element.getAttribute('autocomplete'),
    element.getAttribute('aria-label'),
    element.getAttribute('placeholder'),
  ].filter((value): value is string => value !== null && value.trim() !== '');

  return metadata.some((value) => {
    const normalized = value.toLowerCase();
    return SENSITIVE_AUTOCOMPLETE_VALUES.has(normalized) || isSensitiveAiFieldName(value);
  });
}

export function shouldOmitAiFieldPayload(field: { label: string; value: string }): boolean {
  return (
    isSensitiveAiFieldName(field.label) ||
    redactSensitiveString(field.value, AI_SECRET_TEXT_MAX_LENGTH) !== field.value
  );
}

export function redactSensitiveAiFieldValue(field: { label: string; value: string }): string {
  if (shouldOmitAiFieldPayload(field)) {
    return AI_REDACTED_VALUE;
  }
  return field.value;
}

function parseMarkdownTableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return null;
  }

  const bounded = trimmed.startsWith('|') && trimmed.endsWith('|');
  const source = bounded ? trimmed.slice(1, -1) : trimmed;
  const cells = source.split('|').map((cell) => cell.trim());
  return cells.length > 1 ? cells : null;
}

function isMarkdownSeparatorCell(cell: string): boolean {
  return /^:?-{3,}:?$/u.test(cell.trim());
}

function isMarkdownSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every(isMarkdownSeparatorCell);
}

function formatMarkdownTableCells(originalLine: string, cells: string[]): string {
  const prefix = originalLine.trimStart().startsWith('|') ? '| ' : '';
  const suffix = originalLine.trimEnd().endsWith('|') ? ' |' : '';
  return `${prefix}${cells.join(' | ')}${suffix}`;
}

function redactMarkdownTableLine(line: string, state: MarkdownTableState): string {
  const cells = parseMarkdownTableCells(line);
  if (cells === null) {
    state.activeHeaders = null;
    state.pendingHeaders = null;
    return line;
  }

  if (isMarkdownSeparatorRow(cells)) {
    state.activeHeaders = state.pendingHeaders;
    state.pendingHeaders = null;
    return line;
  }

  if (state.activeHeaders === null) {
    state.pendingHeaders = cells;
    return line;
  }

  const redactedCells = cells.map((cell, index) => {
    const header = state.activeHeaders?.[index];
    if (header !== undefined && isSensitiveAiFieldName(header)) {
      return AI_REDACTED_VALUE;
    }
    return redactSensitiveString(cell, AI_SECRET_TEXT_MAX_LENGTH);
  });
  return formatMarkdownTableCells(line, redactedCells);
}

function redactMarkdownSensitiveTables(value: string): string {
  const state: MarkdownTableState = {
    activeHeaders: null,
    pendingHeaders: null,
  };
  return value
    .split('\n')
    .map((line) => redactMarkdownTableLine(line, state))
    .join('\n');
}

export function redactSensitiveAiTableCellValue(params: {
  header: string;
  rowData: Record<string, string>;
  value: string;
}): string {
  return shouldRedactSensitiveAiTableCell(params)
    ? AI_REDACTED_VALUE
    : redactSensitiveString(params.value, AI_SECRET_TEXT_MAX_LENGTH);
}

export function redactAiPayloadText(value: string): string {
  try {
    return JSON.stringify(sanitizeAiPayloadValue(JSON.parse(value)));
  } catch {
    return redactSensitiveString(redactMarkdownSensitiveTables(value), AI_SECRET_TEXT_MAX_LENGTH);
  }
}
