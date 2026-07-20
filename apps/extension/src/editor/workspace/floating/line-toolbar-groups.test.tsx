// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import type { CompactCommand } from '../../inspector/compact';
import { createLineToolbarGroups, isLineToolbarCommandSet } from './line-toolbar-groups';

function command(id: string, value?: string): CompactCommand {
  return {
    id,
    title: id,
    trigger: <span>{id}</span>,
    content: <div>{id}</div>,
    ...(value === undefined ? {} : { value }),
  };
}

it('builds line toolbar groups with stable geometry color style corner fill and shadow order', () => {
  const groups = createLineToolbarGroups([
    command('line-template'),
    command('line-width', '6px'),
    command('line-roughness', '1'),
    command('line-bowing', '2'),
    command('line-color', '#112233'),
    command('line-opacity', '60%'),
    command('line-style', 'Dash'),
    command('line-corners', 'Round'),
    command('line-fill', 'Gradient'),
    command('line-shadow', '20/100'),
  ]);

  expect(isLineToolbarCommandSet([command('line-width')])).toBe(true);
  expect(groups?.map((group) => group.id)).toEqual([
    'templates',
    'geometry',
    'line-color',
    'style',
    'corners',
    'fill',
    'shadow',
  ]);
  expect(groups?.find((group) => group.id === 'line-color')?.title).toBe(
    translate('editor.compact.lineColor')
  );
  expect(groups?.find((group) => group.id === 'style')?.title).toBe(
    translate('editor.compact.lineStyle')
  );
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'geometry')?.content}</>)
  ).toContain('line-roughness');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'fill')?.content}</>)
  ).toContain('line-fill');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'shadow')?.content}</>)
  ).toContain('line-shadow');
});

it('returns null for non-line command sets and uses fallback line group triggers', () => {
  expect(isLineToolbarCommandSet([command('shape-fill-color')])).toBe(false);
  expect(createLineToolbarGroups([command('shape-fill-color')])).toBeNull();

  const groups = createLineToolbarGroups([
    command('line-color', '#112233'),
    command('line-opacity', 'invalid'),
    command('line-style'),
    command('line-corners'),
    command('line-fill'),
    command('line-shadow'),
  ]);

  expect(groups?.map((group) => group.id)).toEqual([
    'line-color',
    'style',
    'corners',
    'fill',
    'shadow',
  ]);
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'line-color')?.trigger}</>)
  ).toContain('span');
});

it('clamps line opacity in the color trigger underline', () => {
  const groups = createLineToolbarGroups([
    command('line-color', '#334455'),
    command('line-opacity', '175%'),
  ]);

  const trigger = renderToStaticMarkup(
    <>{groups?.find((group) => group.id === 'line-color')?.trigger}</>
  );

  expect(trigger).toContain('#334455');
  expect(trigger).toContain('opacity:1');
});
