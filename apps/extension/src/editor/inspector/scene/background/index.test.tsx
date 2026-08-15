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
}));

vi.mock('../../../../ui/paint-selector', () => ({
  CompactPaintSelector: (props: {
    title: string;
    value: { kind: string };
    allowedModes: string[];
    showGradientAdvancedControls: boolean;
    onChange: (paint: unknown) => void;
    onPreviewChange: (paint: unknown) => void;
  }) => (
    <div
      data-testid="paint-control"
      data-kind={props.value.kind}
      data-modes={props.allowedModes.join(',')}
      data-advanced={String(props.showGradientAdvancedControls)}
    >
      <span>{props.title}</span>
      <button
        type="button"
        onClick={() => props.onPreviewChange({ kind: 'solid', color: '#111111ff' })}
      >
        preview-paint
      </button>
      <button
        type="button"
        onClick={() =>
          props.onChange(
            props.value.kind === 'gradient'
              ? {
                  kind: 'gradient',
                  gradient: {
                    type: 'linear',
                    angle: 45,
                    stops: [
                      { color: '#123123ff', position: 0 },
                      { color: '#ffffffff', position: 1 },
                    ],
                  },
                }
              : { kind: 'solid', color: '#222222ff' }
          )
        }
      >
        apply-paint
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

  expect(container?.querySelector('[data-testid="paint-control"]')?.getAttribute('data-kind')).toBe(
    'solid'
  );
  expect(container?.querySelector('[data-testid="paint-control"]')?.textContent).toContain(
    translate('editor.scene.sceneBackgroundTitle')
  );
  expect(
    container?.querySelector('[data-testid="paint-control"]')?.getAttribute('data-modes')
  ).toBe('solid,linear');

  await act(async () => {
    (container?.querySelectorAll('button')[0] as HTMLButtonElement | undefined)?.click();
    (container?.querySelectorAll('button')[1] as HTMLButtonElement | undefined)?.click();
  });

  expect(previewFramePatch).toHaveBeenCalledWith({
    backgroundColor: '#111111ff',
    backgroundMode: 'color',
  });
  expect(applyFramePatch).toHaveBeenCalledWith({
    backgroundColor: '#222222ff',
    backgroundMode: 'color',
  });
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

  expect(container?.querySelector('[data-testid="paint-control"]')?.getAttribute('data-kind')).toBe(
    'gradient'
  );

  await act(async () => {
    (
      container?.querySelectorAll('[data-testid="paint-control"] button')[1] as HTMLButtonElement
    )?.click();
  });

  expect(applyGradientPreset).not.toHaveBeenCalled();
  expect(previewFramePatch).not.toHaveBeenCalled();
  expect(applyFramePatch).toHaveBeenCalledWith(
    expect.objectContaining({
      backgroundGradientAngle: 45,
      backgroundGradientFrom: '#123123ff',
      backgroundGradientTo: '#ffffffff',
      backgroundMode: 'gradient',
    })
  );
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
