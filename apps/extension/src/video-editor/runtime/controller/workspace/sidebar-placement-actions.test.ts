import { expect, it, vi } from 'vitest';

import { createWorkspaceSidebarPlacementActions } from './sidebar-placement-actions';

it('maps placement commands without exposing the controller store', () => {
  const store = {
    clearPlacementMode: vi.fn(),
    startActionPointPlacement: vi.fn(),
    startMotionAreaPlacement: vi.fn(),
    startMotionFocusPlacement: vi.fn(),
    startMotionPathStopAreaPlacement: vi.fn(),
    startMotionPathStopPointPlacement: vi.fn(),
    startObjectTrackAnchorPlacement: vi.fn(),
  };

  const actions = createWorkspaceSidebarPlacementActions(store);

  expect(actions).toEqual({
    onClearPlacementMode: store.clearPlacementMode,
    onStartActionPointPlacement: store.startActionPointPlacement,
    onStartMotionAreaPlacement: store.startMotionAreaPlacement,
    onStartMotionFocusPlacement: store.startMotionFocusPlacement,
    onStartMotionPathStopAreaPlacement: store.startMotionPathStopAreaPlacement,
    onStartMotionPathStopPointPlacement: store.startMotionPathStopPointPlacement,
    onStartObjectTrackAnchorPlacement: store.startObjectTrackAnchorPlacement,
  });
});
