import type { ExportData } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree, TableNode } from '@sniptale/runtime-contracts/dom-tree';
import {
  appendBlockAwareSectionMarkdown,
  appendMarkdownTable,
} from '../../markdown-rendering/blocks';
import {
  appendMarkdownField,
  ensureTrailingBlankLine,
  escapeMarkdownFieldValue,
} from '../../markdown-rendering/fields';
import {
  getDocumentSections,
  getSectionBlocks,
  getSectionFields,
  getSectionTables,
} from '../../ir/document-helpers';

function replaceFilePlaceholders(text: string, filenameMap: Map<string, string>): string {
  if (!text) {
    return text;
  }

  return text.replace(/\[file_\$?([\w]+)\]/g, (match: string, uuid: string) => {
    const realFilename = filenameMap.get(`file_${uuid}`);
    if (realFilename) {
      return `[${realFilename}]`;
    }

    const fallbackFilename = filenameMap.get(uuid);
    return fallbackFilename ? `[${fallbackFilename}]` : match;
  });
}

function replacePlaceholdersForMarkdown(text: string, filenameMap: Map<string, string>): string {
  if (!text) {
    return text;
  }

  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];

  return text.replace(/\[file_\$?([\w]+)\]/g, (match: string, uuid: string) => {
    const realFilename = filenameMap.get(`file_${uuid}`) || filenameMap.get(uuid);
    if (!realFilename) {
      return match;
    }

    const filePath = `files/${realFilename}`;
    const extension = realFilename.toLowerCase().split('.').pop() || '';
    return imageExtensions.includes(extension)
      ? `![${realFilename}](${filePath})`
      : `[${realFilename}](${filePath})`;
  });
}

function generateMarkdownTable(table: TableNode, filenameMap: Map<string, string>): string {
  const lines: string[] = [];
  appendMarkdownTable(
    lines,
    table.headers,
    table.rows.map((row) => row.data),
    (text) => replacePlaceholdersForMarkdown(text, filenameMap)
  );
  return `${lines.join('\n')}\n`;
}

export function generateMarkdown(tree: ParsedDOMTree, filenameMap: Map<string, string>): string {
  const lines: string[] = [`# ${tree.title}\n`];

  if (tree.meta?.profile.pageKind) {
    lines.push(`*${tree.context} · ${tree.meta.profile.vendor}/${tree.meta.profile.pageKind}*\n`);
  } else if (tree.context) {
    lines.push(`*${tree.context}*\n`);
  }

  lines.push('');

  for (const section of getDocumentSections(tree)) {
    if (
      appendBlockAwareSectionMarkdown({
        lines,
        section,
        blocks: getSectionBlocks(tree, section),
        tables: getSectionTables(section),
        renderText: (text) => replacePlaceholdersForMarkdown(text, filenameMap),
      })
    ) {
      continue;
    }

    lines.push(`## ${section.title}\n`);

    const fields = getSectionFields(section);
    for (const field of fields) {
      const value = escapeMarkdownFieldValue(
        replacePlaceholdersForMarkdown(field.value, filenameMap)
      );
      appendMarkdownField(lines, field, value);
    }

    if (fields.length > 0) {
      ensureTrailingBlankLine(lines);
    }

    const tables = getSectionTables(section);
    for (const table of tables) {
      lines.push(generateMarkdownTable(table, filenameMap));
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function updateExportDataWithFilenames(
  data: ExportData | null,
  filenameMap: Map<string, string>
): ExportData | null {
  if (!data) {
    return data;
  }

  for (const section of data.sections) {
    section.fields?.forEach((field) => {
      if (field.value) {
        field.value = replaceFilePlaceholders(field.value, filenameMap);
      }
    });

    section.tables?.forEach((table) => {
      table.rows.forEach((row) => {
        Object.keys(row.data).forEach((key) => {
          if (typeof row.data[key] === 'string') {
            row.data[key] = replaceFilePlaceholders(row.data[key], filenameMap);
          }
        });
      });
    });
  }

  return data;
}
