import { RECORDING_EXPORT_FILENAME_PREFIX } from '@sniptale/ui/branding';
import {
  buildMicrophoneAudioConstraints,
  resolveMicrophoneGain,
} from '@sniptale/runtime-contracts/video/types/microphone-processing';
import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { createFixedVideoOutputStream } from '../stream/fixed-video-output';
import type { MultiSourceRecorder } from './state';
import {
  buildVideoMediaRecorderOptions,
  resolveVideoRecordingArtifact,
} from '../../../platform/media-utils/video-recording';
import type { RecordingStagingCoordinator } from '../../../composition/persistence/recordings/staging';
import { createRecordingArtifactSession } from '../encoding/artifact-session';

function getFilenameSuffix(sourceIndex: number): string {
  return `window-${sourceIndex + 1}`;
}

export function buildSourceFilename(sourceIndex: number, mimeType: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const { extension } = resolveVideoRecordingArtifact(mimeType);
  return `${RECORDING_EXPORT_FILENAME_PREFIX}-${timestamp}-${getFilenameSuffix(sourceIndex)}.${extension}`;
}

export function buildMicrophoneFilename(extension = 'webm'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `${RECORDING_EXPORT_FILENAME_PREFIX}-${timestamp}-microphone.${extension}`;
}

function buildRecorderConfig(
  settings: VideoRecordingSettings,
  stream: MediaStream,
  trackSettings?: MediaTrackSettings
): MediaRecorderOptions & { mimeType: string } {
  if (stream.getVideoTracks().length === 0) {
    const audioMimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'video/webm';
    return {
      audioBitsPerSecond: 128000,
      mimeType: audioMimeType,
    };
  }

  const config = buildVideoMediaRecorderOptions(settings, stream, trackSettings);
  if (!config.mimeType) {
    throw new Error('Video recorder MIME type is unavailable.');
  }
  return { ...config, mimeType: config.mimeType };
}

async function createMediaRecorderSource(params: {
  baseRecordingId: string;
  coordinator: RecordingStagingCoordinator;
  label: string | null;
  release?: () => void;
  settings: VideoRecordingSettings;
  sourceIndex: number;
  stream: MediaStream;
  trackSettings?: MediaTrackSettings;
}): Promise<MultiSourceRecorder> {
  const [videoTrack] = params.stream.getVideoTracks();
  const recorderOptions = buildRecorderConfig(params.settings, params.stream, params.trackSettings);
  const recordingId = `${params.baseRecordingId}-${getFilenameSuffix(params.sourceIndex)}`;
  const hasVideo = params.stream.getVideoTracks().length > 0;
  const artifact = hasVideo
    ? resolveVideoRecordingArtifact(recorderOptions.mimeType)
    : { extension: 'webm' as const, mimeType: recorderOptions.mimeType };
  const filename = hasVideo
    ? buildSourceFilename(params.sourceIndex, artifact.mimeType)
    : buildMicrophoneFilename(artifact.extension);
  const artifactSession = await createRecordingArtifactSession({
    artifactId: recordingId,
    coordinator: params.coordinator,
    filename,
    mimeType: artifact.mimeType,
    recorderOptions,
    stream: params.stream,
  });
  const recorder = artifactSession.recorder;
  const source: MultiSourceRecorder = {
    artifact: null,
    artifactSession,
    label: params.label,
    recorder,
    recordingId,
    ...(params.release ? { release: params.release } : {}),
    sourceIndex: params.sourceIndex,
    stream: params.stream,
    trackSettings: params.trackSettings ?? videoTrack?.getSettings() ?? {},
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
  coordinator: RecordingStagingCoordinator;
  label: string | null;
  settings: VideoRecordingSettings;
  sourceIndex: number;
  stream: MediaStream;
}): Promise<MultiSourceRecorder> {
  if (params.stream.getVideoTracks().length === 0) {
    throw new Error('Multi-source capture source is missing a video track.');
  }

  const normalized = await createFixedVideoOutputStream(params.stream, params.settings);
  try {
    return await createMediaRecorderSource({
      ...params,
      stream: normalized.stream,
      trackSettings: { ...normalized.dimensions, frameRate: normalized.frameRate },
    });
  } catch (error) {
    normalized.stream.getTracks().forEach((track) => track.stop());
    throw error;
  }
}

export async function createSourceRecorders(params: {
  baseRecordingId: string;
  coordinator: RecordingStagingCoordinator;
  settings: VideoRecordingSettings;
  sources: Array<{ label: string | null; stream: MediaStream }>;
}): Promise<MultiSourceRecorder[]> {
  const recorders: MultiSourceRecorder[] = [];

  try {
    for (const [sourceIndex, source] of params.sources.entries()) {
      recorders.push(
        await createRecorder({
          baseRecordingId: params.baseRecordingId,
          coordinator: params.coordinator,
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
  settings: VideoRecordingSettings,
  coordinator: RecordingStagingCoordinator
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
    return await createMediaRecorderSource({
      baseRecordingId: recordingId,
      coordinator,
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
