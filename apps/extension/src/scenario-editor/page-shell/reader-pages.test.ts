import { expect, it } from 'vitest';
import { createGuideStep } from '../../features/scenario/project/public';
import { guideReadingPages } from './reader-pages';

it('groups introductions with the following step and preserves trailing or section-only prose', () => {
  const section = (id: string) => ({ kind: 'section' as const, id, title: id, paragraphs: [] });
  const items = [
    section('a'),
    section('b'),
    createGuideStep('First', 'first'),
    createGuideStep('Second', 'second'),
    section('tail'),
  ];
  const before = structuredClone(items);
  expect(
    guideReadingPages(items).map((page) => [page.id, page.items.map((item) => item.id)])
  ).toEqual([
    ['first', ['a', 'b', 'first']],
    ['second', ['second']],
    ['tail', ['tail']],
  ]);
  expect(items).toEqual(before);
  expect(guideReadingPages([])).toEqual([]);
  expect(guideReadingPages([section('a'), section('b')])).toEqual([
    { id: 'a', items: [section('a'), section('b')] },
  ]);
});
