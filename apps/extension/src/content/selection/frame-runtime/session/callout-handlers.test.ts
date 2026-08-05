import type { SetStateAction } from 'react';
import { expect, it } from 'vitest';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { FrameData } from '../../../../features/highlighter/contracts';
import {
  createCalloutDeleteHandler,
  createCalloutPopoverSettingsHandler,
  createFrameCalloutChangedHandler,
} from './callout-handlers';
import { createDefaultCalloutSettings } from '../../callout/model';

const baseCallout: CalloutSettings = createDefaultCalloutSettings();
baseCallout.content.bodyHtml = '<p>base</p>';
baseCallout.placement = { anchor: 'center', side: 'top' };

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
      ...baseCallout.style,
      surface: { ...baseCallout.style.surface, backgroundColor: '#2563eb' },
      typography: { ...baseCallout.style.typography, fontSize: 18 },
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
    content: { bodyHtml: '', titleText: '' },
    enabled: true,
    style: {
      surface: { backgroundColor: '#2563eb' },
      typography: { fontSize: 18 },
    },
  });
  expect(sessionCalloutStyleRef.current).toEqual(frames.getFrames()[0]?.callout?.style);
});

it('merges popover settings into both the frame callout and the session style ref', () => {
  const frames = createFramesHarness([
    createFrame({
      callout: {
        ...baseCallout,
        style: {
          ...baseCallout.style,
          surface: { ...baseCallout.style.surface, backgroundColor: '#f59e0b' },
        },
      },
    }),
  ]);
  const sessionCalloutStyleRef = {
    current: baseCallout.style,
  };

  createCalloutPopoverSettingsHandler({
    sessionCalloutStyleRef,
    setFrames: frames.setFrames,
  })({
    frameId: 'frame-1',
    settings: {
      placement: { side: 'bottom' },
      style: { surface: { backgroundColor: '#10b981' } },
    },
  });

  expect(frames.getFrames()[0]?.callout).toMatchObject({
    placement: { side: 'bottom' },
    style: { surface: { backgroundColor: '#10b981' } },
  });
  expect(sessionCalloutStyleRef.current).toEqual({
    ...baseCallout.style,
    surface: { ...baseCallout.style.surface, backgroundColor: '#10b981' },
  });
});

it('disables the matching frame callout and leaves unrelated frames untouched', () => {
  const disabledCandidate = createFrame({ callout: baseCallout });
  const untouchedFrame = createFrame({
    callout: {
      ...baseCallout,
      enabled: true,
      content: { bodyHtml: '<p>keep</p>', titleText: '' },
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
