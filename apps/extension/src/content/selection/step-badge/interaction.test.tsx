// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createStepBadgeSettingsFixture } from '../frame-runtime/test-support';
import { DEFAULT_STEP_BADGE_VISUAL_STYLE } from '../../../features/highlighter/step-badge-presets/catalog';

const mocks = vi.hoisted(() => ({
  useStepBadgeControlPosition: vi.fn((_args: { placementKey: string }) => null),
  useStepBadgeBoundaryDrag: vi.fn(() => ({
    draftPlacement: null,
    isDragging: false,
  })),
}));

vi.mock('./drag', () => ({ useStepBadgeBoundaryDrag: mocks.useStepBadgeBoundaryDrag }));
vi.mock('./controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./controls')>()),
  useStepBadgeControlPosition: mocks.useStepBadgeControlPosition,
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

it('refreshes quick-control placement when a preset changes the badge diameter', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const baseSettings = createStepBadgeSettingsFixture();

  function Harness(props: { diameter: number }) {
    useStepBadgeInteraction({
      borderWidth: 2,
      frameRect: { x: 10, y: 20, width: 120, height: 80 },
      isSettingsOpen: true,
      onPositionChange: vi.fn(),
      settings: {
        ...baseSettings,
        style: {
          ...DEFAULT_STEP_BADGE_VISUAL_STYLE,
          diameter: props.diameter,
          sizeSource: 'custom',
        },
      },
    });
    return null;
  }

  act(() => root.render(<Harness diameter={24} />));
  const compactPlacementKey = mocks.useStepBadgeControlPosition.mock.calls.at(-1)?.[0].placementKey;
  act(() => root.render(<Harness diameter={40} />));
  const largePlacementKey = mocks.useStepBadgeControlPosition.mock.calls.at(-1)?.[0].placementKey;

  expect(compactPlacementKey).not.toBe(largePlacementKey);
  expect(compactPlacementKey).toContain('"badgeSize":24');
  expect(largePlacementKey).toContain('"badgeSize":40');
  act(() => root.unmount());
});
