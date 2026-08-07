import { describe, expect, it } from 'vitest';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutTailMetrics } from '../../../features/highlighter/frame-annotation/callout/tail';
import { getDynamicTailState } from '../../../features/highlighter/frame-annotation/callout/dynamic-tail';
import { getCalloutLayoutState } from '../../../features/highlighter/frame-annotation/callout/layout';
import { createDefaultCalloutSettings } from '../../../features/highlighter/frame-annotation/callout/model';

const frameRect = { x: 100, y: 100, width: 160, height: 120 };
const anchorPoint = { x: 180, y: 100 };

function getBaseWidth(state: ReturnType<typeof getDynamicTailState>) {
  return Math.hypot(
    state.attachment.baseA.x - state.attachment.baseB.x,
    state.attachment.baseA.y - state.attachment.baseB.y
  );
}

describe('automatic connector movement', () => {
  it('compensates a horizontal bubble move by shifting the wedge base the other way', () => {
    const centeredBubble = { x: 120, y: 20, width: 120, height: 48 };
    const shiftedBubble = { ...centeredBubble, x: 150 };
    const centered = getDynamicTailState({
      anchorPoint,
      bubbleRect: centeredBubble,
      frameRect,
      preferredSide: 'top',
      tailSize: 8,
    });
    const shifted = getDynamicTailState({
      anchorPoint,
      bubbleOffset: { x: 30, y: 0 },
      bubbleRect: shiftedBubble,
      frameRect,
      previousSide: centered.side,
      tailSize: 8,
    });

    expect(shifted.attachment.bubbleEdgePoint.x - shiftedBubble.x).toBeLessThan(
      centered.attachment.bubbleEdgePoint.x - centeredBubble.x
    );
    expect(shifted.attachment.framePoint.x).toBeGreaterThan(centered.attachment.framePoint.x);
  });

  it('compensates a vertical bubble move by shifting the wedge base the other way', () => {
    const centeredBubble = { x: 280, y: 136, width: 120, height: 48 };
    const shiftedBubble = { ...centeredBubble, y: 166 };
    const centered = getDynamicTailState({
      anchorPoint: { x: 260, y: 160 },
      bubbleRect: centeredBubble,
      frameRect,
      preferredSide: 'right',
      tailSize: 8,
    });
    const shifted = getDynamicTailState({
      anchorPoint: { x: 260, y: 160 },
      bubbleOffset: { x: 0, y: 30 },
      bubbleRect: shiftedBubble,
      frameRect,
      previousSide: centered.side,
      tailSize: 8,
    });

    expect(shifted.attachment.bubbleEdgePoint.y - shiftedBubble.y).toBeLessThan(
      centered.attachment.bubbleEdgePoint.y - centeredBubble.y
    );
  });

  it('widens only an automatic wedge base as its angle becomes sharp', () => {
    const near = getDynamicTailState({
      anchorPoint,
      bubbleRect: { x: 120, y: -220, width: 120, height: 60 },
      frameRect,
      preferredSide: 'top',
      tailSize: 8,
    });
    const farArgs = {
      anchorPoint,
      bubbleOffset: { x: 300, y: 0 },
      bubbleRect: { x: 420, y: -220, width: 120, height: 60 },
      frameRect,
      preferredSide: 'top' as const,
      tailSize: 8,
    };
    const automatic = getDynamicTailState(farArgs);
    const manual = getDynamicTailState({ ...farArgs, tailBaseWidth: 0.2 });

    expect(getBaseWidth(near)).toBeCloseTo(getCalloutTailMetrics(8).baseSpan);
    expect(getBaseWidth(automatic)).toBeGreaterThan(getBaseWidth(near) * 1.25);
    expect(getBaseWidth(manual)).toBeCloseTo(24);
  });

  it('shifts the line attachment against manual callout movement', () => {
    const dimensions = { width: 160, height: 48 };
    const settings = createDefaultCalloutSettings();
    const lineSettings: CalloutSettings = {
      ...settings,
      style: {
        ...settings.style,
        connector: { ...settings.style.connector, kind: 'line', routing: 'straight' },
      },
    };
    const automatic = getCalloutLayoutState({
      dimensions,
      frameRect,
      isEditing: false,
      settings: lineSettings,
      zIndex: 20,
    });
    const shifted = getCalloutLayoutState({
      dimensions,
      frameRect,
      isEditing: false,
      ...(automatic.dynamicTail ? { previousConnectorSide: automatic.dynamicTail.side } : {}),
      settings: {
        ...lineSettings,
        placement: {
          ...lineSettings.placement,
          manualPlacement: {
            centerOffsetX: 30,
            centerOffsetY:
              automatic.calloutPos.y + dimensions.height / 2 - (frameRect.y + frameRect.height / 2),
          },
        },
      },
      zIndex: 20,
    });

    if (automatic.dynamicTail?.kind !== 'line' || shifted.dynamicTail?.kind !== 'line') {
      throw new Error('Expected line connectors');
    }
    expect(shifted.dynamicTail.attachment.bubbleEdgePoint.x - shifted.calloutPos.x).toBeLessThan(
      automatic.dynamicTail.attachment.bubbleEdgePoint.x - automatic.calloutPos.x
    );
    expect(shifted.dynamicTail.attachment.framePoint.x).toBeGreaterThan(
      automatic.dynamicTail.attachment.framePoint.x
    );
  });
});
