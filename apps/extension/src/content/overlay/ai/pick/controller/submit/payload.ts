import {
  isSensitiveAiFieldName,
  redactSensitiveAiFieldValue,
  redactSensitiveAiTableCellValue,
  shouldOmitAiFieldPayload,
  shouldRedactSensitiveAiTableCell,
} from '@sniptale/platform/security/ai-payload-privacy';
import { redactSensitiveString } from '@sniptale/platform/security/secret-redaction';

const MAX_INSTRUCTION_LENGTH = 2_000;
const MAX_ID_LENGTH = 200;
const MAX_LABEL_LENGTH = 200;
const MAX_VALUE_LENGTH = 20_000;
const MAX_TABLE_TITLE_LENGTH = 200;
const MAX_FIELDS = 200;
const MAX_TABLES = 50;
const MAX_ROWS_PER_TABLE = 500;
const MAX_CELLS_PER_ROW = 100;

type UnknownRecord = Record<string, unknown>;

type AiEgressField = {
  id: string;
  n: string;
  c: string;
  new: string;
};

type AiEgressTableRow = {
  id: string;
  d: Record<string, string>;
  new: Record<string, string>;
};

type AiEgressTable = {
  ttl: string;
  r: AiEgressTableRow[];
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function limitString(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function readString(source: UnknownRecord, key: string, maxLength: number): string | undefined {
  const value = source[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  return limitString(value, maxLength);
}

function readSafeString(source: UnknownRecord, key: string, maxLength: number): string | undefined {
  const value = readString(source, key, maxLength);
  return value === undefined ? undefined : redactSensitiveString(value, maxLength);
}

function readRequiredSafeString(
  source: UnknownRecord,
  key: string,
  maxLength: number
): string | null {
  const value = readSafeString(source, key, maxLength);
  return value === undefined ? null : value;
}

function readRequiredString(source: UnknownRecord, key: string, maxLength: number): string | null {
  const value = readString(source, key, maxLength);
  return value === undefined ? null : value;
}

function parseField(value: unknown): AiEgressField | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readRequiredSafeString(value, 'id', MAX_ID_LENGTH);
  const label = readRequiredString(value, 'n', MAX_LABEL_LENGTH);
  const currentValue = readRequiredString(value, 'c', MAX_VALUE_LENGTH);
  if (id === null || label === null || currentValue === null) {
    return null;
  }

  if (shouldOmitAiFieldPayload({ label, value: currentValue })) {
    return null;
  }

  return {
    c: redactSensitiveAiFieldValue({ label, value: currentValue }),
    id,
    n: redactSensitiveString(label, MAX_LABEL_LENGTH),
    new: '',
  };
}

function readRowData(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) {
    return null;
  }

  const rowData: Record<string, string> = {};
  Object.entries(value)
    .slice(0, MAX_CELLS_PER_ROW)
    .forEach(([rawHeader, rawValue]) => {
      if (typeof rawValue !== 'string') {
        return;
      }

      const rawHeaderLabel = limitString(rawHeader, MAX_LABEL_LENGTH);
      if (rawHeaderLabel.length === 0 || isSensitiveAiFieldName(rawHeaderLabel)) {
        return;
      }

      rowData[redactSensitiveString(rawHeaderLabel, MAX_LABEL_LENGTH)] = limitString(
        rawValue,
        MAX_VALUE_LENGTH
      );
    });

  return rowData;
}

function parseTableRow(value: unknown): AiEgressTableRow | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readRequiredSafeString(value, 'id', MAX_ID_LENGTH);
  const rowData = readRowData(value['d']);
  if (id === null || rowData === null) {
    return null;
  }

  const data: Record<string, string> = {};
  const newValues: Record<string, string> = {};

  Object.entries(rowData).forEach(([header, currentValue]) => {
    const shouldRedact = shouldRedactSensitiveAiTableCell({
      header,
      rowData,
      value: currentValue,
    });
    data[header] = shouldRedact
      ? redactSensitiveAiTableCellValue({ header, rowData, value: currentValue })
      : currentValue;
    if (!shouldRedact) {
      newValues[header] = '';
    }
  });

  return Object.keys(newValues).length > 0 ? { d: data, id, new: newValues } : null;
}

function parseTable(value: unknown): AiEgressTable | null {
  if (!isRecord(value)) {
    return null;
  }

  const title = readRequiredSafeString(value, 'ttl', MAX_TABLE_TITLE_LENGTH);
  if (title === null || !Array.isArray(value['r'])) {
    return null;
  }

  const rows = value['r'].slice(0, MAX_ROWS_PER_TABLE).flatMap((row) => {
    const parsedRow = parseTableRow(row);
    return parsedRow === null ? [] : [parsedRow];
  });

  return rows.length > 0 ? { r: rows, ttl: title } : null;
}

function hasEditablePayloadShape(value: UnknownRecord): boolean {
  return Array.isArray(value['f']) || Array.isArray(value['t']);
}

export function createAllowlistedAiEditablePayload(jsonData: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonData);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !hasEditablePayloadShape(parsed)) {
    return null;
  }

  const fields = Array.isArray(parsed['f'])
    ? parsed['f'].slice(0, MAX_FIELDS).flatMap((field) => {
        const parsedField = parseField(field);
        return parsedField === null ? [] : [parsedField];
      })
    : [];
  const tables = Array.isArray(parsed['t'])
    ? parsed['t'].slice(0, MAX_TABLES).flatMap((table) => {
        const parsedTable = parseTable(table);
        return parsedTable === null ? [] : [parsedTable];
      })
    : [];
  if (fields.length === 0 && tables.length === 0) {
    return null;
  }

  return JSON.stringify({
    f: fields,
    i: readSafeString(parsed, 'i', MAX_INSTRUCTION_LENGTH) ?? '',
    t: tables,
  });
}
