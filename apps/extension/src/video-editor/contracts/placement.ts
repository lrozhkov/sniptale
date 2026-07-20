export const VideoEditorPlacementModeKind = {
  ACTION_POINT: 'action-point',
  MOTION_FOCUS: 'motion-focus',
  MOTION_AREA: 'motion-area',
  MOTION_PATH_STOP_POINT: 'motion-path-stop-point',
  MOTION_PATH_STOP_AREA: 'motion-path-stop-area',
  OBJECT_TRACK_ANCHOR: 'object-track-anchor',
} as const;

export type VideoEditorPlacementMode =
  | {
      kind: typeof VideoEditorPlacementModeKind.ACTION_POINT;
      actionEventId: string;
    }
  | {
      kind: typeof VideoEditorPlacementModeKind.MOTION_FOCUS;
      motionRegionId: string;
    }
  | {
      kind: typeof VideoEditorPlacementModeKind.MOTION_AREA;
      motionRegionId: string;
    }
  | {
      kind: typeof VideoEditorPlacementModeKind.MOTION_PATH_STOP_POINT;
      motionRegionId: string;
      stopId: string;
    }
  | {
      kind: typeof VideoEditorPlacementModeKind.MOTION_PATH_STOP_AREA;
      motionRegionId: string;
      stopId: string;
    }
  | {
      kind: typeof VideoEditorPlacementModeKind.OBJECT_TRACK_ANCHOR;
      objectTrackId: string;
    };
