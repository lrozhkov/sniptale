// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import type { EditorRasterEffect } from '../../../features/editor/document/effects';
import { LayerEffectsEditor } from './effect-editor';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../chrome', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../chrome')>()),
  INSPECTOR_PRIMARY_BUTTON_CLASS_NAME: 'primary-button',
}));

vi.mock('../tools/sections', () => ({
  CollapsibleSection: (props: { children: React.ReactNode }) => <section>{props.children}</section>,
  HeaderValueToggleSection: () => null,
  PanelSection: (props: { children: React.ReactNode }) => <section>{props.children}</section>,
  renderSelectionActionsSectionWithController: () => null,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  EditorIconButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
}));

vi.mock('./form', () => ({
  EditorRasterEffectForm: (props: {
    draftEffect: EditorRasterEffect;
    onChange: (effect: EditorRasterEffect) => void;
  }) => (
    <button
      type="button"
      data-testid="change-effect"
      onClick={() =>
        props.onChange(
          props.draftEffect.id === 'gamma'
            ? { blue: 1.7, enabled: true, green: 0.95, id: 'gamma', red: 1.4 }
            : props.draftEffect
        )
      }
    >
      change
    </button>
  ),
}));

vi.mock('./resize-controls', () => ({
  ResizeTransformationControls: () => <div data-testid="resize-controls" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createLayer(overrides: Partial<EditorLayerItem> = {}): EditorLayerItem {
  return {
    effectCount: 0,
    effects: [],
    id: 'layer-1',
    locked: false,
    name: 'Layer 1',
    previewColor: '#ffffff',
    previewDataUrl: null,
    previewTransparent: false,
    raster: true,
    selected: true,
    selectedCount: 1,
    type: 'image',
    typeLabel: 'Image',
    visible: true,
    ...overrides,
  };
}

function renderEditor(overrides: Partial<React.ComponentProps<typeof LayerEffectsEditor>> = {}) {
  const props: React.ComponentProps<typeof LayerEffectsEditor> = {
    activeEffectId: 'gamma',
    applyLayerEffect: vi.fn(async () => undefined),
    applyLayerTransformation: vi.fn(async () => undefined),
    layer: createLayer(),
    layerAspectRatio: 4 / 3,
    layerEffectsState: {
      activeEffectId: 'gamma',
      category: 'adjustments',
      layerId: 'layer-1',
      query: '',
    },
    layerSizeDraft: { height: 120, width: 160 },
    layerSizeLocked: false,
    layerSizeText: '160 x 120',
    onResizeLayer: vi.fn(async () => undefined),
    previewLayerEffect: vi.fn(),
    removeLayerEffect: vi.fn(),
    resetLayerEffectPreview: vi.fn(),
    setLayerSizeDraft: vi.fn(),
    setLayerSizeLocked: vi.fn(),
    updateLayerEffect: vi.fn(async () => undefined),
    updateLockedDraft: vi.fn((state) => state),
    ...overrides,
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<LayerEffectsEditor {...props} />));

  return props;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('applies the current draft effect on first apply for configurable raster effects', () => {
  const props = renderEditor();
  const changeButton = container?.querySelector('[data-testid="change-effect"]');
  const applyButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('editor.toolbar.layerEffectsApply')
  );

  act(() => (changeButton as HTMLButtonElement | null)?.click());
  expect(props.previewLayerEffect).toHaveBeenLastCalledWith('layer-1', {
    blue: 1.7,
    enabled: true,
    green: 0.95,
    id: 'gamma',
    red: 1.4,
  });
  act(() => applyButton?.click());

  expect(props.resetLayerEffectPreview).toHaveBeenCalledWith('layer-1');
  expect(props.applyLayerEffect).toHaveBeenCalledWith('layer-1', {
    blue: 1.7,
    enabled: true,
    green: 0.95,
    id: 'gamma',
    red: 1.4,
  });
  expect(props.updateLayerEffect).not.toHaveBeenCalled();
});

it('previews raster effect drafts immediately without committing transformations', () => {
  const props = renderEditor();

  expect(props.previewLayerEffect).toHaveBeenCalledWith('layer-1', {
    blue: 1.15,
    enabled: true,
    id: 'gamma',
    green: 1.15,
    red: 1.15,
  });

  act(() => {
    root?.render(
      <LayerEffectsEditor
        {...props}
        layerEffectsState={{
          activeEffectId: 'resize-layer',
          category: 'transformations',
          layerId: 'layer-1',
          query: '',
        }}
        activeEffectId="resize-layer"
      />
    );
  });

  expect(props.resetLayerEffectPreview).toHaveBeenCalledWith('layer-1');
  expect(props.previewLayerEffect).toHaveBeenCalledTimes(1);
});

it('shows resize controls for source-image layers with raster effects', () => {
  renderEditor({
    activeEffectId: null,
    layer: createLayer({ id: 'source-layer', type: 'source-image' }),
    layerEffectsState: {
      activeEffectId: null,
      category: 'transformations',
      layerId: 'source-layer',
      query: '',
    },
  });

  expect(container?.querySelector('[data-testid="resize-controls"]')).not.toBeNull();
});
