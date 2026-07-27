// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { createCanvasContextStub } from './canvas-context.test.helpers';
import { clipRoundedRect, projectViewerFrames } from './canvas';

function createIframe(scroll: { x: number; y: number }): HTMLIFrameElement {
  const iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  iframe.getBoundingClientRect = () =>
    ({
      bottom: 220,
      height: 200,
      left: 10,
      right: 310,
      top: 20,
      width: 300,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    }) as DOMRect;
  Object.defineProperty(iframe.contentWindow, 'scrollX', { configurable: true, value: scroll.x });
  Object.defineProperty(iframe.contentWindow, 'scrollY', { configurable: true, value: scroll.y });
  return iframe;
}

function createFrame(): FrameData {
  return {
    borderSettings: {
      color: '#445566',
      customCss: '',
      fillColor: '#112233',
      fillOpacity: 25,
      id: 'border-1',
      inheritCustomCss: false,
      name: 'Border',
      opacity: 100,
      order: 0,
      padding: { bottom: 0, left: 0, right: 0, top: 0 },
      radius: 8,
      shadow: 0,
      strokeOpacity: 40,
      style: 'solid',
      width: 4,
    },
    effectMode: 'border',
    height: 24,
    id: 'frame-1',
    width: 40,
    x: 45,
    y: 70,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe.each([
  { expectedX: 35, expectedY: 50, mode: 'visible' as const },
  { expectedX: 42, expectedY: 61, mode: 'full' as const },
])('viewer frame projection in $mode capture', ({ expectedX, expectedY, mode }) => {
  it('projects the canonical surface through iframe selection offset and full-page scroll', () => {
    const iframe = createIframe({ x: 7, y: 11 });

    const [projection] = projectViewerFrames({ frames: [createFrame()], iframe, mode });

    expect(projection?.surface.geometry).toEqual({
      height: 24,
      radius: 8,
      strokeWidth: 4,
      width: 40,
      x: expectedX,
      y: expectedY,
    });
  });
});

it('clips effects to the exact rounded outer surface', () => {
  const order: string[] = [];
  const context = createCanvasContextStub({
    beginPath: () => order.push('beginPath'),
    clip: () => order.push('clip'),
    roundRect: (...args: unknown[]) => order.push(`roundRect:${args.join(',')}`),
  });

  clipRoundedRect(context, {
    height: 24,
    radius: 8,
    strokeWidth: 4,
    width: 40,
    x: 10,
    y: 12,
  });

  expect(order).toEqual(['beginPath', 'roundRect:10,12,40,24,8', 'clip']);
});
