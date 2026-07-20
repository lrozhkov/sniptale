import type {
  VideoObjectTrack,
  VideoObjectTrackCorrectionAnchor,
} from '../../../features/video/project/object-tracks';

export interface VideoEditorObjectTrackActions {
  deleteObjectTrack: (trackId: string) => void;
  startObjectTrackAnchorPlacement: (objectTrackId: string) => void;
  upsertObjectTrackCorrectionAnchor: (
    trackId: string,
    anchor: Omit<VideoObjectTrackCorrectionAnchor, 'id'> & { id?: string }
  ) => void;
  upsertObjectTrack: (track: VideoObjectTrack) => void;
}
