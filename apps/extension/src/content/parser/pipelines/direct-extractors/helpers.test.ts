import { describe, expect, it } from 'vitest';
import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { mergeDirectExtractionSections } from './helpers';

function createSection(id: string, title: string, value: string): SectionNode {
  return {
    type: 'section',
    id: `section-${id}`,
    title,
    kind: 'narrative',
    children: [
      {
        type: 'field',
        id: `field-${id}`,
        label: 'Text',
        value,
        valueType: 'string',
        contentRole: 'paragraph',
      },
    ],
    selected: true,
  };
}

describe('direct-extractors helpers', () => {
  it('preserves same-title sections when their content differs', () => {
    const merged = mergeDirectExtractionSections(
      [createSection('current', 'Overview', 'Current summary')],
      [createSection('direct', 'Overview', 'Direct extraction summary')]
    );

    expect(merged).toHaveLength(2);
    expect(merged.map((section) => section.children[0])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'Current summary' }),
        expect.objectContaining({ value: 'Direct extraction summary' }),
      ])
    );
  });

  it('replaces an existing section when the extracted structure matches the same signature', () => {
    const merged = mergeDirectExtractionSections(
      [createSection('current', 'Overview', 'Shared summary')],
      [createSection('direct', 'Overview', 'Shared summary')]
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('section-direct');
  });

  it('keeps sections distinct when only trailing content differs after the old truncation boundary', () => {
    const merged = mergeDirectExtractionSections(
      [createSection('current', 'Overview', `${'A'.repeat(80)}left`)],
      [createSection('direct', 'Overview', `${'A'.repeat(80)}right`)]
    );

    expect(merged).toHaveLength(2);
  });
});
