import { useCallback, useEffect, useRef, useState } from 'react';
import { beginRecordingSession, recordingElapsed } from './capture';
import { formatDurationLabel, resolveRecordingMimeType } from './format';
import { useRecordingLevelSession } from './level-session';
import type {
  AudioRecordingControllerState,
  AudioRecordingStatus,
  AudioRecordingTimeline,
  AudioRecordingErrors,
  AudioRecordingRefs,
  AudioRecordingState,
} from './session-types';

function useAudioRecordingState(): AudioRecordingState {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isPlayingSelection, setIsPlayingSelection] = useState(false);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [status, setStatus] = useState<AudioRecordingStatus>('idle');
  const [trimEnd, setTrimEnd] = useState(0);
  const [trimStart, setTrimStart] = useState(0);

  return {
    audioBlob,
    audioRef,
    audioUrl,
    durationSeconds,
    error,
    isPlayingSelection,
    recordedDuration,
    setAudioBlob,
    setAudioUrl,
    setDurationSeconds,
    setError,
    setIsPlayingSelection,
    setRecordedDuration,
    setStatus,
    setTrimEnd,
    setTrimStart,
    status,
    trimEnd,
    trimStart,
  };
}

function useAudioRecordingRefs(): AudioRecordingRefs {
  return {
    chunksRef: useRef<Blob[]>([]),
    mediaRecorderRef: useRef<MediaRecorder | null>(null),
    sessionRef: useRef(0),
    streamRef: useRef<MediaStream | null>(null),
    timerRef: useRef<number | null>(null),
    clockRef: useRef<AudioRecordingRefs['clockRef']['current']>(null),
  };
}

function stopRecordingStream(streamRef: AudioRecordingRefs['streamRef']) {
  streamRef.current?.getTracks().forEach((track) => track.stop());
  streamRef.current = null;
}

function clearRecordingTimer(timerRef: AudioRecordingRefs['timerRef']) {
  if (timerRef.current === null) {
    return;
  }

  window.clearInterval(timerRef.current);
  timerRef.current = null;
}

function resetAudioPreview(state: AudioRecordingState) {
  state.audioRef.current?.pause();
  state.setIsPlayingSelection(false);
  if (state.audioUrl) {
    URL.revokeObjectURL(state.audioUrl);
  }

  state.setAudioBlob(null);
  state.setAudioUrl(null);
  state.setDurationSeconds(0);
  state.setRecordedDuration(0);
  state.setTrimEnd(0);
  state.setTrimStart(0);
}

function useRecordingReset(state: AudioRecordingState, refs: AudioRecordingRefs) {
  return useCallback(() => {
    refs.sessionRef.current += 1;
    clearRecordingTimer(refs.timerRef);
    stopRecordingStream(refs.streamRef);
    refs.mediaRecorderRef.current = null;
    refs.clockRef.current = null;
    refs.chunksRef.current = [];
    state.setError(null);
    state.setStatus('idle');
    resetAudioPreview(state);
  }, [refs, state]);
}

function useTrimPlaybackLifecycle(state: AudioRecordingState) {
  useEffect(() => {
    const audio = state.audioRef.current;
    if (!audio || !state.audioUrl) {
      return;
    }

    let frame = 0;
    const handleTimeUpdate = () => {
      if (audio.paused || audio.currentTime < state.trimEnd) return;
      audio.pause();
      audio.currentTime = state.trimEnd;
      state.setIsPlayingSelection(false);
    };
    const monitor = () => {
      handleTimeUpdate();
      if (!audio.paused) frame = requestAnimationFrame(monitor);
    };
    const handlePause = () => {
      cancelAnimationFrame(frame);
      state.setIsPlayingSelection(false);
    };
    audio.addEventListener('play', monitor);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('pause', handlePause);
    if (!audio.paused) monitor();
    return () => {
      cancelAnimationFrame(frame);
      audio.removeEventListener('play', monitor);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('pause', handlePause);
    };
  }, [state]);
}

function useRecordingLifecycle(
  isOpen: boolean,
  resetSession: () => void,
  state: AudioRecordingState
) {
  const resetSessionOnUnmountRef = useRef(resetSession);

  useEffect(() => {
    resetSessionOnUnmountRef.current = resetSession;
  }, [resetSession]);

  useEffect(() => {
    if (!isOpen) {
      resetSession();
    }
  }, [isOpen, resetSession]);

  useEffect(() => () => resetSessionOnUnmountRef.current(), []);
  useTrimPlaybackLifecycle(state);
}

function useRecordingPlaybackControls(state: AudioRecordingState, errors: AudioRecordingErrors) {
  const playSelection = useCallback(async () => {
    const audio = state.audioRef.current;
    if (!audio || !state.audioUrl) {
      return;
    }

    if (audio.currentTime < state.trimStart || audio.currentTime >= state.trimEnd)
      audio.currentTime = state.trimStart;
    state.setError(null);
    try {
      await audio.play();
      if (state.audioRef.current === audio) state.setIsPlayingSelection(!audio.paused);
    } catch {
      if (state.audioRef.current === audio) state.setError(errors.playFailed);
    }
  }, [state, errors.playFailed]);

  const pauseSelection = useCallback(() => {
    state.audioRef.current?.pause();
  }, [state]);

  return { pauseSelection, playSelection };
}

function createRecordingRangeControls(state: AudioRecordingState, limit = Infinity) {
  const selectRange = (range: { start: number; end: number }) => {
    state.setTrimStart(Math.min(range.start, limit));
    state.setTrimEnd(Math.min(range.end, limit));
  };
  const resolveDuration = (duration: number) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    duration = Math.min(duration, limit);
    state.setRecordedDuration(duration);
    state.setTrimEnd((end) => Math.min(end, duration));
    state.setTrimStart((start) => Math.min(start, Math.max(0, duration - 0.01)));
  };
  return { selectRange, resolveDuration };
}

function useRecordingCaptureControls(
  state: AudioRecordingState,
  refs: AudioRecordingRefs,
  resetSession: () => void,
  deviceId: string,
  errors: AudioRecordingErrors,
  timeline?: AudioRecordingTimeline
) {
  const resumingSessionRef = useRef<number | null>(null);
  const resumeAdmission = useRef(0);
  const clearTimer = useCallback(() => clearRecordingTimer(refs.timerRef), [refs.timerRef]);
  const stopStream = useCallback(() => stopRecordingStream(refs.streamRef), [refs.streamRef]);

  const startRecording = useCallback(async () => {
    const mimeType = resolveRecordingMimeType();
    if (mimeType === null) {
      state.setError(errors.noSupport);
      return;
    }

    resetSession();
    await beginRecordingSession({
      deviceId,
      errors,
      timeline,
      clearTimer,
      mimeType,
      refs,
      resetSession,
      state,
      stopStream,
    });
  }, [clearTimer, refs, resetSession, state, stopStream, deviceId, errors, timeline]);

  const stopRecording = useCallback(() => {
    const recorder = refs.mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return;
    }

    recorder.stop();
  }, [refs.mediaRecorderRef]);

  const pauseRecording = useCallback(() => {
    resumeAdmission.current += 1;
    const recorder = refs.mediaRecorderRef.current;
    const clock = refs.clockRef.current;
    if (!recorder || recorder.state !== 'recording' || !clock) return;
    recorder.pause();
    clock.pausedAt = performance.now();
    state.setDurationSeconds(recordingElapsed(refs));
    state.setStatus('paused');
    timeline?.onPause?.();
  }, [refs, state, timeline]);

  const resumeRecording = useCallback(async () => {
    const recorder = refs.mediaRecorderRef.current;
    const clock = refs.clockRef.current;
    const sessionId = refs.sessionRef.current;
    if (
      !recorder ||
      recorder.state !== 'paused' ||
      !clock ||
      resumingSessionRef.current === sessionId
    )
      return;
    resumingSessionRef.current = sessionId;
    const admission = resumeAdmission.current;
    try {
      await timeline?.onResume?.();
      if (sessionId === refs.sessionRef.current && admission !== resumeAdmission.current) {
        if (recorder.state === 'paused') timeline?.onPause?.();
        return;
      }
      if (sessionId !== refs.sessionRef.current || recorder.state !== 'paused') {
        return;
      }
      clock.pausedTotal += performance.now() - (clock.pausedAt ?? performance.now());
      clock.pausedAt = null;
      recorder.resume();
      state.setStatus('recording');
      state.setError(null);
    } catch {
      if (sessionId === refs.sessionRef.current) state.setError(errors.playFailed);
    } finally {
      if (resumingSessionRef.current === sessionId) resumingSessionRef.current = null;
    }
  }, [refs, state, timeline, errors.playFailed]);

  return { startRecording, stopRecording, pauseRecording, resumeRecording };
}

export function useAudioRecordingSession(
  isOpen: boolean,
  errors: AudioRecordingErrors,
  deviceId = '',
  timeline?: AudioRecordingTimeline
): AudioRecordingControllerState {
  const state = useAudioRecordingState();
  const refs = useAudioRecordingRefs();
  const meter = useRecordingLevelSession(state.status, refs.streamRef);
  const resetSession = useRecordingReset(state, refs);
  useRecordingLifecycle(isOpen, resetSession, state);
  const playbackControls = useRecordingPlaybackControls(state, errors);
  const rangeControls = createRecordingRangeControls(state, timeline?.duration);
  const captureControls = useRecordingCaptureControls(
    state,
    refs,
    resetSession,
    deviceId,
    errors,
    timeline
  );
  const recordedDuration = Math.max(0, state.recordedDuration || state.durationSeconds);

  return {
    meter,
    save: {
      audioBlob: state.audioBlob,
      resetSession,
      trimEnd: state.trimEnd,
      trimStart: state.trimStart,
    },
    transport: {
      elapsedSeconds: state.durationSeconds,
      durationLabel: formatDurationLabel(state.durationSeconds),
      error: state.error,
      startRecording: captureControls.startRecording,
      pauseRecording: captureControls.pauseRecording,
      resumeRecording: captureControls.resumeRecording,
      status: state.status,
      stopRecording: captureControls.stopRecording,
    },
    trim:
      state.audioUrl && state.audioBlob
        ? {
            audioRef: state.audioRef,
            audioUrl: state.audioUrl,
            audioBlob: state.audioBlob,
            resolveDuration: rangeControls.resolveDuration,
            selectRange: rangeControls.selectRange,
            isPlayingSelection: state.isPlayingSelection,
            pauseSelection: playbackControls.pauseSelection,
            playSelection: playbackControls.playSelection,
            recordedDuration,
            trimEnd: state.trimEnd,
            trimStart: state.trimStart,
          }
        : null,
  };
}
