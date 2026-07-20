// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', () => ({
  translate: (key: string) => key,
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

it('renders the image action buttons and forwards clicks', async () => {
  const onPickBackgroundImage = vi.fn();
  const onClearBackgroundImage = vi.fn();
  const { EditorInspectorFrameBackgroundImageActions } = await import('./image-actions');

  await renderUi(
    <EditorInspectorFrameBackgroundImageActions
      hasImage={true}
      onPickBackgroundImage={onPickBackgroundImage}
      onClearBackgroundImage={onClearBackgroundImage}
    />
  );

  expect(container?.textContent).toContain('editor.scene.replaceImage');
  expect(container?.textContent).toContain('editor.scene.clearImage');

  await act(async () => {
    (container?.querySelectorAll('button')[0] as HTMLButtonElement | undefined)?.click();
    (container?.querySelectorAll('button')[1] as HTMLButtonElement | undefined)?.click();
  });

  expect(onPickBackgroundImage).toHaveBeenCalledOnce();
  expect(onClearBackgroundImage).toHaveBeenCalledOnce();
});

it('shows the upload label and disables clear when no image is selected', async () => {
  const onPickBackgroundImage = vi.fn();
  const onClearBackgroundImage = vi.fn();
  const { EditorInspectorFrameBackgroundImageActions } = await import('./image-actions');

  await renderUi(
    <EditorInspectorFrameBackgroundImageActions
      hasImage={false}
      onPickBackgroundImage={onPickBackgroundImage}
      onClearBackgroundImage={onClearBackgroundImage}
    />
  );

  const buttons = container?.querySelectorAll('button');
  expect(container?.textContent).toContain('editor.scene.uploadImage');
  expect(container?.textContent).not.toContain('editor.scene.clearImage');
  expect(buttons).toHaveLength(1);

  await act(async () => {
    (buttons?.[0] as HTMLButtonElement | undefined)?.click();
  });

  expect(onPickBackgroundImage).toHaveBeenCalledOnce();
  expect(onClearBackgroundImage).not.toHaveBeenCalled();
});
