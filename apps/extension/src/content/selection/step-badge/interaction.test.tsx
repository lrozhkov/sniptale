// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createStepBadgeSettingsFixture } from '../frame-runtime/test-support';
import { DEFAULT_STEP_BADGE_VISUAL_STYLE } from '../../../features/highlighter/step-badge-presets/catalog';
import type { StepBadgeManualPlacement } from '@sniptale/runtime-contracts/highlighter/step-badge';

const mocks = vi.hoisted(() => ({
  useStepBadgeControlPosition: vi.fn((_args: { placementKey: string }) => null),
  useStepBadgeBoundaryDrag: vi.fn(() => ({
    draftPlacement: null as StepBadgeManualPlacement | null,
    isDragging: false,
  })),
}));

vi.mock('../../../features/highlighter/frame-annotation/step-badge/drag', () => ({
  useStepBadgeBoundaryDrag: mocks.useStepBadgeBoundaryDrag,
}));
vi.mock(
  '../../../features/highlighter/frame-annotation/step-badge/controls',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../features/highlighter/frame-annotation/step-badge/controls')
    >()),
    useStepBadgeControlPosition: mocks.useStepBadgeControlPosition,
  })
);
vi.mock(
  '../../../features/highlighter/frame-annotation/interaction/transient-control-visibility',
  () => ({
    useTransientControlVisibility: () => ({ isVisible: false }),
  })
);

import { useStepBadgeInteraction } from '../../../features/highlighter/frame-annotation/step-badge/interaction';

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

it('uses fallback geometry without controls and projects a live drag draft into the surface settings', () => {
  mocks.useStepBadgeBoundaryDrag.mockReturnValueOnce({
    draftPlacement: { position: 0.75, side: 'bottom' },
    isDragging: true,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const results: Array<ReturnType<typeof useStepBadgeInteraction>> = [];
  const settings = createStepBadgeSettingsFixture();

  function Harness() {
    results.push(
      useStepBadgeInteraction({
        borderWidth: 2,
        frameRect: undefined,
        isSettingsOpen: undefined,
        onPositionChange: undefined,
        settings,
      })
    );
    return null;
  }

  act(() => root.render(<Harness />));

  expect(mocks.useStepBadgeBoundaryDrag).toHaveBeenCalledWith(
    expect.objectContaining({ frameRect: { x: 0, y: 0, width: 1, height: 1 } })
  );
  expect(results.at(-1)?.hasControls).toBe(false);
  expect(results.at(-1)?.effectiveSettings.manualPlacement).toEqual({
    position: 0.75,
    side: 'bottom',
  });
  expect(mocks.useStepBadgeControlPosition.mock.calls.at(-1)?.[0].placementKey).toContain(
    '"frameRect":null'
  );
  act(() => root.unmount());
});
