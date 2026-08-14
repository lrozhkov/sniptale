// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';

import { EditorInspectorFramePreviewCard } from './card';
import {
  DEFAULT_EDITOR_FRAME_SETTINGS,
  normalizeEditorImageSettings,
} from '../../../../features/editor/document/constants';

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

it('renders a single background preview surface without the old inner border shell', async () => {
  await renderUi(
    <EditorInspectorFramePreviewCard
      backgroundPreviewStyle={{ backgroundImage: 'linear-gradient(145deg, #111111, #222222)' }}
      frameDraft={DEFAULT_EDITOR_FRAME_SETTINGS}
    />
  );

  const preview = container?.querySelector('[data-testid="frame-preview"]');

  expect(preview).not.toBeNull();
  expect(preview?.children).toHaveLength(1);
  expect(preview?.className).not.toContain('border');
  expect(container?.querySelector('[data-testid="frame-preview-source"]')).not.toBeNull();
});

it('previews capped padding and source-image shadow geometry', async () => {
  await renderUi(
    <EditorInspectorFramePreviewCard
      backgroundPreviewStyle={{ backgroundColor: '#111111' }}
      frameDraft={{
        ...DEFAULT_EDITOR_FRAME_SETTINGS,
        paddingTop: 64,
        sourceImage: {
          ...normalizeEditorImageSettings(DEFAULT_EDITOR_FRAME_SETTINGS.sourceImage),
          shadow: 50,
        },
      }}
    />
  );

  const preview = container?.querySelector<HTMLElement>('[data-testid="frame-preview"]');
  const source = container?.querySelector<HTMLElement>('[data-testid="frame-preview-source"]');
  expect(preview?.style.paddingTop).toBe('28px');
  expect(source?.style.boxShadow).toContain('color-mix');
});
