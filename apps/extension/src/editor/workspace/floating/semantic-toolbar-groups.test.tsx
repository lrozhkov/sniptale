// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { CompactCommand } from '../../inspector/compact';
import { createArrowToolbarGroups } from './arrow-toolbar-groups';
import { createLayerToolbarCommandGroups } from './layer-toolbar-groups';
import { createRasterToolbarGroups } from './raster-toolbar-groups';
import { createShapeToolbarGroups } from './shape-toolbar-groups';
import { createStepToolbarGroups } from './step-toolbar-groups';
import { createToolPropertiesGroups } from './tool-properties-groups';

function command(id: string, value?: string): CompactCommand {
  return {
    id,
    title: id,
    trigger: id,
    content: <div>{id}</div>,
    ...(value === undefined ? {} : { value }),
  };
}

it('groups arrow controls without dropping line style heads or shadow settings', () => {
  const groups = createArrowToolbarGroups([
    command('arrow-color'),
    command('arrow-width'),
    command('arrow-style'),
    command('arrow-type'),
    command('arrow-dynamic-width'),
    command('arrow-roughness'),
    command('arrow-bowing'),
    command('arrow-start-head'),
    command('arrow-end-head'),
    command('arrow-shadow'),
  ]);

  expect(groups?.map((group) => group.id)).toEqual([
    'geometry',
    'line-color',
    'style',
    'heads',
    'shadow',
  ]);
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'geometry')?.content}</>)
  ).toContain('arrow-roughness');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'heads')?.content}</>)
  ).toContain('arrow-end-head');
});

it('keeps shape fill stroke geometry and shadow as stable groups', () => {
  const groups = createShapeToolbarGroups([
    command('rectangle-template'),
    command('shape-fill-color'),
    command('shape-fill-opacity', '0%'),
    command('shape-stroke-color'),
    command('shape-stroke-width'),
    command('shape-stroke-style'),
    command('shape-stroke-opacity'),
    command('shape-radius'),
    command('shape-shadow'),
  ]);

  expect(groups?.map((group) => group.id)).toEqual([
    'templates',
    'fill',
    'stroke',
    'geometry',
    'shadow',
  ]);
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'stroke')?.content}</>)
  ).toContain('shape-stroke-color');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'shadow')?.content}</>)
  ).toContain('shape-shadow');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'fill')?.trigger}</>)
  ).toContain('opacity:0.65');
});

it('keeps step text color separate from shape fill and stroke controls', () => {
  const groups = createStepToolbarGroups([
    command('step-template'),
    command('step-type'),
    command('step-value'),
    command('step-alphabet'),
    command('step-text-color'),
    command('step-color'),
    command('step-opacity'),
    command('step-stroke-width'),
    command('step-stroke-color'),
    command('step-stroke-opacity'),
    command('step-size'),
  ]);

  expect(groups?.map((group) => group.id)).toEqual([
    'templates',
    'content',
    'text-color',
    'fill',
    'stroke',
    'geometry',
  ]);
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'text-color')?.content}</>)
  ).toContain('step-text-color');
  expect(
    renderToStaticMarkup(<>{groups?.find((group) => group.id === 'stroke')?.content}</>)
  ).toContain('step-stroke-opacity');
});

it('groups raster selection brush eraser and fill tools by their drawing-only properties', () => {
  expect(
    createRasterToolbarGroups([
      command('raster-selection-mode'),
      command('raster-selection-clear'),
    ])?.map((group) => group.id)
  ).toEqual(['content', 'more']);
  expect(
    createRasterToolbarGroups([
      command('raster-brush-size'),
      command('raster-brush-color'),
      command('raster-brush-opacity'),
      command('raster-brush-hardness'),
      command('raster-brush-clear'),
    ])?.map((group) => group.id)
  ).toEqual(['geometry', 'fill', 'effects', 'more']);
  expect(
    createRasterToolbarGroups([command('raster-eraser-size'), command('raster-eraser-clear')])?.map(
      (group) => group.id
    )
  ).toEqual(['geometry', 'more']);
  expect(
    createRasterToolbarGroups([command('raster-fill-mode'), command('raster-fill-selection')])?.map(
      (group) => group.id
    )
  ).toEqual(['fill', 'more']);
});

it('falls back to generic tool-property buckets for unknown future tool commands', () => {
  const groups = createToolPropertiesGroups([
    command('custom-template'),
    command('custom-fill-color'),
    command('custom-width'),
    command('custom-toggle'),
  ]);

  expect(groups.map((group) => group.id)).toEqual(['templates', 'color', 'size', 'settings']);
  expect(
    renderToStaticMarkup(<>{groups.find((group) => group.id === 'size')?.trigger}</>)
  ).toContain('custom-width');
  expect(
    renderToStaticMarkup(<>{groups.find((group) => group.id === 'settings')?.content}</>)
  ).toContain('custom-toggle');
});

it('builds generic layer toolbar groups and keeps rare actions out of direct groups', () => {
  const groups = createLayerToolbarCommandGroups([
    command('image-template'),
    command('image-fill-color'),
    command('image-border-width'),
    command('image-size'),
    command('layer-effects'),
    command('delete-layer'),
  ]);

  expect(groups.map((group) => group.kind)).toEqual([
    'templates',
    'fill',
    'stroke',
    'geometry',
    'effects',
  ]);
  expect(
    renderToStaticMarkup(<>{groups.find((group) => group.kind === 'fill')?.content}</>)
  ).toContain('image-fill-color');
  expect(
    renderToStaticMarkup(<>{groups.find((group) => group.kind === 'effects')?.content}</>)
  ).toContain('layer-effects');
  expect(
    groups.some((group) => renderToStaticMarkup(<>{group.content}</>).includes('delete-layer'))
  ).toBe(false);
});
