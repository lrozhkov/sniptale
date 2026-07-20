import { describe, expect, it } from 'vitest';
import type { ParsedDocument, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { countDocumentQuality } from './scoring';

function createParagraphSection(id: string, title: string, value: string): SectionNode {
  return {
    type: 'section',
    id,
    title,
    selected: true,
    children: [
      {
        type: 'field',
        id: `${id}-field`,
        label: 'Text',
        value,
        valueType: 'string',
        contentRole: 'paragraph',
      },
    ],
  };
}

function createDocument(structure: SectionNode[]): ParsedDocument {
  return {
    context: 'test',
    title: 'Test page',
    structure,
  };
}

function createDuplicatePropertyPenaltyDocuments() {
  return {
    duplicateDocument: createDocument([
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
    ]),
    uniqueDocument: createDocument([
      {
        type: 'section',
        id: 'section-1',
        title: 'Overview',
        selected: true,
        children: [
          {
            type: 'field',
            id: 'field-1',
            label: 'Status',
            value: 'One',
            valueType: 'string',
          },
        ],
      },
    ]),
  };
}

describe('parse-page scoring', () => {
  it('penalizes duplicate section titles when they repeat narrative content surfaces', () => {
    const uniqueDocument = createDocument([
      createParagraphSection('section-1', 'Overview', 'One paragraph'),
      createParagraphSection('section-2', 'Details', 'Another paragraph'),
    ]);
    const duplicateTitleDocument = createDocument([
      createParagraphSection('section-1', 'Overview', 'One paragraph'),
      createParagraphSection('section-2', 'Overview', 'Another paragraph'),
    ]);

    expect(countDocumentQuality(uniqueDocument)).toBeGreaterThan(
      countDocumentQuality(duplicateTitleDocument)
    );
  });

  it('applies duplicate-property penalties through the shared quality metrics helper', () => {
    const { duplicateDocument, uniqueDocument } = createDuplicatePropertyPenaltyDocuments();

    expect(countDocumentQuality(uniqueDocument)).toBeGreaterThan(
      countDocumentQuality(duplicateDocument)
    );
  });
});
