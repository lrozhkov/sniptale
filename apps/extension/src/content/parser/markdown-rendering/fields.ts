import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';

function formatMarkdownLinkValue(
  field: Pick<FieldNode, 'valueType' | 'linkRef'>,
  value: string
): string {
  return field.valueType === 'link' && field.linkRef ? `[${value}](${field.linkRef})` : value;
}

export function escapeMarkdownFieldValue(value: string): string {
  return (value || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

export function appendMarkdownField(
  lines: string[],
  field: Pick<FieldNode, 'label' | 'valueType' | 'linkRef' | 'contentRole'>,
  value: string
): void {
  const formattedValue = formatMarkdownLinkValue(field, value);
  const contentRole = field.contentRole ?? 'property';

  if (contentRole === 'paragraph') {
    lines.push(formattedValue, '');
    return;
  }

  if (contentRole === 'list-item') {
    lines.push(`- ${formattedValue}`);
    return;
  }

  lines.push(`- **${field.label}:** ${formattedValue}`);
}

export function ensureTrailingBlankLine(lines: string[]): void {
  if (lines.at(-1) !== '') {
    lines.push('');
  }
}
