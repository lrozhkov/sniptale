import type { AudioRecordingTimeline, AudioTrimRange } from '../session-types';

export interface AudioRecordingModalProps {
  isOpen: boolean;
  title?: string | undefined;
  saveLabel?: string | undefined;
  captureLimitSeconds?: number | undefined;
  timeline?: AudioRecordingTimeline | undefined;
  playVideo?: boolean | undefined;
  playbackRunning?: boolean | undefined;
  onPlayVideoChange?: ((value: boolean) => void) | undefined;
  onClose: () => void;
  onSave: (file: File, trim: AudioTrimRange, signal: AbortSignal, take: Blob) => Promise<void>;
}
