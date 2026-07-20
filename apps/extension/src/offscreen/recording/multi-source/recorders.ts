import { RECORDING_EXPORT_FILENAME_PREFIX } from '@sniptale/ui/branding';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import {
  buildMicrophoneAudioConstraints,
  resolveMicrophoneGain,
} from '@sniptale/runtime-contracts/video/types/microphone-processing';
import { normalizeMultiSourceVideoStream } from './normalize';
import { getActiveMultiSourceSession, type MultiSourceRecorder } from './state';
import { buildVideoMediaRecorderOptions } from '../recorder-mime';

function getFilenameSuffix(sourceIndex: number): string {
  return `window-${sourceIndex + 1}`;
}

export function buildSourceFilename(sourceIndex: number, extension = 'webm'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `${RECORDING_EXPORT_FILENAME_PREFIX}-${timestamp}-${getFilenameSuffix(sourceIndex)}.${extension}`;
}

export function buildMicrophoneFilename(extension = 'webm'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `${RECORDING_EXPORT_FILENAME_PREFIX}-${timestamp}-microphone.${extension}`;
}

function buildRecorderConfig(settings: VideoRecordingSettings, stream: MediaStream) {
  if (stream.getVideoTracks().length === 0) {
    const audioMimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'video/webm';
    return {
      audioBitsPerSecond: 128000,
      mimeType: audioMimeType,
    };
  }

  return buildVideoMediaRecorderOptions(settings);
}

function createMediaRecorderSource(params: {
  baseRecordingId: string;
  label: string | null;
  release?: () => void;
  settings: VideoRecordingSettings;
  sourceIndex: number;
  stream: MediaStream;
  trackSettings?: MediaTrackSettings;
}): MultiSourceRecorder {
  const [videoTrack] = params.stream.getVideoTracks();
  const recorder = new MediaRecorder(
    params.stream,
    buildRecorderConfig(params.settings, params.stream)
  );
  const source: MultiSourceRecorder = {
    chunks: [],
    label: params.label,
    recorder,
    recordingId: `${params.baseRecordingId}-${getFilenameSuffix(params.sourceIndex)}`,
    ...(params.release ? { release: params.release } : {}),
    sourceIndex: params.sourceIndex,
    stream: params.stream,
    trackSettings: params.trackSettings ?? videoTrack?.getSettings() ?? {},
  };

  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      source.chunks.push(event.data);
    }
  };
  recorder.onerror = (event) => {
    getActiveMultiSourceSession()?.stopReject?.(
      (event as ErrorEvent).error ?? new Error('A multi-source recorder failed.')
    );
  };
  return source;
}

export function stopRecorderStreams(recorders: Array<MultiSourceRecorder | null>): void {
  recorders.forEach((source) => {
    source?.stream.getTracks().forEach((track) => track.stop());
    source?.release?.();
  });
}

async function createRecorder(params: {
  baseRecordingId: string;
  label: string | null;
  settings: VideoRecordingSettings;
  sourceIndex: number;
  stream: MediaStream;
}): Promise<MultiSourceRecorder> {
  if (params.stream.getVideoTracks().length === 0) {
    return createMediaRecorderSource(params);
  }

  const normalized = await normalizeMultiSourceVideoStream(params.stream, params.settings.quality);
  try {
    return createMediaRecorderSource({
      ...params,
      stream: normalized.stream,
      trackSettings: normalized.dimensions,
    });
  } catch (error) {
    normalized.stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

export async function createSourceRecorders(params: {
  baseRecordingId: string;
  settings: VideoRecordingSettings;
  sources: Array<{ label: string | null; stream: MediaStream }>;
}): Promise<MultiSourceRecorder[]> {
  const recorders: MultiSourceRecorder[] = [];

  try {
    for (const [sourceIndex, source] of params.sources.entries()) {
      recorders.push(
        await createRecorder({
          baseRecordingId: params.baseRecordingId,
          label: source.label,
          settings: params.settings,
          sourceIndex,
          stream: source.stream,
        })
      );
    }
    return recorders;
  } catch (error) {
    stopRecorderStreams(recorders);
    throw error;
  }
}

function createGainProcessedMicrophoneStream(params: {
  rawStream: MediaStream;
  settings: VideoRecordingSettings;
}): { release: () => void; stream: MediaStream } {
  const gain = resolveMicrophoneGain(params.settings);
  if (gain === 1) {
    return {
      release: () => undefined,
      stream: params.rawStream,
    };
  }

  const audioContext = new AudioContext();
  let source: MediaStreamAudioSourceNode | null = null;
  let gainNode: GainNode | null = null;
  try {
    source = audioContext.createMediaStreamSource(params.rawStream);
    gainNode = audioContext.createGain();
    const destination = audioContext.createMediaStreamDestination();
    gainNode.gain.value = gain;
    source.connect(gainNode);
    gainNode.connect(destination);

    return {
      release: () => {
        source?.disconnect();
        gainNode?.disconnect();
        params.rawStream.getTracks().forEach((track) => track.stop());
        void audioContext.close();
      },
      stream: destination.stream,
    };
  } catch (error) {
    source?.disconnect();
    gainNode?.disconnect();
    void audioContext.close();
    throw error;
  }
}

export async function createMicrophoneRecorder(
  recordingId: string,
  settings: VideoRecordingSettings
): Promise<MultiSourceRecorder | null> {
  if (!settings.microphoneEnabled) {
    return null;
  }

  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: buildMicrophoneAudioConstraints(settings),
  });
  let processed: { release: () => void; stream: MediaStream };
  try {
    processed = createGainProcessedMicrophoneStream({ rawStream, settings });
  } catch (error) {
    rawStream.getTracks().forEach((track) => track.stop());
    throw error;
  }
  try {
    return createMediaRecorderSource({
      baseRecordingId: recordingId,
      label: null,
      release: processed.release,
      settings,
      sourceIndex: 999,
      stream: processed.stream,
    });
  } catch (error) {
    processed.stream.getTracks().forEach((track) => track.stop());
    processed.release();
    throw error;
  }
}
