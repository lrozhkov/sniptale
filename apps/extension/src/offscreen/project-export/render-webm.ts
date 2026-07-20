import { scaleBitrate } from './codecs';
import { setupExportAudio } from './media';
import { type LoadedImagesMap } from './renderer';
import { runCompositeRenderLoop } from './render-loop';
import { getSupportedWebmExportMimeType } from './runtime';
import type { VideoProject, VideoProjectExportSettings } from '../../features/video/project/types';
import { translate } from '../../platform/i18n';
import { type ExportJobState } from './types';

export async function renderCompositeToWebm(
  job: ExportJobState,
  project: VideoProject,
  settings: VideoProjectExportSettings,
  loadedImages: LoadedImagesMap,
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement
): Promise<Blob> {
  const preparedAudio = await setupExportAudio(
    project,
    settings,
    job,
    job.exportAbortController?.signal
  );
  let stream: MediaStream | null = null;
  let capturedTracks: MediaStreamTrack[] = [];

  try {
    const canvasStream = canvas.captureStream(settings.fps);
    capturedTracks = [...canvasStream.getVideoTracks(), ...preparedAudio.tracks];
    stream = new MediaStream(capturedTracks);
    job.exportStream = stream;
    const mimeType = getSupportedWebmExportMimeType();
    const recorder = createWebmRecorder(stream, settings, mimeType);
    job.mediaRecorder = recorder;
    const blobRecorder = createWebmBlobRecorder(recorder, mimeType, () => job.cancelled);
    return await runWebmRecording({
      blobRecorder,
      context,
      job,
      loadedImages,
      preparedAudio,
      project,
      recorder,
      settings,
    });
  } finally {
    preparedAudio.dispose();
    (stream?.getTracks() ?? capturedTracks).forEach((track) => track.stop());
    job.exportStream = null;
  }
}

interface WebmRecordingInput {
  blobRecorder: ReturnType<typeof createWebmBlobRecorder>;
  context: CanvasRenderingContext2D;
  job: ExportJobState;
  loadedImages: LoadedImagesMap;
  preparedAudio: Awaited<ReturnType<typeof setupExportAudio>>;
  project: VideoProject;
  recorder: MediaRecorder;
  settings: VideoProjectExportSettings;
}

async function runWebmRecording(input: WebmRecordingInput): Promise<Blob> {
  const { blobRecorder, context, job, loadedImages, preparedAudio, project, recorder, settings } =
    input;
  recorder.start(1000);
  preparedAudio.start();
  try {
    await runCompositeRenderLoop(
      job,
      project,
      settings,
      context,
      loadedImages,
      job.exportAbortController?.signal
    );
    stopRecorderIfNeeded(recorder);
    return await blobRecorder.blobPromise;
  } catch (error) {
    stopRecorderIfNeeded(recorder);
    blobRecorder.rejectBlob(error);
    await blobRecorder.blobPromise.catch(() => undefined);
    throw error;
  } finally {
    job.mediaRecorder = null;
  }
}

function createWebmRecorder(
  stream: MediaStream,
  settings: VideoProjectExportSettings,
  mimeType: string
) {
  return new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: scaleBitrate(settings.quality, settings.width, settings.height),
  });
}

function createWebmBlobRecorder(
  recorder: MediaRecorder,
  mimeType: string,
  isCancelled: () => boolean
) {
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  let resolveBlob!: (blob: Blob) => void;
  let rejectBlob!: (reason?: unknown) => void;
  const blobPromise = new Promise<Blob>((resolve, reject) => {
    resolveBlob = resolve;
    rejectBlob = reject;
  });

  recorder.onerror = (event) => {
    rejectBlob(
      (event as ErrorEvent).error ?? new Error(translate('offscreenExport.webmRecorderError'))
    );
  };

  recorder.onstop = () => {
    if (isCancelled()) {
      rejectBlob(new Error('PROJECT_EXPORT_CANCELLED'));
      return;
    }

    resolveBlob(new Blob(chunks, { type: mimeType }));
  };

  return { blobPromise, rejectBlob };
}

function stopRecorderIfNeeded(recorder: MediaRecorder) {
  if (recorder.state !== 'inactive') {
    recorder.stop();
  }
}
