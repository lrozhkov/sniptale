import { BlobSource, Input, VideoSampleSink, WEBM, type VideoSample } from 'mediabunny';

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

function createSampleSource(sample: VideoSample): VideoCompositionFrameSource {
  return {
    sourceHeight: sample.displayHeight,
    sourceWidth: sample.displayWidth,
    draw: (context, drawX, drawY, drawWidth, drawHeight) => {
      sample.draw(context, drawX, drawY, drawWidth, drawHeight);
    },
  };
}

async function createWebmVideoSampleSink(asset: VideoProjectAsset): Promise<{
  input: Input;
  sink: VideoSampleSink;
} | null> {
  const input = new Input({
    formats: [WEBM],
    source: new BlobSource(await loadBlobForAsset(asset)),
  });
  const track = await input.getPrimaryVideoTrack();
  if (!track) {
    input.dispose();
    throw new Error('WebM source has no video track.');
  }

  if (!(await track.canDecode())) {
    input.dispose();
    return null;
  }

  return { input, sink: new VideoSampleSink(track) };
}

function createProviderFromSink(params: {
  clipId: string;
  input: Input;
  requests: FrameRequest[];
  sink: VideoSampleSink;
}): WebmFrameProvider {
  const iterator = params.sink.samplesAtTimestamps(
    params.requests.map((request) => request.sourceTime)
  );
  let requestIndex = 0;
  return {
    clipId: params.clipId,
    dispose: () => params.input.dispose(),
    prepareFrame: async (frameIndex) => {
      const request = params.requests[requestIndex];
      if (!request || request.frameIndex !== frameIndex) {
        return null;
      }

      const result = await iterator.next();
      if (result.done || !result.value) {
        throw new Error('WebM frame provider missed a requested frame.');
      }

      requestIndex += 1;
      const sample = result.value;
      return {
        clipId: params.clipId,
        release: () => sample.close(),
        source: createSampleSource(sample),
      };
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

function createClipFrameRequests(clip: VideoProjectVideoClip, projectTimes: number[]) {
  const requests: FrameRequest[] = [];
  for (const [frameIndex, projectTime] of projectTimes.entries()) {
    if (isClipActiveAtTime(clip, projectTime)) {
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
  projectTimes: number[]
): Promise<WebmFrameProvider[] | null> {
  const providers: WebmFrameProvider[] = [];
  try {
    for (const clip of getVisibleVideoClips(project)) {
      const requests = createClipFrameRequests(clip, projectTimes);
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

      providers.push(createProviderFromSink({ clipId: clip.id, requests, ...source }));
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
