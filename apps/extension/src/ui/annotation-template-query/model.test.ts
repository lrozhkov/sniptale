import { describe, expect, it } from 'vitest';
import { queryAnnotationTemplates } from './model';

const tags = [
  { id: 'training', label: 'Обучение' },
  { id: 'review', label: 'Review' },
];
const items = [
  { id: 'one', displayName: 'Акцент', tagIds: ['training'] },
  { id: 'two', displayName: 'Warning', tagIds: ['review'] },
  { id: 'three', displayName: 'Plain', tagIds: [] },
];

describe('queryAnnotationTemplates', () => {
  it('searches localized names and tag labels with Unicode normalization', () => {
    expect(
      queryAnnotationTemplates({ activeFilterTagIds: [], items, query: 'обучение', tags }).map(
        (item) => item.id
      )
    ).toEqual(['one']);
    expect(
      queryAnnotationTemplates({ activeFilterTagIds: [], items, query: 'WARNING', tags }).map(
        (item) => item.id
      )
    ).toEqual(['two']);
  });

  it('uses OR tag matching and preserves source order', () => {
    expect(
      queryAnnotationTemplates({
        activeFilterTagIds: ['review', 'training'],
        items,
        query: '',
        tags,
      }).map((item) => item.id)
    ).toEqual(['one', 'two']);
  });

  it('pins the active template ahead of matching results', () => {
    expect(
      queryAnnotationTemplates({
        activeFilterTagIds: ['review'],
        activeTemplateId: 'one',
        items,
        query: '',
        tags,
      }).map((item) => item.id)
    ).toEqual(['one', 'two']);
    expect(
      queryAnnotationTemplates({
        activeFilterTagIds: ['review', 'training'],
        activeTemplateId: 'two',
        items,
        query: '',
        tags,
      }).map((item) => item.id)
    ).toEqual(['two', 'one']);
  });
});
