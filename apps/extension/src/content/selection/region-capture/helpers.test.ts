// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import {
  applyVideoTrackHints,
  applyViewportCrop,
  createViewportCropTarget,
  getRegionCaptureDisplayStream,
  resolveRegionCaptureStream,
} from './helpers';

function createDisplayStream(track: MediaStreamTrack): MediaStream {
  return {
    getAudioTracks: () => [{ kind: 'system-audio' } as MediaStreamTrack],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

function installRegionCaptureAudioHarness() {
  const mixedAudioTrack = { kind: 'mixed-audio' } as MediaStreamTrack;
  const videoTrack = { kind: 'video-track' } as MediaStreamTrack;
  const displayStream = createDisplayStream(videoTrack);
  const microphoneStream = { kind: 'microphone-stream' } as unknown as MediaStream;
  const createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
  const audioContext = {
    close: vi.fn().mockResolvedValue(undefined),
    createMediaStreamDestination: vi.fn(() => ({
      stream: {
        getAudioTracks: () => [mixedAudioTrack],
      },
    })),
    createMediaStreamSource,
  };

  installRegionCaptureMediaGlobals(audioContext, createMediaStreamSource);
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(microphoneStream),
    },
  });

  return {
    audioContext,
    createMediaStreamSource,
    displayStream,
    microphoneStream,
    mixedAudioTrack,
    videoTrack,
  };
}

function installRegionCaptureMediaGlobals(
  audioContext: {
    close: ReturnType<typeof vi.fn>;
    createMediaStreamDestination: ReturnType<typeof vi.fn>;
  },
  createMediaStreamSource: ReturnType<typeof vi.fn>
) {
  class FakeAudioContext {
    close = audioContext.close;
    createMediaStreamDestination = audioContext.createMediaStreamDestination;
    createMediaStreamSource = createMediaStreamSource;
  }

  class FakeMediaStream {
    constructor(private readonly tracks: MediaStreamTrack[]) {}

    getAudioTracks() {
      return this.tracks.filter((track) => track.kind.includes('audio'));
    }

    getVideoTracks() {
      return this.tracks.filter((track) => track.kind === 'video-track');
    }
  }

  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('MediaStream', FakeMediaStream);
}

function createRegionCaptureSettings(
  props: Partial<{
    microphoneEnabled: boolean;
    systemAudioEnabled: boolean;
  }> = {}
) {
  return {
    microphoneEnabled: true,
    quality: VideoQuality.MEDIUM,
    systemAudioEnabled: true,
    ...props,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {},
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('returns null when produceCropTarget is unavailable', async () => {
  const mediaDevices = navigator.mediaDevices as MediaDevices & { produceCropTarget?: unknown };
  const originalProduceCropTarget = mediaDevices.produceCropTarget;
  delete mediaDevices.produceCropTarget;

  await expect(createViewportCropTarget(() => document.createElement('div'))()).resolves.toBeNull();

  if (originalProduceCropTarget !== undefined) {
    mediaDevices.produceCropTarget = originalProduceCropTarget;
  }
});

it('resolves the native crop target when the browser API is available', async () => {
  const mediaDevices = navigator.mediaDevices as MediaDevices & {
    produceCropTarget?: (element: HTMLElement) => Promise<object>;
  };
  const marker = document.createElement('div');
  const cropTarget = { kind: 'crop-target' };
  mediaDevices.produceCropTarget = vi.fn().mockResolvedValue(cropTarget);

  await expect(createViewportCropTarget(() => marker)()).resolves.toBe(cropTarget);
  expect(mediaDevices.produceCropTarget).toHaveBeenCalledWith(marker);
});

it('falls back to null when produceCropTarget rejects', async () => {
  const mediaDevices = navigator.mediaDevices as MediaDevices & {
    produceCropTarget?: (element: HTMLElement) => Promise<object>;
  };
  mediaDevices.produceCropTarget = vi.fn().mockRejectedValue(new Error('crop target failed'));

  await expect(createViewportCropTarget(() => document.createElement('div'))()).resolves.toBeNull();
});

it('applies cropTo only when both the crop target and track method are present', async () => {
  const cropTo = vi.fn().mockResolvedValue(undefined);
  const videoTrack = { cropTo } as unknown as MediaStreamTrack;
  const cropTarget = { kind: 'crop-target' };

  await applyViewportCrop(videoTrack, cropTarget);
  expect(cropTo).toHaveBeenCalledWith(cropTarget);

  cropTo.mockClear();
  await applyViewportCrop(videoTrack, null);
  expect(cropTo).not.toHaveBeenCalled();
});

it('keeps full-tab capture when cropTo rejects', async () => {
  const videoTrack = {
    cropTo: vi.fn().mockRejectedValue(new Error('crop failed')),
  } as unknown as MediaStreamTrack;

  await expect(applyViewportCrop(videoTrack, { kind: 'crop-target' })).resolves.toBeUndefined();
});

it('requests display media with the canonical current-tab constraints', async () => {
  const getDisplayMedia = vi.fn().mockResolvedValue({ kind: 'display-stream' });
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: {
      getDisplayMedia,
    },
  });

  await getRegionCaptureDisplayStream(true);

  expect(getDisplayMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      audio: true,
      preferCurrentTab: true,
      surfaceSwitching: 'include',
      video: expect.objectContaining({
        displaySurface: 'browser',
      }),
    })
  );
});

it('applies the detail content hint when the video track supports it', () => {
  const videoTrack = {
    contentHint: '',
    getSettings: () => ({ frameRate: 30, height: 720, width: 1280 }),
  } as unknown as MediaStreamTrack;

  applyVideoTrackHints(videoTrack);

  expect((videoTrack as MediaStreamTrack & { contentHint: string }).contentHint).toBe('detail');
});

it('leaves tracks without contentHint support unchanged', () => {
  const videoTrack = {
    getSettings: () => ({ frameRate: 30, height: 720, width: 1280 }),
  } as unknown as MediaStreamTrack;

  expect(() => applyVideoTrackHints(videoTrack)).not.toThrow();
});

it('returns the display stream directly when microphone capture is disabled', async () => {
  const displayStream = {
    getAudioTracks: () => [],
    getVideoTracks: () => [{ kind: 'video-track' }],
  } as unknown as MediaStream;

  await expect(
    resolveRegionCaptureStream(
      createRegionCaptureSettings({ microphoneEnabled: false }),
      displayStream
    )
  ).resolves.toEqual({
    audioContext: null,
    finalStream: displayStream,
    micStream: null,
  });
});

it(
  'falls back to the display stream when the display stream has no video track ' +
    'after mic capture succeeds',
  async () => {
    const harness = installRegionCaptureAudioHarness();
    const displayStreamWithoutVideo = {
      getAudioTracks: harness.displayStream.getAudioTracks,
      getVideoTracks: () => [],
    } as unknown as MediaStream;

    const result = await resolveRegionCaptureStream(
      createRegionCaptureSettings(),
      displayStreamWithoutVideo
    );

    expect(result).toEqual({
      audioContext: null,
      finalStream: displayStreamWithoutVideo,
      micStream: null,
    });
    expect(harness.audioContext.close).toHaveBeenCalledOnce();
  }
);

it('returns mixed audio state when microphone capture succeeds', async () => {
  const harness = installRegionCaptureAudioHarness();

  const result = await resolveRegionCaptureStream(
    createRegionCaptureSettings(),
    harness.displayStream
  );

  expect(result.audioContext?.close).toBe(harness.audioContext.close);
  expect(result.micStream).toBe(harness.microphoneStream);
  expect(result.finalStream.getVideoTracks()).toEqual([harness.videoTrack]);
  expect(result.finalStream.getAudioTracks()).toEqual([harness.mixedAudioTrack]);
  expect(harness.createMediaStreamSource).toHaveBeenCalledTimes(2);
});

it('still mixes microphone audio when system audio is disabled on the settings seam', async () => {
  const harness = installRegionCaptureAudioHarness();

  const result = await resolveRegionCaptureStream(
    createRegionCaptureSettings({ systemAudioEnabled: false }),
    harness.displayStream
  );

  expect(result.micStream).toBe(harness.microphoneStream);
  expect(result.finalStream.getAudioTracks()).toEqual([harness.mixedAudioTrack]);
  expect(harness.createMediaStreamSource).toHaveBeenCalledTimes(1);
});

it('closes the temporary audio context when microphone mixing fails mid-setup', async () => {
  const harness = installRegionCaptureAudioHarness();
  harness.createMediaStreamSource.mockImplementation(() => {
    throw new Error('connect failed');
  });

  const result = await resolveRegionCaptureStream(
    createRegionCaptureSettings(),
    harness.displayStream
  );

  expect(result).toEqual({
    audioContext: null,
    finalStream: harness.displayStream,
    micStream: null,
  });
  expect(harness.audioContext.close).toHaveBeenCalledOnce();
});
