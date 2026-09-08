export const VideoEditorSelectionKind = {
  SCENE: 'scene',
  CLIP: 'clip',
  CLIP_GROUP: 'clip-group',
  TRACK: 'track',
  TRANSITION_JUNCTION: 'transition-junction',
  CURSOR_SEGMENT: 'cursor-segment',
  OBJECT_TRACK: 'object-track',
  ACTION_OCCURRENCE: 'action-occurrence',
  MOTION_REGION: 'motion-region',
  MOTION_CONNECTION: 'motion-connection',
  MOTION_LANE: 'motion-lane',
  HISTORY_LANE: 'history-lane',
  HISTORY_SPAN: 'history-span',
} as const;

export type VideoEditorSelectionKind =
  (typeof VideoEditorSelectionKind)[keyof typeof VideoEditorSelectionKind];

export type VideoEditorSelection =
  | { kind: typeof VideoEditorSelectionKind.SCENE }
  | { kind: typeof VideoEditorSelectionKind.MOTION_LANE }
  | { kind: typeof VideoEditorSelectionKind.HISTORY_LANE }
  | ({
      kind: typeof VideoEditorSelectionKind.HISTORY_SPAN;
    } & import('./commands/timeline').VideoEditorTypingSpanTarget)
  | { kind: typeof VideoEditorSelectionKind.MOTION_CONNECTION; motionRegionId: string }
  | { kind: typeof VideoEditorSelectionKind.CLIP; clipId: string }
  | { kind: typeof VideoEditorSelectionKind.CLIP_GROUP; clipIds: string[]; anchorClipId: string }
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
      kind: typeof VideoEditorSelectionKind.ACTION_OCCURRENCE;
      eventId: string;
      clipId: string | null;
    }
  | {
      kind: typeof VideoEditorSelectionKind.MOTION_REGION;
      motionRegionId: string;
    };

export function resolveSelectedClipId(selection: VideoEditorSelection): string | null {
  return selection.kind === VideoEditorSelectionKind.CLIP ? selection.clipId : null;
}
