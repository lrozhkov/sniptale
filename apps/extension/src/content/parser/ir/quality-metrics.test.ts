import { describe, expect, it } from 'vitest';
import type { ParsedDocument, SectionNode } from '@sniptale/runtime-contracts/dom-tree';

import {
  countDuplicatePropertyLabelOverflow,
  measureBooleanPropertyNoise,
} from './quality-metrics';

function createDocument(structure: SectionNode[]): ParsedDocument {
  return {
    context: 'test',
    title: 'Quality metrics',
    structure,
  };
}

function shouldCountDuplicatePropertyLabelOverflow(): void {
  const documentData = createDocument([
    {
      type: 'section',
      id: 'section-1',
      title: 'Overview',
      selected: true,
      children: Array.from({ length: 5 }, (_, index) => ({
        type: 'field' as const,
        id: `field-${index + 1}`,
        label: 'Status',
        value: `Value ${index + 1}`,
        valueType: 'string' as const,
      })),
    },
  ]);

  expect(countDuplicatePropertyLabelOverflow(documentData)).toBe(2);
  expect(countDuplicatePropertyLabelOverflow(documentData.structure, 4)).toBe(1);
}

function shouldMeasureBooleanPropertyNoise(): void {
  const documentData = createDocument([
    {
      type: 'section',
      id: 'section-1',
      title: 'Flags',
      selected: true,
      children: [
        ...Array.from({ length: 8 }, (_, index) => ({
          type: 'field' as const,
          id: `flag-${index + 1}`,
          label: `Flag ${index + 1}`,
          value: 'Да',
          valueType: 'boolean' as const,
        })),
        {
          type: 'field',
          id: 'narrative',
          label: 'Summary',
          value: 'Longer narrative text',
          valueType: 'string',
          contentRole: 'paragraph',
        },
      ],
    },
  ]);

  expect(measureBooleanPropertyNoise(documentData)).toEqual({
    booleanFields: 8,
    isNoisy: true,
    totalFields: 9,
  });
}

describe('parser quality metrics', () => {
  it(
    'counts duplicate property label overflow beyond the configured threshold',
    shouldCountDuplicatePropertyLabelOverflow
  );

  it(
    'measures boolean property noise against total field count',
    shouldMeasureBooleanPropertyNoise
  );
});
