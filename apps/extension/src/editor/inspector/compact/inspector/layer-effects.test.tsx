// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';

const panelPropsMock = vi.fn();

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../layer-effects', () => ({
  EditorInspectorLayerEffectsPanel: (props: Record<string, unknown>) => {
    panelPropsMock(props);
    return <div data-testid="layer-effects-panel">panel</div>;
  },
}));

import { buildLayerEffectsCompactCommands } from './layer-effects';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

it('builds a compact layer-effects command with the resolved selected layer name', () => {
  const params = createInspectorCommandParams();
  const [command] = buildLayerEffectsCompactCommands(params as never);

  expect(command?.value).toBe('Layer 1');
  render(command?.content ?? null);

  expect(command?.title).toBe('editor.toolbar.layerEffectsTitle');
  expect(panelPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      applyLayerEffect: params.applyLayerEffect,
      layerEffectsState: params.layerEffectsState,
      layers: params.layers,
      onResizeLayer: params.onResizeLayer,
    })
  );
});

it('prefers the explicitly opened layer effects target over the current selection', () => {
  const params = createInspectorCommandParams();
  params.layerEffectsState = {
    ...params.layerEffectsState,
    layerId: 'secondary-layer',
  };
  const secondaryLayer = {
    ...params.layers[0]!,
    id: 'secondary-layer',
    name: 'Secondary',
  };
  params.layers = [...params.layers, secondaryLayer];

  const [command] = buildLayerEffectsCompactCommands(params as never);

  expect(command?.value).toBe('Secondary');
});
