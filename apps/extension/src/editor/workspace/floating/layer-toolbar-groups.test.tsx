import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { createInspectorCommandParams } from '../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildRichShapeCompactCommands } from '../../inspector/compact/tool-commands/rich-shape';
import { CompactCommandField, type CompactCommand } from '../../inspector/compact';
import { createLayerToolbarCommandGroups } from './layer-toolbar-groups';

function fieldCommand(id: string, label: string): CompactCommand {
  return {
    id,
    title: label,
    trigger: label,
    content: (
      <CompactCommandField label={label} value="value">
        <div>{`${label} body`}</div>
      </CompactCommandField>
    ),
  };
}

function command(id: string): CompactCommand {
  return {
    id,
    title: id,
    trigger: id,
  };
}

it('renders layer toolbar command bodies without duplicate field headers', () => {
  const groups = createLayerToolbarCommandGroups([fieldCommand('image-fill-color', 'Fill color')]);
  const markup = renderToStaticMarkup(
    <>{groups.find((group) => group.kind === 'fill')?.content}</>
  );

  expect(markup).toContain('Fill color body');
  expect(markup).not.toContain('value');
});

it('groups generic layer commands across the compact toolbar buckets', () => {
  const groups = createLayerToolbarCommandGroups([
    command('custom-template'),
    command('custom-shadow'),
    command('custom-fill-color'),
    command('custom-stroke-width'),
    command('custom-size'),
    command('rich-shape-text'),
    command('custom-more-action'),
  ]);

  expect(groups.map((group) => group.kind)).toEqual([
    'templates',
    'fill',
    'stroke',
    'geometry',
    'content',
    'effects',
  ]);
  expect(
    renderToStaticMarkup(<>{groups.find((group) => group.kind === 'content')?.content}</>)
  ).toContain('rich-shape-text');
  expect(
    groups.some((group) =>
      renderToStaticMarkup(<>{group.content}</>).includes('custom-more-action')
    )
  ).toBe(false);
});

it('renders selected shape toolbar popovers without duplicated group section titles', () => {
  const baseParams = createInspectorCommandParams();
  const params = {
    ...baseParams,
    highlightedTool: 'crop',
    richShapeSelection: createDefaultRichShapeObject(),
    selection: { ...baseParams.selection, selectedObjectType: 'rich-shape' },
  } as Parameters<typeof buildRichShapeCompactCommands>[0];

  const commands = buildRichShapeCompactCommands(params);
  const groups = createLayerToolbarCommandGroups(commands);
  const lineMarkup = renderToStaticMarkup(
    <>{groups.find((group) => group.id === 'stroke')?.content}</>
  );
  const fillMarkup = renderToStaticMarkup(
    <>{groups.find((group) => group.id === 'fill')?.content}</>
  );
  const textMarkup = renderToStaticMarkup(
    <>{groups.find((group) => group.id === 'content')?.content}</>
  );

  expect(lineMarkup).not.toContain('editor.compact.richShapeLine</span>');
  expect(fillMarkup).not.toContain('editor.compact.richShapeFill</span>');
  expect(textMarkup).not.toContain('editor.compact.richShapeText</span>');
  expect(lineMarkup).toContain('Цвет линии');
  expect(fillMarkup).toContain('Тип заливки');
  expect(textMarkup).toContain('Шрифт');
});
