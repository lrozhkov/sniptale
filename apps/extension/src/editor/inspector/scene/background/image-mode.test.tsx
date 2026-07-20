// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../../features/editor/document/types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal()),
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
      <button
        type="button"
        data-testid="select-field"
        onClick={() => props.onChange(firstOption.value)}
      >
        {props.value}
      </button>
    );
  },
}));

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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

const FRAME: EditorFrameSettings = {
  ...DEFAULT_EDITOR_FRAME_SETTINGS,
  backgroundMode: 'image',
  backgroundColor: '#ffffff',
  backgroundImageData: 'data:image/png;base64,abc',
  backgroundImageFit: 'cover',
  layoutMode: 'fit-image',
};

it('renders the image mode select and forwards fit updates', async () => {
  const applyFramePatch = vi.fn();
  const { EditorInspectorFrameBackgroundImageMode } = await import('./image-mode');

  await renderUi(
    <EditorInspectorFrameBackgroundImageMode
      applyFramePatch={applyFramePatch}
      frameBackgroundImageFitOptions={[{ value: 'contain', label: 'Contain' }]}
      frameDraft={FRAME}
    />
  );

  expect(container?.textContent).toContain('cover');
  expect(container?.querySelector('img')).toBeNull();
  expect(container?.textContent).not.toContain('editor.scene.backgroundImageEmptyState');

  await act(async () => {
    (
      container?.querySelector('[data-testid="select-field"]') as HTMLButtonElement | undefined
    )?.click();
  });

  expect(applyFramePatch).toHaveBeenCalledWith({ backgroundImageFit: 'contain' });
});

it('shows the empty hint when no background image is selected', async () => {
  const { EditorInspectorFrameBackgroundImageMode } = await import('./image-mode');

  await renderUi(
    <EditorInspectorFrameBackgroundImageMode
      applyFramePatch={vi.fn()}
      frameBackgroundImageFitOptions={[{ value: 'contain', label: 'Contain' }]}
      frameDraft={{
        ...FRAME,
        backgroundImageData: null,
      }}
    />
  );

  expect(container?.textContent).not.toContain('editor.scene.backgroundImageEmptyState');
  expect(container?.querySelector('img')).toBeNull();
});

it('renders compact image action buttons only when the corresponding image actions exist', async () => {
  const onPickBackgroundImage = vi.fn();
  const onClearBackgroundImage = vi.fn();
  const { EditorInspectorFrameBackgroundImageActions } = await import('./image-actions');

  await renderUi(
    <EditorInspectorFrameBackgroundImageActions
      hasImage={false}
      onClearBackgroundImage={onClearBackgroundImage}
      onPickBackgroundImage={onPickBackgroundImage}
    />
  );

  const buttons = container?.querySelectorAll('button');
  buttons?.[0]?.click();

  expect(onPickBackgroundImage).toHaveBeenCalledOnce();
  expect(onClearBackgroundImage).not.toHaveBeenCalled();
  expect(buttons).toHaveLength(1);
  expect(container?.textContent).toContain('editor.scene.uploadImage');
  expect(container?.textContent).not.toContain('editor.scene.clearImage');

  await renderUi(
    <EditorInspectorFrameBackgroundImageActions
      hasImage
      onClearBackgroundImage={onClearBackgroundImage}
      onPickBackgroundImage={onPickBackgroundImage}
    />
  );

  const imageButtons = container?.querySelectorAll('button');
  (imageButtons?.[1] as HTMLButtonElement | undefined)?.click();

  expect(container?.textContent).toContain('editor.scene.replaceImage');
  expect(container?.textContent).toContain('editor.scene.clearImage');
  expect(onClearBackgroundImage).toHaveBeenCalledOnce();
});
