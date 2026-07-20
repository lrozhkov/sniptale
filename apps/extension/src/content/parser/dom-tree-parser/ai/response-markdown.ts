import type { AIEditChange, ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

function decodeMarkdownCell(value: string): string {
  return value.replace(/<br\s*\/?>/gi, '\n').trim();
}

function splitMarkdownRow(line: string): string[] {
  const trimmedLine = line.trim();
  const rowText = trimmedLine.startsWith('|') ? trimmedLine.slice(1) : trimmedLine;
  const cells: string[] = [];
  let currentCell = '';
  let isEscaping = false;

  for (const character of rowText) {
    if (isEscaping) {
      currentCell += character;
      isEscaping = false;
      continue;
    }

    if (character === '\\') {
      isEscaping = true;
      continue;
    }

    if (character === '|') {
      cells.push(decodeMarkdownCell(currentCell));
      currentCell = '';
      continue;
    }

    currentCell += character;
  }

  if (currentCell.length > 0 || !trimmedLine.endsWith('|')) {
    cells.push(decodeMarkdownCell(currentCell));
  }

  return cells.filter((cell, index, entries) => {
    return !(index === entries.length - 1 && cell === '' && trimmedLine.endsWith('|'));
  });
}

function parseMarkdownTable(tableText: string): { headers: string[]; rows: string[][] } {
  const lines = tableText
    .trim()
    .split('\n')
    .filter((line) => line.trim().startsWith('|'));
  if (lines.length < 2) {
    return { headers: [], rows: [] };
  }

  const headerLine = lines[0];
  if (headerLine === undefined) {
    return { headers: [], rows: [] };
  }
  const headers = splitMarkdownRow(headerLine).filter(Boolean);
  const rows = lines.slice(2).map(splitMarkdownRow);

  return { headers, rows };
}

function parseFieldRows(
  headers: string[],
  rows: string[][],
  changes: AIEditChange[],
  errors: string[],
  sectionTitle: string
) {
  const fieldIdIndex = headers.indexOf('field_id');
  const fieldNameIndex = headers.indexOf('field_name');
  const newValueIndex = headers.indexOf('new_value');

  if (newValueIndex === -1) {
    errors.push(`Секция "${sectionTitle}": нет колонки new_value`);
    return;
  }

  rows.forEach((row) => {
    const newValue = row[newValueIndex]?.trim();
    const fieldId = fieldIdIndex >= 0 ? row[fieldIdIndex]?.trim() : '';
    const fieldName = fieldNameIndex >= 0 ? row[fieldNameIndex]?.trim() : '';
    if (newValue && fieldId) {
      changes.push({
        type: 'field',
        fieldId,
        newValue,
        fieldName: fieldName ?? '',
      });
    }
  });
}

function parseTableRows(headers: string[], rows: string[][], changes: AIEditChange[]) {
  const rowIdIndex = headers.indexOf('row_id');
  const newColumnIndices = headers.reduce<Record<string, number>>((acc, header, index) => {
    if (header.startsWith('new_')) {
      const columnName = header.match(/^new_\d+\.\s*(.+)$/)?.[1] ?? header.substring(4);
      acc[columnName] = index;
    }
    return acc;
  }, {});

  rows.forEach((row) => {
    const rowId = row[rowIdIndex]?.trim();
    if (!rowId) {
      return;
    }

    const columnEdits = Object.entries(newColumnIndices).reduce<Record<string, string>>(
      (acc, [columnName, columnIndex]) => {
        const newValue = row[columnIndex]?.trim();
        if (newValue) {
          acc[columnName] = newValue;
        }
        return acc;
      },
      {}
    );

    if (Object.keys(columnEdits).length > 0) {
      changes.push({ type: 'tableRow', rowId, columnEdits });
    }
  });
}

function parseTableSection(
  sectionText: string,
  sectionTitle: string,
  changes: AIEditChange[],
  errors: string[]
): void {
  const { headers, rows } = parseMarkdownTable(sectionText);
  if (headers.length === 0 || rows.length === 0) {
    return;
  }

  if (headers.includes('field_id')) {
    parseFieldRows(headers, rows, changes, errors, sectionTitle);
    return;
  }

  if (headers.includes('row_id')) {
    parseTableRows(headers, rows, changes);
    return;
  }

  errors.push(`Секция "${sectionTitle}": не найдены field_id или row_id`);
}

export function parseAIResponse(
  response: string,
  _originalTree: ParsedDOMTree
): { changes: AIEditChange[]; errors: string[] } {
  const changes: AIEditChange[] = [];
  const errors: string[] = [];

  if (!/^##\s+/m.test(response)) {
    parseTableSection(response, 'Без заголовка', changes, errors);
    return { changes, errors };
  }

  const sections = response.split(/^##\s+/m);
  const firstSection = sections[0];
  const startIndex = firstSection !== undefined && firstSection.trim().startsWith('|') ? 1 : 0;
  sections.slice(startIndex).forEach((sectionText) => {
    if (!sectionText.trim()) {
      return;
    }

    const firstLineBreak = sectionText.indexOf('\n');
    const normalizedBreakIndex = firstLineBreak === -1 ? sectionText.length : firstLineBreak;
    parseTableSection(
      sectionText.substring(normalizedBreakIndex + 1),
      sectionText.substring(0, normalizedBreakIndex).trim(),
      changes,
      errors
    );
  });

  return { changes, errors };
}
