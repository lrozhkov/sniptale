import { createLogger } from '@sniptale/platform/observability/logger';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { calculateFrameOffsetFromElement, calculateFrameViewportCoords } from '../manager/coords';
import { createDocumentPagePlacement, updateDocumentPagePlacement } from '../../../platform/frame';

const logger = createLogger({ namespace: 'ContentFrameMutationUpdate' });

export function resolveUpdatedFrame(args: {
  anchorNode?: HTMLElement;
  frame: FrameData;
  frameId: string;
  newFrame: FrameData;
}): FrameData {
  if (haveFramePaddingChanged(args.frame, args.newFrame)) {
    return resolveCoordsUpdatedFrame({
      ...args,
      newFrame: applyFramePaddingChange(args.frame, args.newFrame),
    });
  }

  if (haveFrameCoordsChanged(args.frame, args.newFrame)) {
    return resolveCoordsUpdatedFrame(args);
  }

  if (
    args.anchorNode?.isConnected &&
    args.frame.offset === undefined &&
    haveFramePaddingChanged(args.frame, args.newFrame)
  ) {
    return resolveBorderMetricsUpdatedFrame({
      ...args,
      anchorNode: args.anchorNode,
    });
  }

  if (args.anchorNode?.isConnected) {
    return {
      ...mergeFrameOverlayState(args.frame, args.newFrame),
      ...(args.frame.offset === undefined ? {} : { offset: args.frame.offset }),
    };
  }

  logger.debug('Frame updated without linked element', args.frameId);
  return {
    ...mergeFrameOverlayState(args.frame, args.newFrame),
  };
}

function haveFrameCoordsChanged(frame: FrameData, newFrame: FrameData) {
  return (
    frame.x !== newFrame.x ||
    frame.y !== newFrame.y ||
    frame.width !== newFrame.width ||
    frame.height !== newFrame.height
  );
}

function resolveCoordsUpdatedFrame(args: {
  anchorNode?: HTMLElement;
  frame: FrameData;
  frameId: string;
  newFrame: FrameData;
}): FrameData {
  if (!args.anchorNode?.isConnected) {
    logger.debug('Frame coordinates changed without linked element', {
      frameId: args.frameId,
      old: { x: args.frame.x, y: args.frame.y, w: args.frame.width, h: args.frame.height },
      new: {
        x: args.newFrame.x,
        y: args.newFrame.y,
        w: args.newFrame.width,
        h: args.newFrame.height,
      },
    });
    const pagePlacement = args.frame.pagePlacement
      ? updateDocumentPagePlacement(args.frame.pagePlacement, args.newFrame.x, args.newFrame.y, {
          x: args.frame.x,
          y: args.frame.y,
        })
      : null;
    return {
      ...mergeFrameOverlayState(args.frame, args.newFrame),
      ...(pagePlacement ? { pagePlacement } : {}),
    };
  }

  const offset = calculateFrameOffsetFromElement(args.newFrame, args.anchorNode);
  const pagePlacement = createDocumentPagePlacement(
    args.anchorNode.ownerDocument,
    args.newFrame.x,
    args.newFrame.y
  );
  logger.debug('Frame coordinates changed, calculating viewport-relative offset', {
    frameId: args.frameId,
    frame: {
      x: args.newFrame.x,
      y: args.newFrame.y,
      w: args.newFrame.width,
      h: args.newFrame.height,
    },
    element: args.anchorNode.getBoundingClientRect(),
    offset,
  });

  return {
    ...mergeFrameOverlayState(args.frame, args.newFrame),
    ...(pagePlacement ? { pagePlacement } : {}),
    offset,
  };
}

function haveFramePaddingChanged(frame: FrameData, newFrame: FrameData) {
  const oldPadding = frame.borderSettings?.padding;
  const newPadding = newFrame.borderSettings?.padding;
  return (
    oldPadding?.top !== newPadding?.top ||
    oldPadding?.left !== newPadding?.left ||
    oldPadding?.right !== newPadding?.right ||
    oldPadding?.bottom !== newPadding?.bottom
  );
}

function applyFramePaddingChange(frame: FrameData, newFrame: FrameData): FrameData {
  const oldPadding = frame.borderSettings?.padding ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const newPadding = newFrame.borderSettings?.padding ?? oldPadding;
  const leftDelta = newPadding.left - oldPadding.left;
  const topDelta = newPadding.top - oldPadding.top;
  return {
    ...newFrame,
    x: frame.x - leftDelta,
    y: frame.y - topDelta,
    width: Math.max(1, frame.width + leftDelta + newPadding.right - oldPadding.right),
    height: Math.max(1, frame.height + topDelta + newPadding.bottom - oldPadding.bottom),
  };
}

function resolveBorderMetricsUpdatedFrame(args: {
  anchorNode: HTMLElement;
  frame: FrameData;
  frameId: string;
  newFrame: FrameData;
}): FrameData {
  const coords = calculateFrameViewportCoords(args.anchorNode, args.newFrame.borderSettings);
  const pagePlacement = createDocumentPagePlacement(
    args.anchorNode.ownerDocument,
    coords.x,
    coords.y
  );
  logger.debug('Frame settings changed, recalculating coordinates', {
    frameId: args.frameId,
    oldPadding: args.frame.borderSettings?.padding,
    newPadding: args.newFrame.borderSettings?.padding,
    oldBorderWidth: args.frame.borderSettings?.width,
    newBorderWidth: args.newFrame.borderSettings?.width,
    newCoords: { x: coords.x, y: coords.y, width: coords.width, height: coords.height },
  });

  return {
    ...mergeFrameOverlayState(args.frame, args.newFrame),
    ...coords,
    ...(pagePlacement ? { pagePlacement } : {}),
  };
}

function mergeFrameOverlayState(frame: FrameData, newFrame: FrameData): FrameData {
  const { callout: _callout, stepBadge: _stepBadge, offset: _offset, ...nextFrame } = newFrame;

  return {
    ...frame,
    ...nextFrame,
    ...(frame.stepBadge === undefined ? {} : { stepBadge: frame.stepBadge }),
    ...(newFrame.callout === undefined
      ? frame.callout === undefined
        ? {}
        : { callout: frame.callout }
      : { callout: newFrame.callout }),
  };
}
