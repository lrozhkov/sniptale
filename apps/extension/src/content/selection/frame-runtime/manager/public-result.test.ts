// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { buildFrameManagerResult } from './public-result';

describe('frame-manager-public-result', () => {
  it('returns the stable public frame-manager surface without reshaping handlers', () => {
    const params = {
      addAutoBlurFrames: vi.fn(),
      addFrame: vi.fn(),
      clearAutoBlurFrames: vi.fn(),
      clearFrames: vi.fn(),
      frames: [],
      getGlobalStepBadgeSettings: vi.fn(),
      hasFrameForElement: vi.fn(),
      recalculateStepBadges: vi.fn(),
      removeFrame: vi.fn(),
      syncFocusOpacity: vi.fn(),
      syncAutoBlurFrames: vi.fn(),
      updateFrame: vi.fn(),
      updateFrameEffect: vi.fn(),
      updateFrameStepBadge: vi.fn(),
      updateGlobalStepBadgeSettings: vi.fn(),
    };

    expect(buildFrameManagerResult(params)).toEqual({
      addAutoBlurFrames: params.addAutoBlurFrames,
      addFrame: params.addFrame,
      clearAutoBlurFrames: params.clearAutoBlurFrames,
      clearFrames: params.clearFrames,
      syncAutoBlurFrames: params.syncAutoBlurFrames,
      frames: params.frames,
      getGlobalStepBadgeSettings: params.getGlobalStepBadgeSettings,
      hasFrameForElement: params.hasFrameForElement,
      recalculateStepBadges: params.recalculateStepBadges,
      removeFrame: params.removeFrame,
      syncFocusOpacity: params.syncFocusOpacity,
      updateFrame: params.updateFrame,
      updateFrameEffect: params.updateFrameEffect,
      updateFrameStepBadge: params.updateFrameStepBadge,
      updateGlobalStepBadgeSettings: params.updateGlobalStepBadgeSettings,
    });
  });
});
