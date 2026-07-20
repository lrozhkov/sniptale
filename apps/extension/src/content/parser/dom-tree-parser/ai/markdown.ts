import type { ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
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

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function convertTreeToMarkdown(tree: ParsedDocument): string {
  const lines: string[] = [`# ${tree.title}`, ''];

  if (tree.meta?.profile.pageKind) {
    lines.push(`*${tree.context} · ${tree.meta.profile.vendor}/${tree.meta.profile.pageKind}*`, '');
  } else if (tree.context) {
    lines.push(`*${tree.context}*`, '');
  }

  getDocumentSections(tree).forEach((section) => {
    if (
      appendBlockAwareSectionMarkdown({
        lines,
        section,
        blocks: getSectionBlocks(tree, section),
        tables: getSectionTables(section),
      })
    ) {
      return;
    }

    lines.push(`## ${section.title}`, '');

    const fields = getSectionFields(section);
    fields.forEach((field) => {
      appendMarkdownField(lines, field, escapeMarkdownFieldValue(field.value || ''));
    });

    if (fields.length > 0) {
      ensureTrailingBlankLine(lines);
    }

    const tables = getSectionTables(section);
    tables.forEach((table) => {
      appendMarkdownTable(
        lines,
        table.headers,
        table.rows.map((row) => row.data)
      );
    });
  });

  return lines.join('\n');
}
