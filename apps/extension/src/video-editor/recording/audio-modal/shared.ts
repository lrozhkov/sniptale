import type {
  AudioRecordingTimeline,
  AudioTrimRange,
} from '../../../composition/audio-recording/session-types';

export interface AudioRecordingModalProps {
  isOpen: boolean;
  timeline?: AudioRecordingTimeline | undefined;
  onClose: () => void;
  onSave: (file: File, trim: AudioTrimRange) => Promise<void>;
}
