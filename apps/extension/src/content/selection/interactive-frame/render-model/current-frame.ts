import type { FrameData, FrameState } from '../../../../features/highlighter/contracts';

function resolveOptimisticCallout(frame: FrameData, tempFrame: FrameData) {
  const current = frame.callout;
  const optimistic = tempFrame.callout;

  if (!current && !optimistic) {
    return current;
  }

  if (!current) {
    return optimistic;
  }

  if (!optimistic) {
    return current;
  }

  const hasOptimisticContent =
    current.enabled !== optimistic.enabled || current.htmlContent !== optimistic.htmlContent;

  if (!hasOptimisticContent) {
    return current;
  }

  return {
    ...current,
    enabled: optimistic.enabled,
    htmlContent: optimistic.htmlContent,
  };
}

export function resolveInteractiveCurrentFrame(args: {
  frame: FrameData;
  tempFrame: FrameData;
  state: FrameState;
  isCalloutEditing: boolean;
}) {
  if (args.state === 'editing' || args.isCalloutEditing) {
    return args.tempFrame;
  }

  const optimisticCallout = resolveOptimisticCallout(args.frame, args.tempFrame);
  if (optimisticCallout === args.frame.callout) {
    return args.frame;
  }

  return {
    ...args.frame,
    ...(optimisticCallout === undefined ? {} : { callout: optimisticCallout }),
  };
}
