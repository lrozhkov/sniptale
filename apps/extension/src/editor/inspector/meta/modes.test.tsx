import { expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { getInspectorModeMeta } from './modes';

it('returns dedicated layer-effects inspector metadata', () => {
  const meta = getInspectorModeMeta('layer-effects');
  const filterMeta = getInspectorModeMeta('layer-effects', { layerEffectsCategory: 'filters' });
  const transformMeta = getInspectorModeMeta('layer-effects', {
    layerEffectsCategory: 'transformations',
  });

  expect(meta?.title).toBe('editor.toolbar.layerEffectsTitle');
  expect(meta?.subtitle).toBe('editor.toolbar.layerEffectsSubtitle');
  expect(filterMeta?.title).toBe('editor.toolbar.layerEffectsFilters');
  expect(filterMeta?.subtitle).toBe('editor.toolbar.layerEffectsFiltersSubtitle');
  expect(transformMeta?.title).toBe('editor.toolbar.layerEffectsTransformations');
  expect(transformMeta?.subtitle).toBe('editor.toolbar.layerEffectsTransformationsSubtitle');
  expect(filterMeta?.icon).toBeTruthy();
  expect(transformMeta?.icon).toBeTruthy();
  expect(getInspectorModeMeta('file')?.title).toBe('editor.toolbar.fileTitle');
  expect(getInspectorModeMeta('tool')).toBeNull();
});

it('returns metadata for size, frame, and workspace-like inspector modes', () => {
  expect(getInspectorModeMeta('image-size')?.title).toBe('editor.toolbar.imageSizeTitle');
  expect(getInspectorModeMeta('canvas-size')?.title).toBe('editor.toolbar.resizeTitle');
  expect(getInspectorModeMeta('frame')?.title).toBe('editor.toolbar.frameTitle');
  expect(getInspectorModeMeta('browser-frame')?.title).toBe('editor.toolbar.browserTitle');
  expect(getInspectorModeMeta('workspace')?.title).toBe('editor.toolbar.workspaceTitle');
  expect(getInspectorModeMeta('grid')?.title).toBe('editor.toolbar.gridTitle');
  expect(getInspectorModeMeta('meta')?.title).toBe('editor.toolbar.metaTitle');
  expect(getInspectorModeMeta('none')).toBeNull();
});
