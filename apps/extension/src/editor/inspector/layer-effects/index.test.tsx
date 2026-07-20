// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  EditorLayerItem,
  EditorSelectionState,
} from '../../../features/editor/document/types';
import type { EditorRasterEffect } from '../../../features/editor/document/effects';
import { INSPECTOR_PRIMARY_BUTTON_CLASS_NAME } from '../chrome';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { EditorInspectorLayerEffectsPanel } from './';
import { getAppliedRasterEffect, isAppliedRasterEffect } from './shared';
import {
  getLayerEffectCategoryLabel,
  getLayerEffectDefinitions,
  resolveLayerEffectsActiveLayer,
} from './helpers';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const ACTIVE_EFFECT: EditorRasterEffect = { amount: 0.25, enabled: true, id: 'brightness' };

const DEFAULT_SELECTION: EditorSelectionState = {
  hasSelection: true,
  selectedObjectCount: 1,
  selectedObjectHeight: 120,
  selectedObjectId: 'layer-1',
  selectedObjectIds: ['layer-1'],
  selectedObjectType: 'image',
  selectedObjectWidth: 160,
};

function createLayer(overrides: Partial<EditorLayerItem> = {}): EditorLayerItem {
  return {
    effectCount: 1,
    effects: [ACTIVE_EFFECT],
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

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof EditorInspectorLayerEffectsPanel>> = {}
) {
  const props: React.ComponentProps<typeof EditorInspectorLayerEffectsPanel> = {
    applyLayerEffect: vi.fn(async () => undefined),
    applyLayerTransformation: vi.fn(async () => undefined),
    layerAspectRatio: 4 / 3,
    layerEffectsState: {
      activeEffectId: 'brightness',
      category: 'adjustments',
      layerId: 'layer-1',
      query: '',
    },
    layerSizeDraft: { height: 120, width: 160 },
    layerSizeLocked: false,
    layerSizeText: '160 x 120',
    layers: [createLayer()],
    onOpenLayerEffects: vi.fn(),
    onResizeLayer: vi.fn(async () => undefined),
    previewLayerEffect: vi.fn(),
    removeLayerEffect: vi.fn(),
    resetLayerEffectPreview: vi.fn(),
    selection: DEFAULT_SELECTION,
    setLayerEffectsState: vi.fn(),
    setLayerSizeDraft: vi.fn(),
    setLayerSizeLocked: vi.fn(),
    updateLayerEffect: vi.fn(async () => undefined),
    updateLockedDraft: vi.fn((state) => state),
    ...overrides,
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<EditorInspectorLayerEffectsPanel {...props} />));

  return props;
}

function changeInput(input: HTMLInputElement, value: string) {
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function queryNumericInput(label: string): HTMLInputElement | null {
  return container?.querySelector(`input[aria-label="${label}"]`) ?? null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function expectLayerEffectsHelperFallbacks() {
  expect(container?.textContent).toContain('editor.toolbar.layerEffectsSelectLayer');
  expect(getLayerEffectCategoryLabel('adjustments')).toBe('editor.toolbar.layerEffectsAdjustments');
  expect(getLayerEffectDefinitions('filters', 'blur').length).toBeGreaterThan(0);
  expect(resolveLayerEffectsActiveLayer([], DEFAULT_SELECTION, null)).toBeNull();
  expect(isAppliedRasterEffect(null, 'brightness')).toBe(false);
  expect(getAppliedRasterEffect(null, 'brightness')).toBeNull();
}

it('renders empty state and layer effect helper fallbacks', () => {
  renderPanel({
    layerEffectsState: {
      activeEffectId: null,
      category: 'filters',
      layerId: null,
      query: '',
    },
    layers: [],
    selection: {
      ...DEFAULT_SELECTION,
      hasSelection: false,
      selectedObjectCount: 0,
      selectedObjectId: null,
      selectedObjectIds: [],
    },
  });

  expectLayerEffectsHelperFallbacks();
});

it('opens selected effect entries and updates an applied raster effect', () => {
  const props = renderPanel();

  const effectButtons = Array.from(container?.querySelectorAll('button') ?? []);
  const brightnessButton = effectButtons.find((button) =>
    button.textContent?.includes('editor.layerEffects.brightness')
  );
  const applyButton = effectButtons.find((button) =>
    button.textContent?.includes('editor.toolbar.layerEffectsUpdate')
  );
  const amountInput = queryNumericInput('editor.toolbar.layerEffectsAmount');

  expect(brightnessButton).toBeTruthy();
  expect(applyButton).toBeTruthy();
  expect(amountInput).toBeTruthy();
  expect(container?.querySelector('input[type="range"]')).not.toBeNull();
  expect(container?.textContent).not.toContain('editor.toolbar.layerEffectsAdjustments');
  expect(applyButton?.className).toContain(INSPECTOR_PRIMARY_BUTTON_CLASS_NAME);
  expect(applyButton?.className).toContain('bg-transparent');
  expect(applyButton?.className).not.toContain('text-white');

  act(() => brightnessButton?.click());
  act(() => applyButton?.click());

  expect(props.onOpenLayerEffects).toHaveBeenCalledWith('layer-1', 'adjustments', 'brightness', {
    focusViewport: false,
  });
  expect(props.updateLayerEffect).toHaveBeenCalledWith(
    'layer-1',
    expect.objectContaining({ amount: ACTIVE_EFFECT.amount, id: 'brightness' })
  );
});

it('restores applied custom gamma values when reopening the effect editor', () => {
  renderPanel({
    layerEffectsState: {
      activeEffectId: 'gamma',
      category: 'adjustments',
      layerId: 'layer-1',
      query: '',
    },
    layers: [
      createLayer({
        effectCount: 1,
        effects: [{ blue: 1.7, enabled: true, green: 0.95, id: 'gamma', red: 1.4 }],
      }),
    ],
  });

  const inputs = [
    queryNumericInput('editor.toolbar.layerEffectsRed'),
    queryNumericInput('editor.toolbar.layerEffectsGreen'),
    queryNumericInput('editor.toolbar.layerEffectsBlue'),
  ];

  expect(inputs.map((input) => input?.value)).toEqual(['1.4', '0.95', '1.7']);
});

it('keeps the draft numeric value for unapplied effects instead of resetting on rerender', () => {
  renderPanel({
    layerEffectsState: {
      activeEffectId: 'contrast',
      category: 'adjustments',
      layerId: 'layer-1',
      query: '',
    },
    layers: [createLayer({ effectCount: 0, effects: [] })],
  });

  const amountInput = queryNumericInput('editor.toolbar.layerEffectsAmount');
  expect(amountInput).toBeTruthy();
  if (!amountInput) {
    throw new Error('Expected contrast numeric field');
  }

  changeInput(amountInput, '0.55');

  expect(amountInput.value).toBe('0.55');
});

it('renders compact transformation actions and forwards immediate actions plus resize', () => {
  const props = renderPanel({
    layerEffectsState: {
      activeEffectId: 'resize-layer',
      category: 'transformations',
      layerId: 'layer-1',
      query: '',
    },
    setLayerSizeDraft: vi.fn((updater) => updater({ height: 120, width: 160 })),
    setLayerSizeLocked: vi.fn(),
  });

  const inputs = Array.from(
    container?.querySelectorAll<HTMLInputElement>('input[type="text"]') ?? []
  );
  const rotateLeftButton = container?.querySelector(
    'button[title="editor.layerEffects.rotateLeft"]'
  ) as HTMLButtonElement | null;
  const applyButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes('editor.toolbar.layerEffectsApplyResize')
  );

  expect(inputs).toHaveLength(2);
  expect(
    container?.querySelector('input[placeholder="editor.toolbar.layerEffectsSearchPlaceholder"]')
  ).toBeNull();
  expect(rotateLeftButton?.parentElement?.className).toContain('justify-center');
  expect(applyButton?.className).toContain(INSPECTOR_PRIMARY_BUTTON_CLASS_NAME);
  expect(applyButton?.className).toContain('bg-transparent');
  expect(applyButton?.className).not.toContain('text-white');
  expect(container?.textContent).not.toContain('editor.toolbar.layerEffectsTransformations');
  act(() => rotateLeftButton?.click());
  changeInput(inputs[0] as HTMLInputElement, '240');
  act(() => applyButton?.click());

  expect(props.applyLayerTransformation).toHaveBeenCalledWith('layer-1', 'rotate-left');
  expect(props.updateLockedDraft).toEqual(expect.any(Function));
  expect(props.onResizeLayer).toHaveBeenCalledWith('layer-1', 160, 120);
});

it('sorts catalog entries with applied effects first inside compact lists', () => {
  renderPanel({
    layerEffectsState: {
      activeEffectId: null,
      category: 'filters',
      layerId: 'layer-1',
      query: '',
    },
    layers: [
      createLayer({
        effectCount: 1,
        effects: [{ blur: 0.2, enabled: true, id: 'blur' }],
      }),
    ],
  });

  const catalogButtons = Array.from(container?.querySelectorAll('button') ?? []).filter((button) =>
    button.textContent?.includes('editor.layerEffects.')
  );

  expect(catalogButtons[0]?.textContent).toContain('editor.layerEffects.blur');
  expect(container?.textContent).not.toContain('Layer 1');
  expect(container?.textContent).not.toContain('editor.toolbar.layerEffectsFilters');
});
