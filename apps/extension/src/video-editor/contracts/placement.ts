export const VideoEditorPlacementModeKind = {
  ACTION_POINT: 'action-point',
  MOTION_FOCUS: 'motion-focus',
  MOTION_AREA: 'motion-area',

  OBJECT_TRACK_ANCHOR: 'object-track-anchor',
} as const;

export type VideoEditorPlacementMode =
  | {
      kind: typeof VideoEditorPlacementModeKind.ACTION_POINT;
      eventId: string;
      clipId: string | null;
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
      kind: typeof VideoEditorPlacementModeKind.OBJECT_TRACK_ANCHOR;
      objectTrackId: string;
    };
