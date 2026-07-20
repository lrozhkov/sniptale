import { describe, expect, it } from 'vitest';
import type { ParsedDocument, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { countDocumentQuality } from './scoring';

function createDocument(structure: SectionNode[]): ParsedDocument {
  return {
    context: 'test',
    title: 'Scoring document',
    structure,
  };
}

function createSection(title: string, children: SectionNode['children']): SectionNode {
  return {
    type: 'section',
    id: title.toLowerCase().replace(/\s+/g, '-'),
    title,
    selected: true,
    children,
  };
}

function createNarrativeDocument(): ParsedDocument {
  return createDocument([
    createSection('Narrative', [
      {
        type: 'field',
        id: 'paragraph',
        label: 'Body',
        value:
          'A long narrative paragraph should score much higher than short boolean property noise.',
        valueType: 'string',
        contentRole: 'paragraph',
      },
      {
        type: 'field',
        id: 'link',
        label: 'Reference',
        value: 'Read more',
        valueType: 'link',
      },
    ]),
  ]);
}

function createBooleanNoiseDocument(): ParsedDocument {
  const children = Array.from({ length: 8 }, (_, index) => ({
    type: 'field' as const,
    id: `flag-${index}`,
    label: `Flag ${index}`,
    value: 'Да',
    valueType: 'boolean' as const,
  }));

  return createDocument([createSection('Flags', children)]);
}

function createHealthySectionDocument(): ParsedDocument {
  return createDocument([
    createSection('Overview', [
      {
        type: 'field',
        id: 'status',
        label: 'Status',
        value: 'In progress with detailed narrative',
        valueType: 'string',
      },
      {
        type: 'field',
        id: 'owner',
        label: 'Owner',
        value: 'Long descriptive owner value',
        valueType: 'string',
      },
    ]),
    createSection('Checklist', [
      {
        type: 'field',
        id: 'item-1',
        label: 'Step',
        value: 'A much longer list item to avoid short-list penalties',
        valueType: 'string',
        contentRole: 'list-item',
      },
    ]),
  ]);
}

function createDegradedSectionDocument(): ParsedDocument {
  const duplicateFields = ['dup-1', 'dup-2', 'dup-3', 'dup-4'].map((id) => ({
    type: 'field' as const,
    id,
    label: 'Status',
    value: 'Short',
    valueType: 'string' as const,
  }));

  return createDocument([
    createSection('Overview', duplicateFields),
    createSection('Overview', [
      {
        type: 'field',
        id: 'list-1',
        label: 'Step',
        value: 'Tiny',
        valueType: 'string',
        contentRole: 'list-item',
      },
    ]),
  ]);
}

function createPropertyOnlyDocument(): ParsedDocument {
  const children = ['A', 'B', 'C', 'D'].map((label, index) => ({
    type: 'field' as const,
    id: `field-${index + 1}`,
    label,
    value: 'Short',
    valueType: 'string' as const,
  }));

  return createDocument([createSection('Metadata', children)]);
}

function createRicherMixedDocument(): ParsedDocument {
  return createDocument([
    createSection('Metadata', [
      {
        type: 'field',
        id: 'field-1',
        label: 'Narrative',
        value:
          'This longer paragraph should avoid the property-only penalty by being content-rich.',
        valueType: 'string',
        contentRole: 'paragraph',
      },
      {
        type: 'table',
        id: 'table-1',
        headers: ['Name'],
        rows: [
          {
            id: 'row-1',
            selected: true,
            selector: '[data-row=\"1\"]',
            data: { Name: 'Attachment' },
          },
        ],
      },
    ]),
  ]);
}

function registerNarrativeVsBooleanNoiseTest() {
  it('prefers rich narrative and link content over boolean-heavy short property sections', () => {
    expect(countDocumentQuality(createNarrativeDocument())).toBeGreaterThan(
      countDocumentQuality(createBooleanNoiseDocument())
    );
  });
}

function registerDuplicatePenaltyTest() {
  it('penalizes duplicate property labels, short list items, and duplicate non-narrative section titles', () => {
    expect(countDocumentQuality(createHealthySectionDocument())).toBeGreaterThan(
      countDocumentQuality(createDegradedSectionDocument())
    );
  });
}

function registerPropertyOnlyPenaltyTest() {
  it('penalizes property-only sections without tables or paragraphs more than richer mixed sections', () => {
    expect(countDocumentQuality(createRicherMixedDocument())).toBeGreaterThan(
      countDocumentQuality(createPropertyOnlyDocument())
    );
  });
}

function runScoringBranchesSuite() {
  registerNarrativeVsBooleanNoiseTest();
  registerDuplicatePenaltyTest();
  registerPropertyOnlyPenaltyTest();
}

describe('parse-page scoring branches', runScoringBranchesSuite);
