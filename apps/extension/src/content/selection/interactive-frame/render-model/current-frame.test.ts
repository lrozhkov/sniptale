// @vitest-environment jsdom

import { expect, it } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { resolveInteractiveCurrentFrame } from './current-frame';

const baseFrame: FrameData = {
  id: 'frame-1',
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  effectMode: 'border',
  callout: {
    anchor: 'center',
    bgColor: '#fff',
    enabled: true,
    fontFamily: 'sans',
    fontSize: 14,
    fontWeight: 'normal',
    htmlContent: '',
    maxWidth: 180,
    side: 'top',
    tailSize: 10,
    textColor: '#111',
    variant: 'bubble',
  },
};

it('keeps the optimistic temp frame while callout content is ahead of external frame props', () => {
  const tempFrame = {
    ...baseFrame,
    callout: {
      ...baseFrame.callout!,
      htmlContent: '<p>saved</p>',
    },
  };

  expect(
    resolveInteractiveCurrentFrame({
      frame: baseFrame,
      tempFrame,
      state: 'hover',
      isCalloutEditing: false,
    })
  ).toEqual({
    ...baseFrame,
    callout: {
      ...baseFrame.callout!,
      htmlContent: '<p>saved</p>',
    },
  });
});

it('preserves external style updates while only keeping optimistic callout content', () => {
  const frame = {
    ...baseFrame,
    callout: {
      ...baseFrame.callout!,
      bgColor: '#2563eb',
    },
  };
  const tempFrame = {
    ...baseFrame,
    callout: {
      ...baseFrame.callout!,
      htmlContent: '<p>saved</p>',
    },
  };

  expect(
    resolveInteractiveCurrentFrame({
      frame,
      tempFrame,
      state: 'hover',
      isCalloutEditing: false,
    })
  ).toEqual({
    ...frame,
    callout: {
      ...frame.callout!,
      htmlContent: '<p>saved</p>',
    },
  });
});

it('falls back to the external frame after parent props catch up', () => {
  const syncedFrame = {
    ...baseFrame,
    callout: {
      ...baseFrame.callout!,
      htmlContent: '<p>saved</p>',
    },
  };

  expect(
    resolveInteractiveCurrentFrame({
      frame: syncedFrame,
      tempFrame: syncedFrame,
      state: 'hover',
      isCalloutEditing: false,
    })
  ).toBe(syncedFrame);
});

it('prefers the external frame when only non-content callout settings differ', () => {
  const tempFrame = {
    ...baseFrame,
    callout: {
      ...baseFrame.callout!,
      bgColor: '#111827',
      side: 'right' as const,
    },
  };

  expect(
    resolveInteractiveCurrentFrame({
      frame: baseFrame,
      tempFrame,
      state: 'hover',
      isCalloutEditing: false,
    })
  ).toBe(baseFrame);
});
