// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useToolbarNavigationLock: vi.fn(() => ({
    lockDisabled: true,
    lockTitle: 'managed',
    navigationLockEnabled: false,
    toggleNavigationLock: vi.fn(),
  })),
}));

vi.mock('../shell/navigation-lock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shell/navigation-lock')>()),
  useToolbarNavigationLock: mocks.useToolbarNavigationLock,
}));

import { useToolbarDerivedState } from './derived';

let container: HTMLDivElement;
let root: Root;

function Harness() {
  useToolbarDerivedState({
    aiPickMode: false,
    designReviewMode: false,
    drawingMode: true,
    highlighterMode: false,
    isCursorMode: false,
    quickEditMode: false,
    screenshotMode: true,
  });
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('projects Drawing into navigation-lock policy', () => {
  act(() => root.render(<Harness />));

  expect(mocks.useToolbarNavigationLock).toHaveBeenCalledWith(
    expect.objectContaining({ drawingMode: true, screenshotMode: true })
  );
});
