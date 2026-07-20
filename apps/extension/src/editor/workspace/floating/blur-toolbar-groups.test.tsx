// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import type { CompactCommand } from '../../inspector/compact';
import { createBlurToolbarGroups, isBlurToolbarCommandSet } from './blur-toolbar-groups';

function command(id: string, value?: string): CompactCommand {
  return {
    id,
    title: id,
    trigger: null,
    content: <div>{id}</div>,
    ...(value === undefined ? {} : { value }),
  };
}

it('builds blur groups in the requested effect and frame order', () => {
  const groups = createBlurToolbarGroups([
    command('blur-template'),
    command('blur-type', 'Gaussian'),
    command('blur-amount', '11'),
    command('blur-radius', '8px'),
    command('blur-stroke-width', '5px'),
    command('blur-stroke-style', 'Dash'),
    command('blur-stroke-color', '#112233'),
    command('blur-stroke-opacity', '60%'),
  ]);

  expect(isBlurToolbarCommandSet([command('blur-type')])).toBe(true);
  expect(groups?.map((group) => group.id)).toEqual(['templates', 'effect', 'border']);
  expect(groups?.map((group) => group.kind)).toEqual(['templates', 'content', 'stroke']);
  expect(groups?.find((group) => group.id === 'effect')?.title).toBe(
    translate('editor.compact.blurEffectSettings')
  );
  expect(groups?.find((group) => group.id === 'border')?.title).toBe(
    translate('editor.compact.blurBorder')
  );
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'effect')?.content}</>)
  ).toContain('blur-radius');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'border')?.content}</>)
  ).toContain('blur-stroke-opacity');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'effect')?.trigger}</>)
  ).toContain('span');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'border')?.trigger}</>)
  ).toContain('place-items-center');
});

it('keeps only border dots visible when blur frame is disabled', () => {
  const groups = createBlurToolbarGroups([
    command('blur-type', 'Gaussian'),
    command('blur-amount', '11'),
    command('blur-radius', '8px'),
    command('blur-stroke-width', '0px'),
    command('blur-stroke-style', 'Solid'),
    command('blur-stroke-color', '#112233'),
    command('blur-stroke-opacity', '0%'),
  ]);

  const triggerMarkup = renderToStaticMarkup(
    <>{groups?.find((group) => group.id === 'border')?.trigger}</>
  );

  expect(triggerMarkup).toContain('rounded-full');
});
