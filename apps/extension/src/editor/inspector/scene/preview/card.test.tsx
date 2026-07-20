// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';

import { EditorInspectorFramePreviewCard } from './card';

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
    />
  );

  const preview = container?.querySelector('[data-testid="frame-preview"]');

  expect(preview).not.toBeNull();
  expect(preview?.children).toHaveLength(0);
  expect(preview?.className).not.toContain('border');
});
