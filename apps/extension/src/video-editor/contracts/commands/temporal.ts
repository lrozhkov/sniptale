import type {
  VideoTemporalEasing,
  VideoTransitionEasing,
} from '../../../features/video/project/types/index';
import type {
  VideoEditorActionEventPatch,
  VideoEditorCursorSkinPatch,
  VideoEditorMotionRegionPatch,
  VideoEditorTransitionTemplatePatch,
} from './patches';

export interface VideoEditorTemporalActions {
  updateTransitionDuration: (transitionId: string, duration: number) => void;
  updateTransitionEasing: (transitionId: string, easing: VideoTransitionEasing) => void;
  updateTransitionTemplate: (
    transitionId: string,
    patch: VideoEditorTransitionTemplatePatch
  ) => void;
  insertCursorSample: (time: number) => void;
  deleteCursorSample: (sampleId: string) => void;
  clearCursorSampleSkinOverride: (sampleId: string) => void;
  updateCursorSampleVisibility: (sampleId: string, visible: boolean) => void;
  updateCursorSampleInterpolation: (sampleId: string, interpolation: VideoTemporalEasing) => void;
  updateCursorSampleSkinOverride: (sampleId: string, patch: VideoEditorCursorSkinPatch) => void;
  deleteActionEvent: (actionEventId: string) => void;
  updateActionEventDetails: (actionEventId: string, patch: VideoEditorActionEventPatch) => void;
  updateMotionRegion: (motionRegionId: string, patch: VideoEditorMotionRegionPatch) => void;
  deleteMotionRegion: (motionRegionId: string) => void;
}
