import { translate } from '../../../platform/i18n';
import type {
  AudioRecordingRefs,
  AudioRecordingState,
  RecordingSessionArgs,
} from './session-types';

function startRecordingDurationTimer(
  timerRef: AudioRecordingRefs['timerRef'],
  setDurationSeconds: AudioRecordingState['setDurationSeconds'],
  startedAt: number
) {
  timerRef.current = window.setInterval(() => {
    setDurationSeconds((performance.now() - startedAt) / 1000);
  }, 150);
}

function bindRecorderDataEvents(
  chunksRef: AudioRecordingRefs['chunksRef'],
  recorder: MediaRecorder
) {
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) {
      chunksRef.current.push(event.data);
    }
  });
}

function bindRecorderStopEvent(args: {
  chunksRef: AudioRecordingRefs['chunksRef'];
  clearTimer: () => void;
  mimeType: string;
  recorder: MediaRecorder;
  sessionId: number;
  sessionRef: AudioRecordingRefs['sessionRef'];
  state: AudioRecordingState;
  startedAt: number;
  stopStream: () => void;
}) {
  args.recorder.addEventListener('stop', () => {
    args.clearTimer();
    args.stopStream();
    if (args.sessionId !== args.sessionRef.current) {
      return;
    }

    const blob = new Blob(args.chunksRef.current, {
      type: args.recorder.mimeType || args.mimeType || 'audio/webm',
    });
    const elapsedSeconds = Math.max(0.1, (performance.now() - args.startedAt) / 1000);
    args.state.setAudioBlob(blob);
    args.state.setAudioUrl(URL.createObjectURL(blob));
    args.state.setDurationSeconds(elapsedSeconds);
    args.state.setRecordedDuration(elapsedSeconds);
    args.state.setStatus('recorded');
    args.state.setTrimStart(0);
    args.state.setTrimEnd(elapsedSeconds);
  });
}

function createRecorder(stream: MediaStream, mimeType: string): MediaRecorder {
  return new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
}

function beginRecordedSessionState(state: AudioRecordingState) {
  state.setStatus('recording');
  state.setDurationSeconds(0);
}

export async function beginRecordingSession(args: RecordingSessionArgs) {
  const sessionId = args.refs.sessionRef.current;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (sessionId !== args.refs.sessionRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const recorder = createRecorder(stream, args.mimeType);
    const startedAt = performance.now();
    args.refs.chunksRef.current = [];
    args.refs.streamRef.current = stream;
    args.refs.mediaRecorderRef.current = recorder;
    beginRecordedSessionState(args.state);
    startRecordingDurationTimer(args.refs.timerRef, args.state.setDurationSeconds, startedAt);
    bindRecorderDataEvents(args.refs.chunksRef, recorder);
    bindRecorderStopEvent({
      chunksRef: args.refs.chunksRef,
      clearTimer: args.clearTimer,
      mimeType: args.mimeType,
      recorder,
      sessionId,
      sessionRef: args.refs.sessionRef,
      startedAt,
      state: args.state,
      stopStream: args.stopStream,
    });
    recorder.start();
  } catch {
    args.resetSession();
    args.state.setError(translate('videoEditor.app.recordAudioPermissionDenied'));
  }
}
