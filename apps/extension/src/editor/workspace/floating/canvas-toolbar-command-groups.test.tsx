// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { CompactCommandField, type CompactCommand } from '../../inspector/compact';
import {
  createCanvasCommandGroups,
  renderFloatingToolbarCommandBody,
} from './canvas-toolbar-command-groups';
import { getCanvasToolbarGroupTrigger } from './canvas-toolbar-model';

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

it('hides compact command field labels inside floating toolbar groups', () => {
  const multiGroups = createCanvasCommandGroups([
    fieldCommand('shape-stroke-width', 'Толщина'),
    fieldCommand('shape-stroke-style', 'Стиль'),
  ]);
  const singleGroups = createCanvasCommandGroups([fieldCommand('shape-fill-color', 'Заливка')]);
  const preservedGroups = createCanvasCommandGroups([
    {
      ...fieldCommand('step-size', 'Размер'),
      preservePopoverLabel: true,
    },
  ]);

  const strokeMarkup = renderToStaticMarkup(
    <>{multiGroups.find((group) => group.kind === 'stroke')?.content}</>
  );
  const fillMarkup = renderToStaticMarkup(
    <>{singleGroups.find((group) => group.kind === 'fill')?.content}</>
  );
  const preservedMarkup = renderToStaticMarkup(
    <>{preservedGroups.find((group) => group.kind === 'geometry')?.content}</>
  );

  expect(strokeMarkup).not.toContain('Толщина');
  expect(strokeMarkup).not.toContain('Стиль');
  expect(strokeMarkup).toContain('control-shape-stroke-width');
  expect(strokeMarkup).toContain('control-shape-stroke-style');
  expect(fillMarkup).not.toContain('Заливка');
  expect(fillMarkup).toContain('control-shape-fill-color');
  expect(preservedMarkup).not.toContain('Размер');
  expect(preservedMarkup).toContain('control-step-size');
});

it('sorts commands into stable semantic groups and skips direct more rendering', () => {
  const groups = createCanvasCommandGroups([
    fieldCommand('shape-template', 'Template'),
    fieldCommand('text-font-family', 'Font'),
    fieldCommand('shape-fill-color', 'Fill'),
    fieldCommand('shape-stroke-width', 'Stroke'),
    fieldCommand('shape-radius', 'Radius'),
    fieldCommand('rich-shape-tail', 'Tail'),
    fieldCommand('text-align', 'Align'),
    fieldCommand('shape-shadow', 'Shadow'),
    fieldCommand('duplicate-layer', 'Duplicate'),
  ]);

  expect(groups.map((group) => group.kind)).toEqual([
    'templates',
    'content',
    'fill',
    'stroke',
    'geometry',
    'layout',
    'effects',
  ]);
  expect(renderToStaticMarkup(<>{groups[0]?.trigger}</>)).toContain('shape-template');
  expect(renderToStaticMarkup(<>{groups[2]?.trigger}</>)).toContain('shape-fill-color');
  expect(renderToStaticMarkup(<>{groups[4]?.content}</>)).toContain('control-rich-shape-tail');
});

it('renders fallback command bodies and toolbar trigger fallbacks', async () => {
  const onClick = vi.fn(async () => undefined);
  const activeMarkup = renderToStaticMarkup(
    <>
      {renderFloatingToolbarCommandBody({
        active: true,
        id: 'toggle',
        onClick,
        title: 'Toggle command',
        trigger: 'ON',
      })}
    </>
  );
  const disabledMarkup = renderToStaticMarkup(
    <>
      {renderFloatingToolbarCommandBody({
        disabled: true,
        id: 'disabled',
        title: 'Disabled command',
        trigger: null,
      })}
    </>
  );

  expect(activeMarkup).toContain('aria-pressed="true"');
  expect(activeMarkup).toContain('Toggle command');
  expect(activeMarkup).toContain('ON');
  expect(disabledMarkup).toContain('disabled=""');
  expect(renderToStaticMarkup(<>{getCanvasToolbarGroupTrigger('templates', [])}</>)).toContain(
    'svg'
  );
  expect(renderToStaticMarkup(<>{getCanvasToolbarGroupTrigger('fill', [])}</>)).toContain('svg');
  expect(renderToStaticMarkup(<>{getCanvasToolbarGroupTrigger('stroke', [])}</>)).toContain(
    'border-top'
  );
  expect(renderToStaticMarkup(<>{getCanvasToolbarGroupTrigger('geometry', [])}</>)).toContain(
    'svg'
  );
  expect(renderToStaticMarkup(<>{getCanvasToolbarGroupTrigger('layout', [])}</>)).toContain('svg');
  expect(renderToStaticMarkup(<>{getCanvasToolbarGroupTrigger('effects', [])}</>)).toContain('svg');
  expect(renderToStaticMarkup(<>{getCanvasToolbarGroupTrigger('more', [])}</>)).toContain('span');
});
