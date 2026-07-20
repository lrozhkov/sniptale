import { describe, expect, it } from 'vitest';
import type { PromptTemplate } from '../../../../../contracts/settings';
import { buildTemplateListDerivedState } from './derived';

describe('template-list-derived-state', () => {
  it('preserves saved order and limits visible templates by default', () => {
    const templates = [
      { id: 'b', name: 'B', content: 'b' },
      { id: 'a', name: 'A', content: 'a' },
      { id: 'c', name: 'C', content: 'c' },
    ] as PromptTemplate[];

    const result = buildTemplateListDerivedState({
      orderedIds: ['a', 'b', 'c'],
      showAll: false,
      templates,
    });

    expect(result.orderedTemplates.map((template) => template.id)).toEqual(['a', 'b', 'c']);
    expect(result.visibleTemplates.map((template) => template.id)).toEqual(['a', 'b', 'c']);
    expect(result.hasMore).toBe(false);
  });

  it('reports overflow and returns all templates when showAll is enabled', () => {
    const templates = Array.from({ length: 7 }, (_, index) => ({
      content: `template-${index + 1}`,
      id: `template-${index + 1}`,
      name: `Template ${index + 1}`,
    })) as PromptTemplate[];

    const result = buildTemplateListDerivedState({
      orderedIds: templates.map((template) => template.id),
      showAll: true,
      templates,
    });

    expect(result.hasMore).toBe(true);
    expect(result.visibleTemplates).toEqual(result.orderedTemplates);
  });
});
