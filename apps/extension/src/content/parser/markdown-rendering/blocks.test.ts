import { describe, expect, it } from 'vitest';

import { appendBlockAwareSectionMarkdown, appendMarkdownTable } from './blocks';

describe('markdown block rendering', () => {
  it('escapes backslashes inside markdown table cells', () => {
    const lines: string[] = [];

    appendMarkdownTable(lines, ['Name'], [{ Name: 'path\\to|value\nnext' }]);

    expect(lines).toContain('| path\\\\to\\|value<br>next |');
  });

  it('renders record-field blocks as markdown property bullets', () => {
    const lines: string[] = [];

    expect(
      appendBlockAwareSectionMarkdown({
        lines,
        section: {
          type: 'section',
          id: 'section-1',
          title: 'Summary',
          children: [],
          kind: 'results',
        },
        blocks: [
          {
            id: 'block-record',
            sectionId: 'section-1',
            kind: 'record-field',
            items: ['Status', 'Open'],
          },
        ],
        tables: [],
      })
    ).toBe(true);

    expect(lines).toEqual(['## Summary', '', '- **Status:** Open', '']);
  });
});
