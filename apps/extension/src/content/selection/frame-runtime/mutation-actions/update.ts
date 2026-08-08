import type { FrameData } from '../../../../features/highlighter/contracts';
import { haveFramePaddingChanged, resolveUpdatedFrame } from './update-resolver';

type FrameSetter = React.Dispatch<React.SetStateAction<FrameData[]>>;

export function createUpdateFrameHandler({
  setFrames,
  framesRef,
  hostLayoutServiceRef,
}: {
  setFrames: FrameSetter;
  framesRef: React.MutableRefObject<FrameData[]>;
  hostLayoutServiceRef: React.MutableRefObject<
    import('../host-layout/service').FrameHostLayoutService
  >;
}) {
  return (frameId: string, newFrame: FrameData) => {
    const anchorNode = hostLayoutServiceRef.current.getNode(frameId) ?? undefined;
    const currentFrame = framesRef.current.find((frame) => frame.id === frameId);
    const paddingChanged = currentFrame ? haveFramePaddingChanged(currentFrame, newFrame) : false;
    const resolveFrame = (frame: FrameData) =>
      resolveUpdatedFrame({
        frame,
        frameId,
        newFrame,
        ...(anchorNode === undefined ? {} : { anchorNode }),
      });
    const projectedFrame = currentFrame ? resolveFrame(currentFrame) : null;
    if (currentFrame && projectedFrame) {
      const committedFrame = resolveCommitSafeFrame({
        currentFrame,
        frameId,
        hostLayoutServiceRef,
        paddingChanged,
        projectedFrame,
        ...(anchorNode === undefined ? {} : { anchorNode }),
      });
      const frames = framesRef.current.map((frame) =>
        frame.id === frameId ? committedFrame : frame
      );
      framesRef.current = frames;
      setFrames(frames);
    }
  };
}

function resolveCommitSafeFrame(args: {
  anchorNode?: HTMLElement;
  currentFrame: FrameData;
  frameId: string;
  hostLayoutServiceRef: React.MutableRefObject<
    import('../host-layout/service').FrameHostLayoutService
  >;
  paddingChanged: boolean;
  projectedFrame: FrameData;
}): FrameData {
  if (args.paddingChanged) {
    return args.projectedFrame;
  }
  if (
    !args.currentFrame.linkedElementSelector ||
    !haveFrameGeometryChanged(args.currentFrame, args.projectedFrame)
  ) {
    return args.projectedFrame;
  }

  const placement = args.projectedFrame.pagePlacement;
  if (!args.anchorNode) {
    return preserveCommittedGeometry(args.currentFrame, args.projectedFrame);
  }
  const accepted = args.hostLayoutServiceRef.current.recordManualPlacement(
    args.frameId,
    args.anchorNode,
    placement
      ? {
          pagePlacement: placement,
          rect: {
            x: args.projectedFrame.x,
            y: args.projectedFrame.y,
            width: args.projectedFrame.width,
            height: args.projectedFrame.height,
          },
        }
      : undefined
  );
  return accepted
    ? {
        ...args.projectedFrame,
        ...accepted.rect,
        pagePlacement: accepted.pagePlacement,
      }
    : preserveCommittedGeometry(args.currentFrame, args.projectedFrame);
}

function preserveCommittedGeometry(current: FrameData, projected: FrameData): FrameData {
  const { offset: _projectedOffset, pagePlacement: _projectedPlacement, ...rest } = projected;
  return {
    ...rest,
    x: current.x,
    y: current.y,
    width: current.width,
    height: current.height,
    ...(current.pagePlacement
      ? {
          pagePlacement: {
            ...current.pagePlacement,
            iframePath: [...current.pagePlacement.iframePath],
          },
        }
      : {}),
    ...(current.offset ? { offset: { ...current.offset } } : {}),
  };
}

function haveFrameGeometryChanged(current: FrameData, next: FrameData) {
  return (
    current.x !== next.x ||
    current.y !== next.y ||
    current.width !== next.width ||
    current.height !== next.height
  );
}
