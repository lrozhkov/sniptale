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

  it('keeps every hard-broken line inside a quote', () => {
    const lines: string[] = [];

    appendBlockAwareSectionMarkdown({
      lines,
      section: {
        type: 'section',
        id: 'section-1',
        title: 'Summary',
        children: [],
        kind: 'narrative',
      },
      blocks: [
        {
          id: 'block-quote',
          sectionId: 'section-1',
          kind: 'quote',
          text: 'First line Second line',
          inlineContent: [
            { kind: 'text', text: 'First line' },
            { kind: 'line-break' },
            { kind: 'text', text: 'Second line' },
          ],
        },
      ],
      tables: [],
    });

    expect(lines).toEqual(['## Summary', '', '> First line  \n> Second line', '']);
  });

  it('keeps hard-break continuations inside paragraphs and ordered list items', () => {
    const lines: string[] = [];
    const inlineContent = [
      { kind: 'text' as const, text: 'First line' },
      { kind: 'line-break' as const },
      { kind: 'text' as const, text: '# Second line' },
    ];

    appendBlockAwareSectionMarkdown({
      lines,
      section: {
        type: 'section',
        id: 'section-1',
        title: 'Summary',
        children: [],
        kind: 'narrative',
      },
      blocks: [
        {
          id: 'block-paragraph',
          sectionId: 'section-1',
          kind: 'paragraph',
          text: 'First line # Second line',
          inlineContent,
        },
        {
          id: 'block-list',
          sectionId: 'section-1',
          kind: 'list',
          items: ['First line # Second line'],
          itemInlineContent: [inlineContent],
          listStyle: 'ordered',
        },
      ],
      tables: [],
    });

    expect(lines).toEqual([
      '## Summary',
      '',
      'First line  \n\\# Second line',
      '',
      '1. First line  \n   \\# Second line',
      '',
    ]);
  });
});
