import type React from 'react';
import type { AudioRecordingStatus, AudioRecordingModalProps } from './shared';
import type { VideoEditorMaterialSourceRange } from '../../contracts/insertion';

export interface AudioRecordingState {
  audioBlob: Blob | null;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioUrl: string | null;
  durationSeconds: number;
  error: string | null;
  isPlayingSelection: boolean;
  recordedDuration: number;
  setAudioBlob: React.Dispatch<React.SetStateAction<Blob | null>>;
  setAudioUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setDurationSeconds: React.Dispatch<React.SetStateAction<number>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsPlayingSelection: React.Dispatch<React.SetStateAction<boolean>>;
  setRecordedDuration: React.Dispatch<React.SetStateAction<number>>;
  setStatus: React.Dispatch<React.SetStateAction<AudioRecordingStatus>>;
  setTrimEnd: React.Dispatch<React.SetStateAction<number>>;
  setTrimStart: React.Dispatch<React.SetStateAction<number>>;
  status: AudioRecordingStatus;
  trimEnd: number;
  trimStart: number;
}

export interface AudioRecordingRefs {
  chunksRef: React.MutableRefObject<Blob[]>;
  mediaRecorderRef: React.MutableRefObject<MediaRecorder | null>;
  sessionRef: React.MutableRefObject<number>;
  streamRef: React.MutableRefObject<MediaStream | null>;
  timerRef: React.MutableRefObject<number | null>;
}

interface AudioRecordingSaveController {
  audioBlob: Blob | null;
  resetSession: () => void;
  trimEnd: number;
  trimStart: number;
}

interface AudioRecordingTransportController {
  elapsedSeconds: number;
  durationLabel: string;
  error: string | null;
  startRecording: () => Promise<void>;
  status: AudioRecordingStatus;
  stopRecording: () => void;
}

export interface AudioRecordingTrimController {
  audioBlob: Blob;
  resolveDuration: (duration: number) => void;
  selectRange: (range: VideoEditorMaterialSourceRange) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioUrl: string;
  isPlayingSelection: boolean;
  pauseSelection: () => void;
  playSelection: () => Promise<void>;
  recordedDuration: number;
  trimEnd: number;
  trimStart: number;
}

export interface AudioRecordingControllerState {
  save: AudioRecordingSaveController;
  transport: AudioRecordingTransportController;
  trim: AudioRecordingTrimController | null;
}

export interface RecordingSessionArgs {
  deviceId?: string;
  timeline?: AudioRecordingModalProps['timeline'];
  clearTimer: () => void;
  mimeType: string;
  refs: AudioRecordingRefs;
  resetSession: () => void;
  state: AudioRecordingState;
  stopStream: () => void;
}
