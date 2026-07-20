import type { SetStateAction } from 'react';
import { expect, it } from 'vitest';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  createCalloutDeleteHandler,
  createCalloutPopoverSettingsHandler,
  createFrameCalloutChangedHandler,
} from './callout-handlers';

const baseCallout: CalloutSettings = {
  anchor: 'center',
  bgColor: '#ffffff',
  enabled: true,
  fontFamily: 'sans',
  fontSize: 14,
  fontWeight: 'normal',
  htmlContent: '<p>base</p>',
  maxWidth: 180,
  side: 'top',
  tailSize: 10,
  textColor: '#111111',
  variant: 'bubble',
};

function createFrame(overrides: Partial<FrameData> = {}): FrameData {
  return {
    height: 80,
    id: 'frame-1',
    width: 120,
    x: 10,
    y: 20,
    ...overrides,
  };
}

function createFramesHarness(initialFrames: FrameData[]) {
  let frames = initialFrames;

  return {
    getFrames: () => frames,
    setFrames: (update: SetStateAction<FrameData[]>) => {
      frames = typeof update === 'function' ? update(frames) : update;
      return frames;
    },
  };
}

it('creates a callout from the session style when a frame enables it for the first time', () => {
  const frames = createFramesHarness([createFrame()]);
  const sessionCalloutStyleRef = {
    current: {
      anchor: 'bottom-right' as const,
      bgColor: '#2563eb',
      fontSize: 18,
      side: 'right' as const,
      variant: 'text-only' as const,
    },
  };

  createFrameCalloutChangedHandler({
    sessionCalloutStyleRef,
    setFrames: frames.setFrames,
  })({
    frameId: 'frame-1',
    settings: { enabled: true },
  });

  expect(frames.getFrames()[0]?.callout).toMatchObject({
    anchor: 'bottom-right',
    bgColor: '#2563eb',
    enabled: true,
    fontSize: 18,
    htmlContent: '',
    side: 'right',
    variant: 'text-only',
  });
  expect(sessionCalloutStyleRef.current).toEqual(frames.getFrames()[0]?.callout);
});

it('merges popover settings into both the frame callout and the session style ref', () => {
  const frames = createFramesHarness([
    createFrame({
      callout: {
        ...baseCallout,
        bgColor: '#f59e0b',
        variant: 'text-only',
      },
    }),
  ]);
  const sessionCalloutStyleRef = {
    current: {
      fontFamily: 'serif' as const,
      side: 'left' as const,
    },
  };

  createCalloutPopoverSettingsHandler({
    sessionCalloutStyleRef,
    setFrames: frames.setFrames,
  })({
    frameId: 'frame-1',
    settings: {
      bgColor: '#10b981',
      side: 'bottom',
    },
  });

  expect(frames.getFrames()[0]?.callout).toMatchObject({
    ...baseCallout,
    bgColor: '#10b981',
    side: 'bottom',
    variant: 'text-only',
  });
  expect(sessionCalloutStyleRef.current).toEqual({
    ...baseCallout,
    bgColor: '#10b981',
    side: 'bottom',
    variant: 'text-only',
  });
});

it('disables the matching frame callout and leaves unrelated frames untouched', () => {
  const disabledCandidate = createFrame({ callout: baseCallout });
  const untouchedFrame = createFrame({
    callout: {
      ...baseCallout,
      enabled: true,
      htmlContent: '<p>keep</p>',
    } as CalloutSettings,
    id: 'frame-2',
  });
  const frames = createFramesHarness([disabledCandidate, untouchedFrame]);

  createCalloutDeleteHandler(frames.setFrames)({ frameId: 'frame-1' });

  expect(frames.getFrames()[0]?.callout).toMatchObject({
    ...baseCallout,
    enabled: false,
  });
  expect(frames.getFrames()[1]).toEqual(untouchedFrame);
});
