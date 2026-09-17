import type { RefObject } from 'react';
import { evaluateQuickEditCameraAtTime } from '../../features/video/review/advanced/scene';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import type { CanvasComment, ReviewRegion, ReviewSource } from '../../features/video/review/types';
import type { useCanvasComments } from './use-canvas-comments';
import { ReviewStage } from './stage';

/**
 * One stage binding: drawing plane, zoom focus handle, and the overlay comment stack.
 * Content-attached comments evaluate the camera at the playhead, matching the renderer.
 */
export function ReviewStageBinding(props: {
  url: string;
  source: ReviewSource;
  video: RefObject<HTMLVideoElement | null>;
  drawing: boolean;
  region: ReviewRegion | undefined;
  zoom: QuickEditAdvancedState['zoom'] | null;
  zoomOverlay:
    | {
        camera: QuickEditAdvancedState['zoom']['regions'][number]['transform'];
        background: QuickEditAdvancedState['background'];
        onDrag(point: { x: number; y: number }): void;
      }
    | undefined;
  comments: readonly CanvasComment[];
  canvasComments: ReturnType<typeof useCanvasComments>;
  time: number;
  background: QuickEditAdvancedState['background'];
  busy: boolean;
  onRegion(value: ReviewRegion): void;
  onReady(): void;
  onTime(value: number): void;
  onPlaying(value: boolean): void;
  onError(): void;
}) {
  return (
    <ReviewStage
      url={props.url}
      source={props.source}
      video={props.video}
      drawing={props.drawing}
      region={props.region}
      {...(props.zoomOverlay ? { zoom: props.zoomOverlay } : {})}
      comments={{
        items: props.comments,
        time: props.time,
        background: props.background,
        camera: props.zoom?.regions.length
          ? evaluateQuickEditCameraAtTime(props.zoom.regions, props.time)
          : null,
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
