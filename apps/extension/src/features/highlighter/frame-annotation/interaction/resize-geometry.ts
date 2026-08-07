import type { ResizeDirection } from '../../contracts';
import type { FrameAnnotationVisualState } from '../model';
import { getCalloutPerimeterPoint, getCalloutPerimeterPosition } from '../callout/tail-drag';

export function resizeFrameAnnotationRect(args: {
  deltaX: number;
  deltaY: number;
  direction: ResizeDirection;
  minimumSize: number;
  start: Pick<FrameAnnotationVisualState, 'x' | 'y' | 'width' | 'height'>;
}) {
  let { x, y, width, height } = args.start;
  if (args.direction.includes('e')) width = Math.max(args.minimumSize, width + args.deltaX);
  if (args.direction.includes('w')) {
    const delta = Math.min(args.deltaX, width - args.minimumSize);
    x += delta;
    width -= delta;
  }
  if (args.direction.includes('s')) height = Math.max(args.minimumSize, height + args.deltaY);
  if (args.direction.includes('n')) {
    const delta = Math.min(args.deltaY, height - args.minimumSize);
    y += delta;
    height -= delta;
  }
  return { x, y, width, height };
}

export function preserveFrameAnnotationCalloutDuringResize<T extends FrameAnnotationVisualState>(
  start: T,
  resized: Pick<FrameAnnotationVisualState, 'x' | 'y' | 'width' | 'height'>,
  calloutCenter: { x: number; y: number } | null
): T {
  const next = { ...start, ...resized };
  if (!start.callout?.enabled || !calloutCenter) return next;
  const startCenter = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
  const resizedCenter = {
    x: resized.x + resized.width / 2,
    y: resized.y + resized.height / 2,
  };
  const placement = start.callout.placement;
  const frameAttachment = placement.connectorAttachments?.frame;
  const connectorFramePosition =
    frameAttachment?.mode === 'free'
      ? frameAttachment.perimeterPosition
      : frameAttachment
        ? undefined
        : placement.connectorFramePosition;
  const stationaryFramePosition =
    start.callout.style.connector.kind === 'line' && connectorFramePosition !== undefined
      ? getCalloutPerimeterPosition(
          resized,
          getCalloutPerimeterPoint(start, connectorFramePosition)
        )
      : connectorFramePosition;
  return {
    ...next,
    callout: {
      ...start.callout,
      placement: {
        ...placement,
        manualPlacement: {
          centerOffsetX: calloutCenter.x - resizedCenter.x,
          centerOffsetY: calloutCenter.y - resizedCenter.y,
        },
        ...(stationaryFramePosition === undefined
          ? {}
          : { connectorFramePosition: stationaryFramePosition }),
        ...(frameAttachment?.mode === 'free' && stationaryFramePosition !== undefined
          ? {
              connectorAttachments: {
                block: placement.connectorAttachments?.block ?? { mode: 'auto' },
                frame: { ...frameAttachment, perimeterPosition: stationaryFramePosition },
              },
            }
          : {}),
        ...(placement.connectorWaypoint
          ? {
              connectorWaypoint: {
                centerOffsetX:
                  startCenter.x + placement.connectorWaypoint.centerOffsetX - resizedCenter.x,
                centerOffsetY:
                  startCenter.y + placement.connectorWaypoint.centerOffsetY - resizedCenter.y,
              },
            }
          : {}),
      },
    },
  } as T;
}
