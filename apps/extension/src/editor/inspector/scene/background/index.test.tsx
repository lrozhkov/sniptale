// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { translate } from '../../../../platform/i18n';
import { EditorInspectorFrameBackgroundFillEditor } from './';

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../chrome/ui')>()),
  SelectField: (props: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
  }) => {
    const firstOption = props.options[0];
    if (!firstOption) {
      return null;
    }

    return (
      <div data-testid="select-field" data-value={props.value}>
        <button type="button" onClick={() => props.onChange(firstOption.value)}>
          select-first
        </button>
      </div>
    );
  },
  ColorField: (props: {
    title: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    onPreviewChange?: (value: string) => void;
  }) => (
    <div data-testid="color-control">
      <span>{props.title}</span>
      <span>{props.label}</span>
      <span>{props.value}</span>
      <button type="button" onClick={() => props.onPreviewChange?.('#111111')}>
        preview-color
      </button>
      <button type="button" onClick={() => props.onChange('#222222')}>
        apply-color
      </button>
    </div>
  ),
}));

vi.mock('./gradient/controls', () => ({
  GradientPresetGrid: (props: {
    gradientPresets: Array<{ label: string }>;
    applyGradientPreset: (preset: any) => void;
  }) => (
    <div data-testid="gradient-presets">
      <button type="button" onClick={() => props.applyGradientPreset({ label: 'preset-1' })}>
        preset
      </button>
      <span>{props.gradientPresets.length}</span>
    </div>
  ),
  GradientColorControls: (props: {
    applyFramePatch: (patch: Record<string, number>) => void;
    frameBackgroundPalette: readonly string[];
    previewFramePatch: (patch: Record<string, string>) => void;
    recentColors: string[];
  }) => (
    <div data-testid="gradient-colors">
      <span>{props.frameBackgroundPalette.length}</span>
      <span>{props.recentColors.length}</span>
      <button
        type="button"
        onClick={() => props.previewFramePatch({ backgroundGradientFrom: '#123123' })}
      >
        preview-gradient
      </button>
      <button type="button" onClick={() => props.applyFramePatch({ backgroundGradientAngle: 45 })}>
        apply-angle
      </button>
    </div>
  ),
  GradientAngleControls: (props: {
    applyFramePatch: (patch: Record<string, number>) => void;
    toNumber: (value: string) => number;
  }) => (
    <div data-testid="gradient-angle">
      <button type="button" onClick={() => props.applyFramePatch({ angle: props.toNumber('45') })}>
        angle
      </button>
    </div>
  ),
}));

const FRAME: EditorFrameSettings = {
  ...DEFAULT_EDITOR_FRAME_SETTINGS,
  backgroundMode: 'color',
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

it('renders the solid color branch and forwards color updates', async () => {
  const applyFramePatch = vi.fn();
  const previewFramePatch = vi.fn();

  await renderUi(
    <EditorInspectorFrameBackgroundFillEditor
      frameDraft={FRAME}
      gradientPresets={[]}
      frameBackgroundPalette={['#111111']}
      frameBackgroundImageFitOptions={[{ value: 'cover', label: 'Cover' }]}
      recentColors={['#222222']}
      toNumber={(value) => Number(value)}
      applyGradientPreset={vi.fn()}
      previewFramePatch={previewFramePatch}
      applyFramePatch={applyFramePatch}
      onPickBackgroundImage={vi.fn()}
      onClearBackgroundImage={vi.fn()}
    />
  );

  expect(container?.querySelector('[data-testid="color-control"]')?.textContent).toContain(
    '#ffffff'
  );
  expect(container?.querySelector('[data-testid="color-control"]')?.textContent).toContain(
    translate('editor.scene.sceneBackgroundTitle')
  );

  await act(async () => {
    (container?.querySelectorAll('button')[0] as HTMLButtonElement | undefined)?.click();
    (container?.querySelectorAll('button')[1] as HTMLButtonElement | undefined)?.click();
  });

  expect(previewFramePatch).toHaveBeenCalledWith({ backgroundColor: '#111111' });
  expect(applyFramePatch).toHaveBeenCalledWith({ backgroundColor: '#222222' });
});

it('renders the gradient branch and forwards gradient actions', async () => {
  const applyFramePatch = vi.fn();
  const applyGradientPreset = vi.fn();
  const previewFramePatch = vi.fn();

  await renderUi(
    <EditorInspectorFrameBackgroundFillEditor
      frameDraft={{ ...FRAME, backgroundMode: 'gradient' }}
      gradientPresets={[{ id: 'preset-1', label: 'Preset 1', from: '#000', to: '#fff', angle: 45 }]}
      frameBackgroundPalette={['#111111']}
      frameBackgroundImageFitOptions={[{ value: 'cover', label: 'Cover' }]}
      recentColors={['#222222']}
      toNumber={(value) => Number(value)}
      applyGradientPreset={applyGradientPreset}
      previewFramePatch={previewFramePatch}
      applyFramePatch={applyFramePatch}
      onPickBackgroundImage={vi.fn()}
      onClearBackgroundImage={vi.fn()}
    />
  );

  expect(container?.querySelector('[data-testid="gradient-presets"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="gradient-colors"]')?.textContent).toContain('1');

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
  expect(previewFramePatch).toHaveBeenCalledWith({ backgroundGradientFrom: '#123123' });
  expect(applyFramePatch).toHaveBeenCalledWith({ backgroundGradientAngle: 45 });
});

it('renders the image branch and forwards image mode updates', async () => {
  const applyFramePatch = vi.fn();
  const onPickBackgroundImage = vi.fn();
  const onClearBackgroundImage = vi.fn();

  await renderUi(
    <EditorInspectorFrameBackgroundFillEditor
      frameDraft={{
        ...FRAME,
        backgroundMode: 'image',
        backgroundImageData: 'data:image/png;base64,abc',
      }}
      gradientPresets={[]}
      frameBackgroundPalette={['#111111']}
      frameBackgroundImageFitOptions={[{ value: 'cover', label: 'Cover' }]}
      recentColors={['#222222']}
      toNumber={(value) => Number(value)}
      applyGradientPreset={vi.fn()}
      previewFramePatch={vi.fn()}
      applyFramePatch={applyFramePatch}
      onPickBackgroundImage={onPickBackgroundImage}
      onClearBackgroundImage={onClearBackgroundImage}
    />
  );

  expect(container?.querySelector('[data-testid="select-field"]')).not.toBeNull();

  await act(async () => {
    (container?.querySelectorAll('button')[0] as HTMLButtonElement | undefined)?.click();
    (container?.querySelectorAll('button')[1] as HTMLButtonElement | undefined)?.click();
    (
      container?.querySelector('[data-testid="select-field"] button') as
        | HTMLButtonElement
        | undefined
    )?.click();
  });

  expect(onPickBackgroundImage).toHaveBeenCalledTimes(1);
  expect(onClearBackgroundImage).toHaveBeenCalledTimes(1);
  expect(applyFramePatch).toHaveBeenCalledWith({ backgroundImageFit: 'cover' });
});
