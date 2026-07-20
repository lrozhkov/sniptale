import type { FieldNode, ParsedDocument, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import {
  isSensitiveAiFieldName,
  redactSensitiveAiTableCellValue,
  shouldRedactSensitiveAiTableCell,
  shouldOmitAiFieldPayload,
} from '@sniptale/platform/security/ai-payload-privacy';
import { getSelectedSections } from '../../ir/document-helpers';
import { getAllowedAiTableRows, isAllowedAiFieldPayload } from './payload-eligibility';

function encodeMarkdownCell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br />');
}

function createEditableFieldPayload(fields: FieldNode[]) {
  return fields
    .filter((field) => field.valueType !== 'image' && field.valueType !== 'status')
    .filter(isAllowedAiFieldPayload)
    .filter((field) => !shouldOmitAiFieldPayload({ label: field.label, value: field.value }))
    .map((field) => ({
      id: field.id,
      n: field.label,
      c: field.value,
      new: '',
    }));
}

function createEditableTableRows(table: TableNode) {
  const selectedRows = getAllowedAiTableRows(table).filter((row) => row.selected);
  const excludedColumns = new Set(table.excludedColumns || []);

  return selectedRows.flatMap((row) => {
    const data: Record<string, string> = {};
    const newValues: Record<string, string> = {};

    table.headers.forEach((header) => {
      const cellType = row.cellTypes?.[header];
      if (
        excludedColumns.has(header) ||
        cellType === 'image' ||
        cellType === 'status' ||
        isSensitiveAiFieldName(header)
      ) {
        return;
      }

      const value = row.data[header] || '';
      const shouldRedactCell = shouldRedactSensitiveAiTableCell({
        header,
        rowData: row.data,
        value,
      });
      data[header] = shouldRedactCell
        ? redactSensitiveAiTableCellValue({ header, rowData: row.data, value })
        : value;
      if (!shouldRedactCell) {
        newValues[header] = '';
      }
    });

    return Object.keys(data).length > 0 ? [{ id: row.id, d: data, new: newValues }] : [];
  });
}

function appendEditableFieldsMarkdown(
  lines: string[],
  sectionTitle: string,
  editableFields: ReturnType<typeof createEditableFieldPayload>
) {
  lines.push(`## ${sectionTitle}`, '', '| field_id | field_name | current_value | new_value |');
  lines.push('|----------|------------|---------------|-----------|');
  editableFields.forEach((field) => {
    lines.push(
      `| ${field.id || 'unknown'} | ${encodeMarkdownCell(field.n)} | ${encodeMarkdownCell(field.c)} | |`
    );
  });
  lines.push('');
}

function appendEditableTableMarkdown(
  lines: string[],
  sectionTitle: string,
  headersSource: string[],
  rowsToShow: Array<{
    id: string;
    data: Record<string, string>;
    cellTypes?: Record<string, string>;
  }>
) {
  const visibleHeaders = headersSource.filter((header) => !isSensitiveAiFieldName(header));
  const editableHeaders = visibleHeaders.filter((header) =>
    rowsToShow.every((row) => {
      const value = row.data[header] || '';
      return !shouldRedactSensitiveAiTableCell({ header, rowData: row.data, value });
    })
  );
  const headers = ['row_id', ...visibleHeaders.map((header, index) => `${index + 1}. ${header}`)];
  const nextHeaders = editableHeaders.map((header, index) => `new_${index + 1}. ${header}`);
  lines.push(
    `## ${sectionTitle}`,
    '',
    `| ${[...headers, ...nextHeaders].map(encodeMarkdownCell).join(' | ')} |`
  );
  lines.push(`| ${[...headers, ...nextHeaders].map(() => '----------').join(' | ')} |`);

  rowsToShow.forEach((row) => {
    const currentValues = visibleHeaders.map((header) => {
      const cellType = row.cellTypes?.[header];
      return cellType === 'image' || cellType === 'status'
        ? '(не редактируется)'
        : redactSensitiveAiTableCellValue({
            header,
            rowData: row.data,
            value: row.data[header] || '',
          });
    });
    lines.push(
      `| ${[row.id, ...currentValues, ...editableHeaders.map(() => '')].map(encodeMarkdownCell).join(' | ')} |`
    );
  });
  lines.push('');
}

function appendEditableSelectionMarkdown(
  lines: string[],
  sectionTitle: string,
  fields: FieldNode[],
  tables: TableNode[]
) {
  const editableFields = createEditableFieldPayload(fields);
  if (editableFields.length > 0) {
    appendEditableFieldsMarkdown(lines, sectionTitle, editableFields);
  }

  tables.forEach((table) => {
    const selectedRows = getAllowedAiTableRows(table).filter((row) => row.selected);
    if (selectedRows.length === 0) {
      return;
    }

    appendEditableTableMarkdown(lines, sectionTitle, table.headers, selectedRows);
  });
}

export function formatDataForAIJSON(tree: ParsedDocument): string {
  const sections = getSelectedSections(tree);
  const fields = sections.flatMap(({ fields: selectedFields }) =>
    createEditableFieldPayload(selectedFields)
  );
  const tables = sections.flatMap(({ sectionTitle, tables: selectedTables }) => {
    return selectedTables.flatMap((table) => {
      const rows = createEditableTableRows(table);
      return rows.length > 0 ? [{ ttl: sectionTitle, r: rows }] : [];
    });
  });

  return JSON.stringify(
    {
      i:
        `Редактирование: ${tree.title}. Заполни поля "new" новыми значениями. ` +
        'Если значение не нужно менять, оставь поле пустым.',
      f: fields,
      t: tables,
    },
    null,
    0
  );
}

export function formatDataForAI(tree: ParsedDocument): string {
  const lines: string[] = [
    `# Редактирование: ${tree.title}`,
    '',
    '## Инструкция',
    '',
    '- **ОБЯЗАТЕЛЬНО сохраняй** колонки с `field_id`, `row_id` - это служебная информация',
    '- **ОБЯЗАТЕЛЬНО заполняй** колонки с префиксом `new_` - новые значения, которые нужно применить',
    '- Если значение ячейки содержит текст "(не редактируется)" - пропускай её, не меняй',
    '- Заполняй ВСЕ `new_*` колонки для каждой строки - не оставляй их пустыми',
    '- Применять изменения ко ВСЕМ полям, даже если изменения кажутся незначительными',
    '',
  ];

  getSelectedSections(tree).forEach(({ sectionTitle, fields, tables }) => {
    appendEditableSelectionMarkdown(lines, sectionTitle, fields, tables);
  });

  return lines.join('\n');
}
