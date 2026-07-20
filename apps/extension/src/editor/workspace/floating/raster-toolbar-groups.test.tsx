// @vitest-environment jsdom
import { expect, it } from 'vitest';
import type { CompactCommand } from '../../inspector/compact';
import { createRasterToolbarGroups } from './raster-toolbar-groups';

function command(id: string): CompactCommand {
  return {
    content: <div>{id}</div>,
    id,
    title: id,
    trigger: id,
  };
}

it('groups brush raster commands into away-from-canvas toolbar roles', () => {
  const groups = createRasterToolbarGroups([
    command('raster-brush-size'),
    command('raster-brush-color'),
    command('raster-brush-opacity'),
    command('raster-brush-hardness'),
    command('raster-brush-clear'),
  ]);

  expect(groups?.map((group) => group.id)).toEqual(['geometry', 'fill', 'effects', 'more']);
  expect(groups?.find((group) => group.id === 'geometry')?.content).toBeTruthy();
  expect(groups?.find((group) => group.id === 'fill')?.content).toBeTruthy();
  expect(groups?.find((group) => group.id === 'effects')?.content).toBeTruthy();
});

it('uses raster fill color and gradient commands in the fill group trigger fallback', () => {
  const groups = createRasterToolbarGroups([
    command('raster-fill-mode'),
    command('raster-fill-gradient'),
    command('raster-fill-color'),
    command('raster-fill-selection'),
  ]);

  expect(groups?.map((group) => group.id)).toEqual(['fill', 'more']);
  expect(groups?.find((group) => group.id === 'fill')?.trigger).toBe('raster-fill-gradient');
});
