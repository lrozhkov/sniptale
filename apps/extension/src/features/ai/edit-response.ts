import type { AIEditChange } from '@sniptale/runtime-contracts/dom-tree';
import type { AIResponseJSON } from '../../contracts/messaging/llm';

export interface ParsedAiEditResponse {
  changes: AIEditChange[];
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isAIResponseJSON(value: unknown): value is AIResponseJSON {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['i'] === 'string' &&
    Array.isArray(value['f']) &&
    value['f'].every(isAIFieldResponseEntry) &&
    Array.isArray(value['t']) &&
    value['t'].every(isAITableResponseEntry)
  );
}

function isAIFieldResponseEntry(value: unknown): value is AIResponseJSON['f'][number] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['id'] === 'string' &&
    typeof value['n'] === 'string' &&
    typeof value['c'] === 'string' &&
    typeof value['new'] === 'string'
  );
}

function isAITableResponseEntry(value: unknown): value is AIResponseJSON['t'][number] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['ttl'] === 'string' &&
    Array.isArray(value['r']) &&
    value['r'].every(isAITableRowResponseEntry)
  );
}

function isAITableRowResponseEntry(
  value: unknown
): value is AIResponseJSON['t'][number]['r'][number] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value['id'] === 'string' && isStringRecord(value['d']) && isStringRecord(value['new'])
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

function appendAIFieldChanges(changes: AIEditChange[], fields: AIResponseJSON['f']): void {
  fields.forEach((field) => {
    if (field.new && String(field.new).trim() !== '') {
      changes.push({
        type: 'field',
        fieldId: field.id,
        newValue: String(field.new),
        fieldName: field.n,
      });
    }
  });
}

function appendAITableChanges(changes: AIEditChange[], tables: AIResponseJSON['t']): void {
  tables.forEach((table) => {
    table.r.forEach((row) => {
      const columnEdits = Object.entries(row.new).reduce<Record<string, string>>(
        (acc, [columnName, value]) => {
          if (value && String(value).trim() !== '') {
            acc[columnName] = String(value);
          }
          return acc;
        },
        {}
      );

      if (Object.keys(columnEdits).length > 0) {
        changes.push({ type: 'tableRow', rowId: row.id, columnEdits });
      }
    });
  });
}

export function parseAiEditResponseJson(response: string): ParsedAiEditResponse {
  const changes: AIEditChange[] = [];
  const errors: string[] = [];

  try {
    const parsed: unknown = JSON.parse(response);

    if (!isAIResponseJSON(parsed)) {
      errors.push('Ошибка парсинга JSON: некорректная структура ответа');
      return { changes, errors };
    }

    appendAIFieldChanges(changes, parsed.f);
    appendAITableChanges(changes, parsed.t);
  } catch (error) {
    errors.push(
      `Ошибка парсинга JSON: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
    );
  }

  return { changes, errors };
}
