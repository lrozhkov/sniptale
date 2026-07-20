import { vi, expect, it, describe } from 'vitest';

const convertTreeToMarkdownMock = vi.hoisted(() => vi.fn(() => '# popup export'));

vi.mock('../../dom-tree-parser/ai/format', () => ({
  convertTreeToMarkdown: convertTreeToMarkdownMock,
}));

import { buildPopupExportPreview } from './preview';

describe('buildPopupExportPreview', () => {
  it('builds preview data with counted rows and markdown output', () => {
    const preview = buildPopupExportPreview({
      context: 'ctx',
      structure: [
        {
          children: [{ rows: [{}, {}], type: 'table' }, { type: 'text' }],
        },
      ],
      title: 'Popup',
    } as never);

    expect(preview).toEqual({
      context: 'ctx',
      jsonPreview: expect.stringContaining('"title": "Popup"'),
      markdownPreview: '# popup export',
      rowsCount: 2,
      sectionsCount: 1,
      title: 'Popup',
    });
  });
});
