// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const toolbarDerivedEffectsMocks = vi.hoisted(() => ({
  useToolbarViewportStatus: vi.fn(),
}));

vi.mock('../shell/viewport-status', () => ({
  useToolbarViewportStatus: toolbarDerivedEffectsMocks.useToolbarViewportStatus,
}));

import { useToolbarDerivedEffects } from './derived-effects';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function DerivedEffectsHarness(props: {
  setCurrentViewport: (viewport: { width: number; height: number } | null) => void;
}) {
  useToolbarDerivedEffects(props);
  return null;
}

async function renderElement(element: React.ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('forwards viewport ownership into the toolbar viewport-status hook', async () => {
  const setCurrentViewport = vi.fn();

  await renderElement(<DerivedEffectsHarness setCurrentViewport={setCurrentViewport} />);

  expect(toolbarDerivedEffectsMocks.useToolbarViewportStatus).toHaveBeenCalledWith({
    setCurrentViewport,
  });
  expect(toolbarDerivedEffectsMocks.useToolbarViewportStatus).toHaveBeenCalledTimes(1);
});
