import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { getDataSpoilerSummary } from './summary';

const { translateMock } = vi.hoisted(() => ({
  translateMock: vi.fn((key: string) => {
    const messages: Record<string, string> = {
      'aiModal.dataSummaryAllPrefix': 'All ',
      'aiModal.dataSummaryAllSuffix': ' selected',
      'aiModal.dataSummaryNone': 'None selected',
      'aiModal.dataSummarySomeMiddle': ' of ',
      'aiModal.dataSummarySomePrefix': 'Selected ',
      'aiModal.dataSummarySomeSuffix': ' fields',
    };
    return messages[key] ?? key;
  }),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),

  translate: translateMock,
}));

const sampleTreeData = {
  context: 'Issue details',
  title: 'AI picker',
  structure: [
    {
      children: [
        {
          id: 'field-1',
          label: 'Status',
          selected: true,
          type: 'field',
          value: 'Open',
          valueType: 'string',
        },
        {
          headers: ['Name', 'Role'],
          id: 'table-1',
          rows: [
            {
              data: { Name: 'Alice', Role: 'Owner' },
              id: 'row-1',
              selected: true,
            },
          ],
          selected: true,
          type: 'table',
        },
      ],
      id: 'section-1',
      selected: true,
      title: 'Section',
      type: 'section',
    },
  ],
} as unknown as ParsedDOMTree;

beforeEach(() => {
  translateMock.mockClear();
});

describe('getDataSpoilerSummary', () => {
  it('returns translated empty, partial, and full summaries', () => {
    expect(getDataSpoilerSummary(null, new Map())).toBe('');

    const unselectedState = new Map([
      ['field-1', { expanded: true, id: 'field-1', selected: false }],
      ['row-1', { expanded: true, id: 'row-1', selected: false }],
    ]);
    expect(getDataSpoilerSummary(sampleTreeData, unselectedState)).toBe('None selected');

    const partialState = new Map([
      ['field-1', { expanded: true, id: 'field-1', selected: true }],
      ['row-1', { expanded: true, id: 'row-1', selected: false }],
    ]);
    expect(getDataSpoilerSummary(sampleTreeData, partialState)).toBe('Selected 1 of 2 fields');

    const allState = new Map([
      ['field-1', { expanded: true, id: 'field-1', selected: true }],
      ['row-1', { expanded: true, id: 'row-1', selected: true }],
    ]);
    expect(getDataSpoilerSummary(sampleTreeData, allState)).toBe('All 2 selected');
  });
});
