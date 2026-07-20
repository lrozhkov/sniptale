export const VideoEditorSelectionKind = {
  SCENE: 'scene',
  CLIP: 'clip',
  TRACK: 'track',
  TRANSITION_JUNCTION: 'transition-junction',
  CURSOR_SEGMENT: 'cursor-segment',
  OBJECT_TRACK: 'object-track',
  ACTION_SEGMENT: 'action-segment',
  MOTION_REGION: 'motion-region',
} as const;

export type VideoEditorSelectionKind =
  (typeof VideoEditorSelectionKind)[keyof typeof VideoEditorSelectionKind];

export type VideoEditorSelection =
  | { kind: typeof VideoEditorSelectionKind.SCENE }
  | { kind: typeof VideoEditorSelectionKind.CLIP; clipId: string }
  | { kind: typeof VideoEditorSelectionKind.TRACK; trackId: string }
  | {
      kind: typeof VideoEditorSelectionKind.TRANSITION_JUNCTION;
      transitionId: string;
    }
  | {
      kind: typeof VideoEditorSelectionKind.CURSOR_SEGMENT;
      sampleId: string;
    }
  | {
      kind: typeof VideoEditorSelectionKind.OBJECT_TRACK;
      objectTrackId: string;
    }
  | {
      kind: typeof VideoEditorSelectionKind.ACTION_SEGMENT;
      actionEventId: string;
    }
  | {
      kind: typeof VideoEditorSelectionKind.MOTION_REGION;
      motionRegionId: string;
    };
