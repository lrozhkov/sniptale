import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { beginRecordingSession } from './capture';
import { formatDurationLabel, resolveRecordingMimeType, type AudioRecordingStatus } from './shared';
import type {
  AudioRecordingControllerState,
  AudioRecordingRefs,
  AudioRecordingState,
} from './session-types';

function useEscapeClose(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}

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

    const handleTimeUpdate = () => {
      if (audio.currentTime < state.trimEnd - 0.02) {
        return;
      }

      audio.pause();
      state.setIsPlayingSelection(false);
    };
    const handlePause = () => state.setIsPlayingSelection(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('pause', handlePause);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('pause', handlePause);
    };
  }, [state]);
}

function useRecordingLifecycle(
  isOpen: boolean,
  onClose: () => void,
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
  useEscapeClose(isOpen, onClose);
  useTrimPlaybackLifecycle(state);
}

function useRecordingPlaybackControls(state: AudioRecordingState) {
  const playSelection = useCallback(async () => {
    const audio = state.audioRef.current;
    if (!audio || !state.audioUrl) {
      return;
    }

    audio.currentTime = state.trimStart;
    await audio.play();
    state.setIsPlayingSelection(true);
  }, [state]);

  const pauseSelection = useCallback(() => {
    state.audioRef.current?.pause();
  }, [state]);

  return { pauseSelection, playSelection };
}

function useRecordingCaptureControls(
  state: AudioRecordingState,
  refs: AudioRecordingRefs,
  resetSession: () => void
) {
  const clearTimer = useCallback(() => clearRecordingTimer(refs.timerRef), [refs.timerRef]);
  const stopStream = useCallback(() => stopRecordingStream(refs.streamRef), [refs.streamRef]);

  const startRecording = useCallback(async () => {
    const mimeType = resolveRecordingMimeType();
    if (mimeType === null) {
      state.setError(translate('videoEditor.app.recordAudioNoSupport'));
      return;
    }

    resetSession();
    await beginRecordingSession({
      clearTimer,
      mimeType,
      refs,
      resetSession,
      state,
      stopStream,
    });
  }, [clearTimer, refs, resetSession, state, stopStream]);

  const stopRecording = useCallback(() => {
    const recorder = refs.mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      return;
    }

    recorder.stop();
  }, [refs.mediaRecorderRef]);

  return { startRecording, stopRecording };
}

export function useAudioRecordingSession(
  isOpen: boolean,
  onClose: () => void
): AudioRecordingControllerState {
  const state = useAudioRecordingState();
  const refs = useAudioRecordingRefs();
  const resetSession = useRecordingReset(state, refs);
  useRecordingLifecycle(isOpen, onClose, resetSession, state);
  const playbackControls = useRecordingPlaybackControls(state);
  const captureControls = useRecordingCaptureControls(state, refs, resetSession);
  const recordedDuration = useMemo(
    () => Math.max(0, state.trimEnd || state.recordedDuration || state.durationSeconds),
    [state.durationSeconds, state.recordedDuration, state.trimEnd]
  );

  return {
    save: {
      audioBlob: state.audioBlob,
      resetSession,
      trimEnd: state.trimEnd,
      trimStart: state.trimStart,
    },
    transport: {
      durationLabel: formatDurationLabel(state.durationSeconds),
      error: state.error,
      startRecording: captureControls.startRecording,
      status: state.status,
      stopRecording: captureControls.stopRecording,
    },
    trim: state.audioUrl
      ? {
          audioRef: state.audioRef,
          audioUrl: state.audioUrl,
          isPlayingSelection: state.isPlayingSelection,
          pauseSelection: playbackControls.pauseSelection,
          playSelection: playbackControls.playSelection,
          recordedDuration,
          setTrimEnd: state.setTrimEnd,
          setTrimStart: state.setTrimStart,
          trimEnd: state.trimEnd,
          trimStart: state.trimStart,
        }
      : null,
  };
}
