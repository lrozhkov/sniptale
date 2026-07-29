// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createStepBadgeSettingsFixture } from '../frame-runtime/test-support';

const mocks = vi.hoisted(() => ({
  useStepBadgeBoundaryDrag: vi.fn(() => ({
    draftPlacement: null,
    isDragging: false,
  })),
}));

vi.mock('./drag', () => ({ useStepBadgeBoundaryDrag: mocks.useStepBadgeBoundaryDrag }));
vi.mock('./controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls')>()),
  useStepBadgeControlPosition: () => null,
}));
vi.mock('../interactive-frame/overlays/transient-control-visibility', () => ({
  useTransientControlVisibility: () => ({ isVisible: false }),
}));

import { useStepBadgeInteraction } from './interaction';

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

it('projects badge dragging on the canonical outer frame rect regardless of stroke width', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const frameRect = { x: 10.25, y: 20.5, width: 120.75, height: 80.25 };

  function Harness() {
    useStepBadgeInteraction({
      borderWidth: 20,
      frameRect,
      isSettingsOpen: false,
      onPositionChange: vi.fn(),
      settings: createStepBadgeSettingsFixture(),
    });
    return null;
  }

  act(() => root.render(<Harness />));

  expect(mocks.useStepBadgeBoundaryDrag).toHaveBeenCalledWith(
    expect.objectContaining({ frameRect })
  );
  act(() => root.unmount());
});
