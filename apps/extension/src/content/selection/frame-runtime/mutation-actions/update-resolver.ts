import { createLogger } from '@sniptale/platform/observability/logger';
import type { FrameData } from '../../../../features/highlighter/contracts';
import { calculateFrameOffsetFromElement, calculateFrameViewportCoords } from '../manager/coords';

const logger = createLogger({ namespace: 'ContentFrameMutationUpdate' });

export function resolveUpdatedFrame(args: {
  frame: FrameData;
  frameId: string;
  linkedElement?: HTMLElement;
  newFrame: FrameData;
}): FrameData {
  if (haveFrameCoordsChanged(args.frame, args.newFrame)) {
    return resolveCoordsUpdatedFrame(args);
  }

  if (args.linkedElement?.isConnected && haveFrameBorderMetricsChanged(args.frame, args.newFrame)) {
    return resolveBorderMetricsUpdatedFrame({
      ...args,
      linkedElement: args.linkedElement,
    });
  }

  if (args.linkedElement?.isConnected) {
    return {
      ...mergeFrameOverlayState(args.frame, args.newFrame),
      linkedElement: args.linkedElement,
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
  frame: FrameData;
  frameId: string;
  linkedElement?: HTMLElement;
  newFrame: FrameData;
}): FrameData {
  if (!args.linkedElement?.isConnected) {
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
    return {
      ...mergeFrameOverlayState(args.frame, args.newFrame),
    };
  }

  const offset = calculateFrameOffsetFromElement(args.newFrame, args.linkedElement);
  logger.debug('Frame coordinates changed, calculating viewport-relative offset', {
    frameId: args.frameId,
    frame: {
      x: args.newFrame.x,
      y: args.newFrame.y,
      w: args.newFrame.width,
      h: args.newFrame.height,
    },
    element: args.linkedElement.getBoundingClientRect(),
    offset,
  });

  return {
    ...mergeFrameOverlayState(args.frame, args.newFrame),
    linkedElement: args.linkedElement,
    offset,
  };
}

function haveFrameBorderMetricsChanged(frame: FrameData, newFrame: FrameData) {
  const oldPadding = frame.borderSettings?.padding;
  const newPadding = newFrame.borderSettings?.padding;
  return (
    oldPadding?.top !== newPadding?.top ||
    oldPadding?.left !== newPadding?.left ||
    oldPadding?.right !== newPadding?.right ||
    oldPadding?.bottom !== newPadding?.bottom ||
    frame.borderSettings?.width !== newFrame.borderSettings?.width
  );
}

function resolveBorderMetricsUpdatedFrame(args: {
  frame: FrameData;
  frameId: string;
  linkedElement: HTMLElement;
  newFrame: FrameData;
}): FrameData {
  const coords = calculateFrameViewportCoords(args.linkedElement, args.newFrame.borderSettings);
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
    linkedElement: args.linkedElement,
  };
}

function mergeFrameOverlayState(frame: FrameData, newFrame: FrameData): FrameData {
  const {
    callout: _callout,
    stepBadge: _stepBadge,
    linkedElement: _linkedElement,
    offset: _offset,
    ...nextFrame
  } = newFrame;

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
