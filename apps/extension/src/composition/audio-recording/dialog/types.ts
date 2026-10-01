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
  /** Notify retention only after a real durable reference, even if later publication fails. */
  onSave: (
    file: File,
    trim: AudioTrimRange,
    signal: AbortSignal,
    take: Blob,
    onRetained?: () => void
  ) => Promise<void>;
}
