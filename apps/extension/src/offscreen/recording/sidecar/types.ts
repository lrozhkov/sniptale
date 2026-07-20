export type RecordingSidecarRecorder = {
  chunks: Blob[];
  filenameSuffix: string;
  kind: 'webcam';
  recorder: MediaRecorder;
  recordingId: string;
  stream: MediaStream;
  trackSettings: MediaTrackSettings;
};

export type RecordingSidecarSession = {
  recorders: RecordingSidecarRecorder[];
  stopPromise: Promise<void> | null;
};
