import { expect, it } from 'vitest';
import { extractCalloutCardCss, replaceCalloutCardCss } from './card-section';

it('replaces or removes only card declarations while preserving all other sections', () => {
  const source = [
    '[card]',
    'color: red;',
    '[title]',
    'opacity: .8;',
    '[connector]',
    'stroke: blue;',
  ].join('\n');
  expect(extractCalloutCardCss(source)).toBe('color: red;');
  expect(replaceCalloutCardCss(source, 'box-shadow: none;')).toBe(
    ['[card]', 'box-shadow: none;', '[title]', 'opacity: .8;', '[connector]', 'stroke: blue;'].join(
      '\n'
    )
  );
  expect(replaceCalloutCardCss(source, '')).toBe(
    ['[title]', 'opacity: .8;', '[connector]', 'stroke: blue;'].join('\n')
  );
});
