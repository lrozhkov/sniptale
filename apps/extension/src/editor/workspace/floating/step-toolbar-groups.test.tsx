// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import type { CompactCommand } from '../../inspector/compact';
import { createStepToolbarGroups, isStepToolbarCommandSet } from './step-toolbar-groups';

function command(id: string, value?: string): CompactCommand {
  return {
    id,
    title: id,
    trigger: <span>{id}</span>,
    content: <div>{id}</div>,
    ...(value === undefined ? {} : { value }),
  };
}

it('builds step toolbar groups with stable content color stroke and geometry order', () => {
  const groups = createStepToolbarGroups([
    command('step-template'),
    command('step-type'),
    command('step-value'),
    command('step-alphabet'),
    command('step-text-color', '#111111'),
    command('step-color', '#222222'),
    command('step-opacity', '50%'),
    command('step-stroke-width', '3px'),
    command('step-stroke-color', '#333333'),
    command('step-stroke-opacity', '70%'),
    command('step-size', '48px'),
  ]);

  expect(isStepToolbarCommandSet([command('step-type')])).toBe(true);
  expect(groups?.map((group) => group.id)).toEqual([
    'templates',
    'content',
    'text-color',
    'fill',
    'stroke',
    'geometry',
  ]);
  expect(groups?.find((group) => group.id === 'text-color')?.title).toBe(
    translate('editor.compact.stepTextColor')
  );
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'fill')?.trigger}</>)
  ).toContain('#222222');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'stroke')?.content}</>)
  ).toContain('step-stroke-opacity');
});

it('omits step groups for unrelated commands and uses transparent fill icon state', () => {
  expect(isStepToolbarCommandSet([command('line-width')])).toBe(false);
  expect(createStepToolbarGroups([command('line-width')])).toBeNull();

  const groups = createStepToolbarGroups([
    command('step-color', '#445566'),
    command('step-opacity', '0%'),
    command('step-stroke-color', '#778899'),
    command('step-stroke-opacity', 'invalid'),
  ]);

  const fillTrigger = renderToStaticMarkup(
    <>{groups?.find((group) => group.id === 'fill')?.trigger}</>
  );
  const strokeTrigger = renderToStaticMarkup(
    <>{groups?.find((group) => group.id === 'stroke')?.trigger}</>
  );

  expect(fillTrigger).toContain('--editor-tabler-color-icon-opacity:0');
  expect(strokeTrigger).toContain('#778899');
});
