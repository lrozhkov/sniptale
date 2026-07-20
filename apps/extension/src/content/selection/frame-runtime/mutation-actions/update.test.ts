// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  createBorderSettingsFixture,
  createCalloutSettingsFixture,
  createFrameDataFixture,
  createStepBadgeSettingsFixture,
} from '../react/test-support';
import { createUpdateFrameHandler } from './update';

const testBorderSettings = createBorderSettingsFixture({
  color: '#ff671d',
  id: 'preset-1',
  name: 'Preset',
  opacity: 100,
  radius: 0,
  width: 3,
});

const testCallout = createCalloutSettingsFixture();

const testStepBadge = createStepBadgeSettingsFixture({
  alphabet: 'latin',
  value: '1',
});

function createFrame() {
  return createFrameDataFixture('frame-1', {
    borderSettings: testBorderSettings,
    callout: testCallout,
    stepBadge: testStepBadge,
    width: 100,
  });
}

describe('frame mutation actions update', () => {
  it('preserves an existing callout when a partial frame update omits callout', () => {
    const linkedElement = document.createElement('div');
    const frame = createFrame();
    let currentFrames = [frame];
    const setFrames = vi.fn((updater) => {
      currentFrames = typeof updater === 'function' ? updater(currentFrames) : updater;
    });
    const updateFrame = createUpdateFrameHandler({
      linkedElementsRef: { current: new Map([[frame.id, linkedElement]]) },
      setFrames,
    });

    updateFrame(frame.id, {
      ...frame,
      borderSettings: {
        ...frame.borderSettings!,
        color: '#00a3ff',
      },
    });

    expect(setFrames).toHaveBeenCalledTimes(1);
    const updatedFrame = currentFrames[0];
    expect(updatedFrame?.callout).toEqual(frame.callout);
    expect(updatedFrame?.borderSettings?.color).toBe('#00a3ff');
  });
});
