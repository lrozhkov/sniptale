import type {
  DocumentBlock,
  DocumentInlineNode,
  SectionNode,
  TableNode,
} from '@sniptale/runtime-contracts/dom-tree';
import { appendMarkdownField, ensureTrailingBlankLine } from './fields';

type MarkdownTextRenderer = (text: string) => string;

type AppendBlockAwareSectionMarkdownParams = {
  lines: string[];
  section: SectionNode;
  blocks: DocumentBlock[];
  tables: TableNode[];
  renderText?: MarkdownTextRenderer;
};

function renderIdentity(text: string): string {
  return text;
}

function escapeMarkdownTableCell(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function escapeInlineText(text: string): string {
  return text.replace(/([\\`*_[\]<>])/gu, '\\$1');
}

function renderMarkdownUrl(url: string): string {
  return `<${url.replace(/\\/gu, '%5C').replace(/>/gu, '%3E')}>`;
}

function renderInlineContent(
  content: DocumentInlineNode[] | undefined,
  fallback: string,
  renderText: MarkdownTextRenderer
): string {
  if (!content || content.length === 0) return renderText(fallback);
  return content
    .map((node) => {
      if (node.kind === 'text') return escapeInlineText(renderText(node.text));
      if (node.kind === 'line-break') return '  \n';
      if (node.kind === 'link') {
        return `[${escapeInlineText(renderText(node.text))}](${renderMarkdownUrl(node.url)})`;
      }
      const image = `![${escapeInlineText(node.alt)}](${renderMarkdownUrl(node.sourceUrl)})`;
      return node.linkUrl ? `[${image}](${renderMarkdownUrl(node.linkUrl)})` : image;
    })
    .join('');
}

function neutralizeMarkdownBlockStart(line: string): string {
  return line
    .replace(/^(\s{0,3})([#\-+=~])/u, '$1\\$2')
    .replace(/^(\s{0,3}\d+)([.)])(?=\s)/u, '$1\\$2');
}

function renderParagraphContent(
  content: DocumentInlineNode[] | undefined,
  fallback: string,
  renderText: MarkdownTextRenderer
): string {
  return renderInlineContent(content, fallback, renderText)
    .split('\n')
    .map(neutralizeMarkdownBlockStart)
    .join('\n');
}

function isBlockAwareSection(section: SectionNode): boolean {
  return section.kind === 'narrative' || section.kind === 'thread' || section.kind === 'results';
}

export function appendMarkdownTable(
  lines: string[],
  headers: string[],
  rows: Record<string, string>[],
  renderText: MarkdownTextRenderer = renderIdentity
): void {
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  rows.forEach((row) => {
    const cells = headers.map((header) => escapeMarkdownTableCell(renderText(row[header] || '')));
    lines.push(`| ${cells.join(' | ')} |`);
  });
  lines.push('');
}

function appendQuoteLikeBlock(
  lines: string[],
  block: DocumentBlock,
  renderText: MarkdownTextRenderer
): void {
  if (block.text || block.inlineContent?.length) {
    const rendered = renderParagraphContent(block.inlineContent, block.text ?? '', renderText);
    lines.push(
      rendered
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n'),
      ''
    );
  }
}

function appendThreadMessageBlock(
  lines: string[],
  block: DocumentBlock,
  renderText: MarkdownTextRenderer
): void {
  if (!block.text) {
    return;
  }

  const meta = (block.items ?? []).filter(Boolean).join(' · ');
  const text = renderText(block.text);
  lines.push(meta ? `- **${meta}:** ${text}` : `- ${text}`);
}

function appendAttachmentBlock(
  lines: string[],
  block: DocumentBlock,
  renderText: MarkdownTextRenderer
): void {
  const attachmentText = [...(block.items ?? []), block.text ?? ''].find(Boolean);
  if (attachmentText) {
    lines.push(`- ${renderText(attachmentText)}`);
  }
}

function appendRecordFieldBlock(
  lines: string[],
  block: DocumentBlock,
  renderText: MarkdownTextRenderer
): void {
  const [label, value = ''] = block.items ?? [];
  if (!label) {
    return;
  }

  appendMarkdownField(
    lines,
    {
      label: renderText(label),
      valueType: 'string',
    },
    renderText(value)
  );
}

function appendDataTableBlock(
  lines: string[],
  block: DocumentBlock,
  tablesById: Map<string, TableNode>,
  renderText: MarkdownTextRenderer
): void {
  if (!block.tableRef) {
    return;
  }

  const table = tablesById.get(block.tableRef);
  if (table) {
    appendMarkdownTable(
      lines,
      table.headers,
      table.rows.map((row) => row.data),
      renderText
    );
  }
}

function appendMarkdownBlock(
  lines: string[],
  block: DocumentBlock,
  tablesById: Map<string, TableNode>,
  renderText: MarkdownTextRenderer
): void {
  switch (block.kind) {
    case 'heading':
      if (block.text) {
        const level = Math.min(6, Math.max(3, block.headingLevel ?? 3));
        lines.push(
          `${'#'.repeat(level)} ${renderInlineContent(block.inlineContent, block.text, renderText)}`,
          ''
        );
      }
      return;
    case 'paragraph':
      if (block.text || block.inlineContent?.length) {
        lines.push(renderParagraphContent(block.inlineContent, block.text ?? '', renderText), '');
      }
      return;
    case 'list':
      if (block.items) {
        block.items.forEach((item, index) => {
          const marker = block.listStyle === 'ordered' ? `${index + 1}.` : '-';
          const rendered = renderParagraphContent(
            block.itemInlineContent?.[index],
            item,
            renderText
          );
          const continuationIndent = ' '.repeat(marker.length + 1);
          lines.push(
            rendered
              .split('\n')
              .map((line, lineIndex) =>
                lineIndex === 0 ? `${marker} ${line}` : `${continuationIndent}${line}`
              )
              .join('\n')
          );
        });
        lines.push('');
      }
      return;
    case 'quote':
    case 'callout':
      appendQuoteLikeBlock(lines, block, renderText);
      return;
    case 'code':
      if (block.text) {
        lines.push('```text', renderText(block.text), '```', '');
      }
      return;
    case 'record-field':
      appendRecordFieldBlock(lines, block, renderText);
      return;
    case 'thread-message':
      appendThreadMessageBlock(lines, block, renderText);
      return;
    case 'attachment':
      appendAttachmentBlock(lines, block, renderText);
      return;
    case 'data-table':
      appendDataTableBlock(lines, block, tablesById, renderText);
      return;
  }
}

export function appendBlockAwareSectionMarkdown({
  lines,
  section,
  blocks,
  tables,
  renderText = renderIdentity,
}: AppendBlockAwareSectionMarkdownParams): boolean {
  if (blocks.length === 0 || !isBlockAwareSection(section)) {
    return false;
  }

  lines.push(`## ${section.title}`, '');
  const tablesById = new Map(tables.map((table) => [table.id, table]));

  blocks.forEach((block) => {
    if (block.kind === 'heading' && block.text === section.title) {
      return;
    }

    appendMarkdownBlock(lines, block, tablesById, renderText);
  });

  ensureTrailingBlankLine(lines);
  return true;
}
