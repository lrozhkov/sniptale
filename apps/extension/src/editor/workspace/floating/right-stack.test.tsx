import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { EditorFloatingRightStack } from './right-stack';

vi.mock('./layers-panel', () => ({
  EditorFloatingLayersPanel: ({
    collapsed,
    heightRatio,
    preferenceError,
  }: {
    collapsed: boolean;
    heightRatio: number | null;
    preferenceError: string | null;
  }) => (
    <div
      data-height-ratio={heightRatio ?? 'none'}
      data-preference-error={preferenceError ?? ''}
      data-ui={collapsed ? 'mock.layers.collapsed' : 'mock.layers.expanded'}
    />
  ),
}));

vi.mock('./layer-effects-panel', () => ({
  EditorFloatingLayerEffectsPanel: ({ collapsedLayers }: { collapsedLayers: boolean }) => (
    <div data-collapsed-layers={String(collapsedLayers)} data-ui="mock.layer-effects-panel" />
  ),
}));

it('renders expanded layers inside the right stack and collapsed layers as a corner toolbar', () => {
  const props = {
    documentController: { inspector: 'tool' } as never,
    hasImage: true,
    inspectorMeta: { title: 'Inspector', subtitle: 'Mode' },
    layersHeightRatio: 0.5,
    layersPreferenceError: null,
    onCollapseLayers: vi.fn(),
    onExpandLayers: vi.fn(),
    onLayersHeightRatioChange: vi.fn(),
  };

  expect(
    renderToStaticMarkup(<EditorFloatingRightStack {...props} layersCollapsed={false} />)
  ).toContain('editor.floating.right-stack');
  expect(renderToStaticMarkup(<EditorFloatingRightStack {...props} layersCollapsed />)).toContain(
    'mock.layers.collapsed'
  );
  expect(
    renderToStaticMarkup(<EditorFloatingRightStack {...props} layersCollapsed={false} />)
  ).toContain('data-height-ratio="0.5"');
});

it('renders layer effects beside expanded layers and above the collapsed corner toolbar', () => {
  const props = {
    documentController: { inspector: 'layer-effects' } as never,
    hasImage: true,
    inspectorMeta: { title: 'Effects', subtitle: 'Layer' },
    layersHeightRatio: null,
    layersPreferenceError: null,
    onCollapseLayers: vi.fn(),
    onExpandLayers: vi.fn(),
    onLayersHeightRatioChange: vi.fn(),
  };

  expect(
    renderToStaticMarkup(<EditorFloatingRightStack {...props} layersCollapsed={false} />)
  ).toContain('data-collapsed-layers="false"');
  expect(renderToStaticMarkup(<EditorFloatingRightStack {...props} layersCollapsed />)).toContain(
    'data-collapsed-layers="true"'
  );
});

it('passes floating preference errors to the layers surface', () => {
  const props = {
    documentController: { inspector: 'tool' } as never,
    hasImage: true,
    inspectorMeta: { title: 'Inspector', subtitle: 'Mode' },
    layersHeightRatio: null,
    layersPreferenceError: 'Could not save panel',
    onCollapseLayers: vi.fn(),
    onExpandLayers: vi.fn(),
    onLayersHeightRatioChange: vi.fn(),
  };

  expect(
    renderToStaticMarkup(<EditorFloatingRightStack {...props} layersCollapsed={false} />)
  ).toContain('data-preference-error="Could not save panel"');
  expect(renderToStaticMarkup(<EditorFloatingRightStack {...props} layersCollapsed />)).toContain(
    'data-preference-error="Could not save panel"'
  );
});
