// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../../features/editor/document/types';

vi.mock('./presets', () => ({
  EditorInspectorFrameBackgroundGradientPresetGrid: (props: {
    gradientPresets: Array<{ id: string }>;
    applyGradientPreset: (preset: unknown) => void;
  }) => (
    <div data-testid="gradient-presets">
      <button type="button" onClick={() => props.applyGradientPreset({ id: 'preset-1' })}>
        preset
      </button>
      <span>{props.gradientPresets.length}</span>
    </div>
  ),
}));

vi.mock('./colors', () => ({
  EditorInspectorFrameBackgroundGradientColorControls: (props: {
    applyFramePatch: (patch: Record<string, string>) => void;
    frameBackgroundPalette: readonly string[];
    previewFramePatch: (patch: Record<string, string>) => void;
    recentColors: string[];
  }) => (
    <div data-testid="gradient-colors">
      <span>{props.frameBackgroundPalette.length}</span>
      <span>{props.recentColors.length}</span>
      <button
        type="button"
        onClick={() => props.previewFramePatch({ backgroundGradientFrom: '#abc' })}
      >
        preview-gradient
      </button>
      <button type="button" onClick={() => props.applyFramePatch({ backgroundGradientTo: '#def' })}>
        apply-gradient
      </button>
    </div>
  ),
}));

const FRAME: EditorFrameSettings = {
  ...DEFAULT_EDITOR_FRAME_SETTINGS,
  backgroundMode: 'gradient',
  backgroundColor: '#ffffff',
  backgroundImageData: null,
  backgroundImageFit: 'cover',
  layoutMode: 'fit-image',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

it('assembles the gradient editor from the role views', async () => {
  const applyFramePatch = vi.fn();
  const applyGradientPreset = vi.fn();
  const previewFramePatch = vi.fn();

  const { EditorInspectorFrameBackgroundGradientEditor } = await import('./view');

  await renderUi(
    <EditorInspectorFrameBackgroundGradientEditor
      frameDraft={FRAME}
      gradientPresets={[{ id: 'preset-1', label: 'Preset 1', from: '#000', to: '#fff', angle: 45 }]}
      frameBackgroundPalette={['#111111']}
      recentColors={['#222222']}
      toNumber={(value) => Number(value)}
      applyGradientPreset={applyGradientPreset}
      previewFramePatch={previewFramePatch}
      applyFramePatch={applyFramePatch}
    />
  );

  expect(container?.querySelector('[data-testid="gradient-presets"]')).not.toBeNull();

  await act(async () => {
    (
      container?.querySelector('[data-testid="gradient-colors"] button') as
        | HTMLButtonElement
        | undefined
    )?.click();
    (
      container?.querySelectorAll('[data-testid="gradient-colors"] button')[1] as
        | HTMLButtonElement
        | undefined
    )?.click();
    (
      container?.querySelector('[data-testid="gradient-presets"] button') as
        | HTMLButtonElement
        | undefined
    )?.click();
  });

  expect(applyGradientPreset).toHaveBeenCalled();
  expect(previewFramePatch).toHaveBeenCalledWith({ backgroundGradientFrom: '#abc' });
  expect(applyFramePatch).toHaveBeenCalledWith({ backgroundGradientTo: '#def' });
});
