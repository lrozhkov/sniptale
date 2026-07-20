type AudioTrimRange = {
  trimEnd: number;
  trimStart: number;
};

export interface AudioRecordingModalProps {
  isOpen: boolean;
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

function resolveRecordingExtension(mimeType: string) {
  if (mimeType.includes('ogg')) {
    return 'ogg';
  }

  if (mimeType.includes('mp4')) {
    return 'm4a';
  }

  return 'webm';
}

export function createRecordedAudioFile(blob: Blob) {
  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const mimeType = blob.type || 'audio/webm';
  const extension = resolveRecordingExtension(mimeType);

  return new File([blob], `voice-${timestamp}.${extension}`, {
    type: mimeType,
  });
}

export { resolveRecordingMimeType };
