// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createReorderStepBadge: vi.fn(() => 'reorder-action'),
  createUpdateFrameStepBadge: vi.fn(() => 'update-frame-action'),
  createUpdateGlobalStepBadgeSettings: vi.fn(() => 'update-global-action'),
}));

vi.mock('./update', () => ({
  createUpdateFrameStepBadge: mocks.createUpdateFrameStepBadge,
  createUpdateGlobalStepBadgeSettings: mocks.createUpdateGlobalStepBadgeSettings,
}));

vi.mock('./reorder', () => ({
  createReorderStepBadge: mocks.createReorderStepBadge,
}));

import { createHistoryWrappedStepBadgeActions } from './actions-runtime';

describe('frame-manager-step-badge-actions-runtime', () => {
  it('assembles history-wrapped step-badge actions from canonical owner seams', () => {
    const withHistoryCommit = vi.fn((action) => `${String(action)}-wrapped`);
    const args = {
      globalStepBadgeSettingsRef: { current: { autoMode: false } },
      recalculateStepBadges: vi.fn(),
      recalculateStepBadgesRef: { current: vi.fn() },
      sessionStepBadgeTemplateRef: { current: null },
      setFrames: vi.fn(),
      stepBadgeOrderRef: { current: new Map() },
      withHistoryCommit,
    };

    const result = createHistoryWrappedStepBadgeActions(args as never);

    expect(mocks.createUpdateFrameStepBadge).toHaveBeenCalledWith(
      expect.objectContaining({
        globalStepBadgeSettingsRef: args.globalStepBadgeSettingsRef,
        recalculateStepBadgesRef: args.recalculateStepBadgesRef,
        sessionStepBadgeTemplateRef: args.sessionStepBadgeTemplateRef,
        setFrames: args.setFrames,
      })
    );
    expect(mocks.createUpdateGlobalStepBadgeSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        globalStepBadgeSettingsRef: args.globalStepBadgeSettingsRef,
        recalculateStepBadges: args.recalculateStepBadges,
      })
    );
    expect(mocks.createReorderStepBadge).toHaveBeenCalledWith(
      expect.objectContaining({
        recalculateStepBadgesRef: args.recalculateStepBadgesRef,
        setFrames: args.setFrames,
        stepBadgeOrderRef: args.stepBadgeOrderRef,
      })
    );
    expect(withHistoryCommit).toHaveBeenCalledTimes(3);
    expect(result).toEqual({
      reorderStepBadge: 'reorder-action-wrapped',
      updateFrameStepBadge: 'update-frame-action-wrapped',
      updateGlobalStepBadgeSettings: 'update-global-action-wrapped',
    });
  });
});
