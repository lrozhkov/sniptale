type AudioTrimRange = {
  trimEnd: number;
  trimStart: number;
};

export interface AudioRecordingModalProps {
  isOpen: boolean;
  timeline?:
    | {
        startTime: number;
        duration: number;
        beforeStart: () => Promise<void>;
        onStop: () => void;
      }
    | undefined;

  onClose: () => void;
  onSave: (file: File, trim: AudioTrimRange) => Promise<void>;
}

export type AudioRecordingStatus = 'idle' | 'recording' | 'recorded';

export function formatDurationLabel(totalSeconds: number) {
  const roundedSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function resolveRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return null;
  }

  const supportedTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];

  return supportedTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) ?? '';
}

export { resolveRecordingMimeType };
