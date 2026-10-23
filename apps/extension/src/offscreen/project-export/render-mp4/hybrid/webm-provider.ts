import { hasCameraMediaAt } from '../../../../features/video/project/camera/animation';
import { prepareDecodedVideoSample } from '../../../../features/video/composition/draw/decoded-sample';
import { BlobSource, Input, VideoSampleSink, MP4, WEBM, type VideoSample } from 'mediabunny';

import type { VideoCompositionFrameSource } from '../../../../features/video/composition/draw/media-source';
import {
  getAssetById,
  getTrackClips,
  isClipActiveAtTime,
  isVideoClip,
} from '../../../../features/video/project/timeline/basics';
import { getMediaClipSourceTime } from '../../../../features/video/project/timeline/rate';
import {
  type VideoProject,
  type VideoProjectAsset,
  type VideoProjectVideoClip,
} from '../../../../features/video/project/types/model';
import { loadBlobForAsset } from '../../media';

interface FrameRequest {
  frameIndex: number;
  sourceTime: number;
}

interface PreparedWebmProviderFrame {
  clipId: string;
  release: () => void;
  source: VideoCompositionFrameSource;
}

export interface WebmFrameProvider {
  clipId: string;
  dispose: () => void;
  prepareFrame: (frameIndex: number) => Promise<PreparedWebmProviderFrame | null>;
}

function createSampleSource(
  sample: VideoSample,
  canvas: HTMLCanvasElement
): VideoCompositionFrameSource {
  // Upload normalized pixels once; motion-blur passes reuse this bounded raster.
  const rotated = sample.rotation % 180 !== 0;
  const width = rotated ? sample.codedHeight : sample.codedWidth;
  const height = rotated ? sample.codedWidth : sample.codedHeight;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
  if (!context) throw new Error('Decoded frame canvas is unavailable.');
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  sample.draw(context, 0, 0, width, height);
  return {
    sourceHeight: sample.displayHeight,
    sourceWidth: sample.displayWidth,
    draw: (target, x, y, drawWidth, drawHeight) => {
      target.drawImage(canvas, x, y, drawWidth, drawHeight);
    },
  };
}

async function createWebmVideoSampleSink(asset: VideoProjectAsset): Promise<{
  input: Input;
  sink: VideoSampleSink;
  timeResolution: number;
} | null> {
  const input = new Input({
    formats: [WEBM, MP4],
    source: new BlobSource(await loadBlobForAsset(asset)),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      throw new Error('WebM source has no video track.');
    }

    if (!(await track.canDecode())) {
      input.dispose();
      return null;
    }

    const config = await track.getDecoderConfig();
    // Native decoding can assume BT.709 for untagged VP8 instead of its BT.601 default.
    // Use the media-element fallback to retain the preview's color interpretation.
    if (config?.codec === 'vp8' && !config.colorSpace?.matrix) {
      input.dispose();
      return null;
    }

    return {
      input,
      sink: new VideoSampleSink(track),
      timeResolution: await track.getTimeResolution(),
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}

function createProviderFromSink(params: {
  clipId: string;
  input: Input;
  requests: FrameRequest[];
  sink: VideoSampleSink;
  signal: AbortSignal;
  timeResolution: number;
  sourceEnd: number;
}): WebmFrameProvider {
  const iterator = params.sink.samplesAtTimestamps(
    params.requests.map((request) =>
      Math.min(
        (Math.ceil(params.sourceEnd * params.timeResolution) - 1) / params.timeResolution,
        Math.round(request.sourceTime * params.timeResolution) / params.timeResolution
      )
    )
  );
  const raster = document.createElement('canvas');
  let requestIndex = 0;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    params.signal.removeEventListener('abort', dispose);
    params.input.dispose();
    raster.width = 0;
    raster.height = 0;
  };
  if (params.signal.aborted) dispose();
  else params.signal.addEventListener('abort', dispose, { once: true });
  return {
    clipId: params.clipId,
    dispose,
    prepareFrame: async (frameIndex) => {
      const request = params.requests[requestIndex];
      if (!request || request.frameIndex !== frameIndex) {
        return null;
      }

      params.signal.throwIfAborted();
      const result = await iterator.next();
      if (result.done || !result.value) {
        throw new Error('WebM frame provider missed a requested frame.');
      }

      requestIndex += 1;
      const sample = await prepareDecodedVideoSample(result.value, params.signal);
      try {
        params.signal.throwIfAborted();
        return {
          clipId: params.clipId,
          release: () => sample.close(),
          source: createSampleSource(sample, raster),
        };
      } catch (error) {
        sample.close();
        throw error;
      }
    },
  };
}

function getVisibleVideoClips(project: VideoProject) {
  const clips: VideoProjectVideoClip[] = [];
  for (const track of project.tracks) {
    if (track.visible) {
      for (const clip of getTrackClips(project, track.id)) {
        if (isVideoClip(clip)) {
          clips.push(clip);
        }
      }
    }
  }
  return clips;
}

function createClipFrameRequests(
  project: VideoProject,
  clip: VideoProjectVideoClip,
  projectTimes: number[]
) {
  const requests: FrameRequest[] = [];
  for (const [frameIndex, projectTime] of projectTimes.entries()) {
    if (isClipActiveAtTime(clip, projectTime) && hasCameraMediaAt(project, clip, projectTime)) {
      requests.push({ frameIndex, sourceTime: getMediaClipSourceTime(clip, projectTime) });
    }
  }
  return requests;
}

function disposeProviders(providers: WebmFrameProvider[]) {
  for (const provider of providers) {
    provider.dispose();
  }
}

export async function createWebmFrameProviders(
  project: VideoProject,
  projectTimes: number[],
  signal: AbortSignal = new AbortController().signal
): Promise<WebmFrameProvider[] | null> {
  const providers: WebmFrameProvider[] = [];
  try {
    for (const clip of getVisibleVideoClips(project)) {
      signal.throwIfAborted();
      const requests = createClipFrameRequests(project, clip, projectTimes);
      if (requests.length === 0) {
        continue;
      }

      const asset = getAssetById(project, clip.assetId);
      if (!asset) {
        disposeProviders(providers);
        return null;
      }

      const source = await createWebmVideoSampleSink(asset);
      if (!source) {
        disposeProviders(providers);
        return null;
      }

      providers.push(
        createProviderFromSink({
          clipId: clip.id,
          requests,
          signal,
          sourceEnd: Math.min(
            getMediaClipSourceTime(clip, clip.startTime + clip.duration),
            clip.cameraTiming ? (asset.metadata.duration ?? Infinity) : Infinity
          ),
          ...source,
        })
      );
    }
  } catch (error) {
    disposeProviders(providers);
    throw error;
  }

  return providers.length > 0 ? providers : null;
}

export async function prepareWebmProviderFrames(
  providers: WebmFrameProvider[],
  frameIndex: number
): Promise<PreparedWebmProviderFrame[]> {
  const frames: PreparedWebmProviderFrame[] = [];
  try {
    for (const provider of providers) {
      const frame = await provider.prepareFrame(frameIndex);
      if (frame) {
        frames.push(frame);
      }
    }
    return frames;
  } catch (error) {
    for (const frame of frames) {
      frame.release();
    }
    throw error;
  }
}
