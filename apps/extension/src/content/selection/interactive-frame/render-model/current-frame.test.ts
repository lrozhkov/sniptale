// @vitest-environment jsdom

import { expect, it } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { resolveInteractiveCurrentFrame } from './current-frame';
import { createDefaultCalloutSettings } from '../../../../features/highlighter/frame-annotation/callout/model';

const baseCallout = createDefaultCalloutSettings();

const baseFrame: FrameData = {
  id: 'frame-1',
  x: 10,
  y: 20,
  width: 100,
  height: 80,
  effectMode: 'border',
  callout: baseCallout,
};

it('keeps the optimistic temp frame while callout content is ahead of external frame props', () => {
  const tempFrame = {
    ...baseFrame,
    callout: {
      ...baseFrame.callout!,
      content: { ...baseFrame.callout!.content, bodyHtml: '<p>saved</p>' },
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
      content: { ...baseFrame.callout!.content, bodyHtml: '<p>saved</p>' },
    },
  });
});

it('preserves external style updates while only keeping optimistic callout content', () => {
  const frame = {
    ...baseFrame,
    callout: {
      ...baseFrame.callout!,
      style: {
        ...baseFrame.callout!.style,
        surface: { ...baseFrame.callout!.style.surface, backgroundColor: '#2563eb' },
      },
    },
  };
  const tempFrame = {
    ...baseFrame,
    callout: {
      ...baseFrame.callout!,
      content: { ...baseFrame.callout!.content, bodyHtml: '<p>saved</p>' },
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
      content: { ...frame.callout!.content, bodyHtml: '<p>saved</p>' },
    },
  });
});

it('falls back to the external frame after parent props catch up', () => {
  const syncedFrame = {
    ...baseFrame,
    callout: {
      ...baseFrame.callout!,
      content: { ...baseFrame.callout!.content, bodyHtml: '<p>saved</p>' },
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
      placement: { ...baseFrame.callout!.placement, side: 'right' as const },
      style: {
        ...baseFrame.callout!.style,
        surface: { ...baseFrame.callout!.style.surface, backgroundColor: '#111827' },
      },
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

it('renders the complete pending callout draft until external props acknowledge it', () => {
  const additionalCallout = createDefaultCalloutSettings();
  const tempFrame = {
    ...baseFrame,
    additionalCallouts: [additionalCallout],
    callout: {
      ...baseFrame.callout!,
      style: {
        ...baseFrame.callout!.style,
        surface: { ...baseFrame.callout!.style.surface, backgroundColor: '#111827' },
      },
    },
  };

  expect(
    resolveInteractiveCurrentFrame({
      frame: baseFrame,
      tempFrame,
      state: 'hover',
      isCalloutEditing: false,
      isCalloutDraftPending: true,
    })
  ).toBe(tempFrame);
});
