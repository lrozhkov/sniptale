// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createFrameDataFixture } from '../react/test-support';
import { createUpdateFrameEffectHandler } from '.';

describe('frame mutation action assembly', () => {
  it('changes only the target frame effect and preserves future-frame defaults', () => {
    let currentFrames = [createFrameDataFixture('frame-1'), createFrameDataFixture('frame-2')];
    const setFrames = vi.fn<React.Dispatch<React.SetStateAction<typeof currentFrames>>>(
      (updater) => {
        currentFrames = typeof updater === 'function' ? updater(currentFrames) : updater;
      }
    );
    const targetFrame = currentFrames[1];
    if (!targetFrame) {
      throw new Error('expected second frame');
    }
    currentFrames[1] = {
      ...targetFrame,
      blurSettings: {
        amount: 32,
        blurType: 'solid',
        showBorder: false,
      },
      focusSettings: {
        opacity: 0.8,
        showBorder: true,
      },
    };
    const sessionBlurSettingsRef = {
      current: { amount: 8, blurType: 'gaussian' as const, showBorder: true },
    };
    const sessionFocusSettingsRef = { current: { opacity: 0.5, showBorder: false } };
    const sessionDefaultsInitializedRef = { current: false };
    const globalEffectModeRef = { current: 'border' as const };

    const updateFrameEffect = createUpdateFrameEffectHandler({ setFrames });
    updateFrameEffect('frame-2', 'focus');

    const updatedFrame = currentFrames[1];
    expect(updatedFrame?.effectMode).toBe('focus');
    expect(globalEffectModeRef.current).toBe('border');
    expect(sessionDefaultsInitializedRef.current).toBe(false);
    expect(sessionBlurSettingsRef.current).toEqual({
      amount: 8,
      blurType: 'gaussian',
      showBorder: true,
    });
    expect(sessionFocusSettingsRef.current).toEqual({ opacity: 0.5, showBorder: false });
  });
});
