import { afterEach, expect, it, vi } from 'vitest';
import { recordingContext } from '../context';
import { attachMicrophoneAudioIfEnabled } from './video';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  createAudioStream,
  createStream,
  TestMediaStream,
} from '../multi-source/media-stream.test-support';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  recordingContext.videoStream = null;
});

it('observes the acquired direct microphone input without another device request', async () => {
  const microphone = createAudioStream();
  const observe = vi.fn();
  vi.spyOn(recordingContext, 'createMicrophoneObservationCallback').mockReturnValue(observe);
  const getUserMedia = vi.fn().mockResolvedValue(microphone);
  vi.stubGlobal('MediaStream', TestMediaStream);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  recordingContext.videoStream = createStream(1280, 720);

  await attachMicrophoneAudioIfEnabled({
    ...DEFAULT_VIDEO_SETTINGS,
    microphoneEnabled: true,
    microphoneGain: 1,
    systemAudioEnabled: false,
  });

  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(observe).toHaveBeenCalledWith(microphone, 1);
  expect(recordingContext.videoStream.getAudioTracks()).toEqual(microphone.getAudioTracks());
  expect(microphone.getAudioTracks()[0]?.stop).not.toHaveBeenCalled();
});
