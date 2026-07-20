// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { translate } from '../../../platform/i18n';
import { CompactCommandField, type CompactCommand } from '../../inspector/compact';
import {
  createCanvasCommandGroups,
  renderFloatingToolbarCommandBody,
} from './canvas-toolbar-command-groups';
import { createBlurToolbarGroups } from './blur-toolbar-groups';
import { createBrushToolbarGroups, isBrushToolbarCommandSet } from './brush-toolbar-groups';
import { createLineToolbarGroups } from './line-toolbar-groups';
import { createStepToolbarGroups } from './step-toolbar-groups';
import { createTextToolbarGroups } from './text-toolbar-groups';

function command(id: string, value?: string, active?: boolean): CompactCommand {
  return {
    id,
    title: id,
    trigger: id.endsWith('-width') ? `${value ?? '8'}px` : null,
    content: <div>{id}</div>,
    ...(value === undefined ? {} : { value }),
    ...(active === undefined ? {} : { active }),
  };
}

function fieldCommand(id: string, label: string): CompactCommand {
  return {
    id,
    title: label,
    trigger: id,
    content: (
      <CompactCommandField label={label} value="42">
        <div>control-{id}</div>
      </CompactCommandField>
    ),
  };
}

it('builds pencil groups in the requested brush toolbar order', () => {
  const groups = createBrushToolbarGroups([
    command('pencil-template'),
    command('pencil-color', '#ff6600'),
    command('pencil-width', '8px'),
    command('pencil-dynamic-width', undefined, true),
    command('pencil-smoothing', undefined, false),
    command('pencil-opacity', '80%'),
    command('pencil-shadow'),
  ]);

  expect(groups?.map((group) => group.id)).toEqual([
    'templates',
    'geometry',
    'line-color',
    'shadow',
  ]);
  expect(groups?.map((group) => group.kind)).toEqual([
    'templates',
    'geometry',
    'stroke',
    'effects',
  ]);
  expect(groups?.find((group) => group.id === 'line-color')?.title).toBe(
    translate('editor.compact.lineColor')
  );
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'geometry')?.content}</>)
  ).toContain('pencil-dynamic-width');
});

it('builds highlighter groups without pencil-only shadow or dynamic width', () => {
  const groups = createBrushToolbarGroups([
    command('highlighter-template'),
    command('highlighter-color', '#ffee00'),
    command('highlighter-width', '16px'),
    command('highlighter-smoothing', undefined, true),
    command('highlighter-opacity', '45%'),
  ]);

  expect(isBrushToolbarCommandSet([command('highlighter-color')])).toBe(true);
  expect(groups?.map((group) => group.id)).toEqual(['templates', 'geometry', 'line-color']);
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'geometry')?.content}</>)
  ).not.toContain('dynamic-width');
});

it('renders active toolbar commands as compact toggle rows', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  let clicked = false;
  const markup = renderToStaticMarkup(
    <>
      {renderFloatingToolbarCommandBody({
        active: true,
        id: 'pencil-smoothing',
        onClick: () => {
          clicked = true;
        },
        title: 'Сглаживание',
        trigger: 'Вкл',
      })}
    </>
  );

  expect(markup).toContain('shared.ui.compact-inspector.option-row');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('Сглаживание');
  expect(markup).toContain('Вкл');

  act(() => {
    root.render(
      <>
        {renderFloatingToolbarCommandBody({
          active: true,
          id: 'pencil-smoothing',
          onClick: () => {
            clicked = true;
          },
          title: 'Сглаживание',
          trigger: 'Вкл',
        })}
      </>
    );
  });
  act(() => {
    container.querySelector('button')?.click();
  });
  act(() => root.unmount());

  expect(clicked).toBe(true);
});

it('groups canvas toolbar commands and hides field labels in floating content', () => {
  const groups = createCanvasCommandGroups([
    fieldCommand('shape-template', 'Template'),
    fieldCommand('text-font-family', 'Font'),
    fieldCommand('shape-fill-color', 'Fill'),
    fieldCommand('shape-stroke-width', 'Stroke'),
    fieldCommand('shape-stroke-style', 'Style'),
    fieldCommand('shape-radius', 'Radius'),
    fieldCommand('rich-shape-tail', 'Tail'),
    fieldCommand('text-align', 'Align'),
    fieldCommand('shape-shadow', 'Shadow'),
  ]);
  const strokeMarkup = renderToStaticMarkup(
    <>{groups.find((group) => group.kind === 'stroke')?.content}</>
  );
  const fillMarkup = renderToStaticMarkup(
    <>{groups.find((group) => group.kind === 'fill')?.content}</>
  );

  expect(groups.map((group) => group.kind)).toEqual([
    'templates',
    'content',
    'fill',
    'stroke',
    'geometry',
    'layout',
    'effects',
  ]);
  expect(strokeMarkup).not.toContain('Stroke');
  expect(strokeMarkup).not.toContain('Style');
  expect(strokeMarkup).toContain('control-shape-stroke-width');
  expect(strokeMarkup).toContain('control-shape-stroke-style');
  expect(fillMarkup).not.toContain('Fill');
  expect(fillMarkup).toContain('control-shape-fill-color');
});

it('hides field labels inside line, blur, step, and text floating groups', () => {
  const groupSets = [
    createLineToolbarGroups([
      fieldCommand('line-width', 'Line width'),
      fieldCommand('line-style', 'Line style'),
    ]),
    createBlurToolbarGroups([
      fieldCommand('blur-type', 'Blur type'),
      fieldCommand('blur-amount', 'Blur amount'),
    ]),
    createStepToolbarGroups([
      fieldCommand('step-type', 'Step type'),
      fieldCommand('step-value', 'Step value'),
    ]),
    createTextToolbarGroups([
      fieldCommand('text-font', 'Text font'),
      fieldCommand('text-bold', 'Text bold'),
    ]),
  ];

  const markup = renderToStaticMarkup(
    <>{groupSets.flatMap((groups) => (groups ?? []).map((group) => group.content))}</>
  );

  expect(markup).toContain('control-line-width');
  expect(markup).toContain('control-blur-type');
  expect(markup).toContain('control-step-type');
  expect(markup).toContain('control-text-font');
  expect(markup).not.toContain('Line width');
  expect(markup).not.toContain('Blur type');
  expect(markup).not.toContain('Step type');
  expect(markup).not.toContain('Text font');
});
