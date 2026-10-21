import type { VideoProjectDurationMode } from '../types/layout';
import type {
  ReviewCaptionSettings,
  ReviewTextDocument,
  ReviewVoiceTextSnapshot,
} from '../../review/text-types';

/** Placement owns the clock; text provenance never authorizes access to source bytes. */
export type VideoProjectTextBinding =
  | { kind: 'project' }
  | { kind: 'source'; assetId: string; sourceInstanceId: string };

/** Retained text survives trims and cuts even when its source has no visible placement. */
export interface VideoProjectTextDocument {
  id: string;
  binding: VideoProjectTextBinding;
  /** Project-time text can follow the montage without extending its duration. */
  durationMode?: VideoProjectDurationMode;
  document: ReviewTextDocument;
  captions?: ReviewCaptionSettings;
}

/** Historical association belongs to the audio clip, independently of editable text or source lifetime. */
export interface VideoProjectVoiceTextSnapshot {
  version: 1;
  documentId: string;
  binding: VideoProjectTextBinding;
  basisHash: string;
  text: ReviewVoiceTextSnapshot;
}
