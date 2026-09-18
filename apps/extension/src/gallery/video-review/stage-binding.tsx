import type { RefObject } from 'react';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditCameraTransform,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { CanvasComment, ReviewRegion, ReviewSource } from '../../features/video/review/types';
import type { useCanvasComments } from './use-canvas-comments';
import { ReviewStage } from './stage';

/**
 * One stage binding: the applied scene (background plus the camera at the represented
 * frame), the selected zoom focus handle, and the overlay comment stack. Lane
 * visibility and selection never change the applied pixels.
 */
export function ReviewStageBinding(props: {
  url: string;
  source: ReviewSource;
  video: RefObject<HTMLVideoElement | null>;
  drawing: boolean;
  region: ReviewRegion | undefined;
  zoomRegions: readonly QuickEditZoomRegion[];
  background: QuickEditBackgroundSettings;
  outputTime: number;
  zoomOverlay:
    | {
        camera: QuickEditCameraTransform;
        onDrag(point: { x: number; y: number }): void;
      }
    | undefined;
  comments: readonly CanvasComment[];
  canvasComments: ReturnType<typeof useCanvasComments>;
  time: number;
  busy: boolean;
  onRegion(value: ReviewRegion): void;
  onReady(): void;
  onTime(value: number): void;
  onPlaying(value: boolean): void;
  onError(): void;
}) {
  const camera: QuickEditCameraTransform = props.zoomRegions.length
    ? evaluateQuickEditCameraAtTime(props.zoomRegions, props.outputTime)
    : { scale: 1, centerX: 0.5, centerY: 0.5 };
  return (
    <ReviewStage
      url={props.url}
      source={props.source}
      video={props.video}
      drawing={props.drawing}
      region={props.region}
      scene={{ background: props.background, camera }}
      {...(props.zoomOverlay ? { zoom: props.zoomOverlay } : {})}
      comments={{
        items: props.comments,
        time: props.time,
        background: props.background,
        camera: props.zoomRegions.length ? camera : null,
        selectedId: props.canvasComments.selectedId,
        busy: props.busy,
        onSelect: props.canvasComments.onSelect,
        onMove: (id, position) => {
          const comment = props.comments.find((item) => item.id === id);
          if (comment) void props.canvasComments.onPatch(comment, { position });
        },
      }}
      onRegion={props.onRegion}
      onReady={props.onReady}
      onTime={props.onTime}
      onPlaying={props.onPlaying}
      onError={props.onError}
    />
  );
}
