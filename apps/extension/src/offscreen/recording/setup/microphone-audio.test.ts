import { afterEach, expect, it, vi } from 'vitest';
import { recordingContext } from '../context';
import { attachMicrophoneAudioIfEnabled } from './video';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { AudioMixerGraph } from '../stream/audio-mixer-graph';
import {
  createAudioStream,
  createStream,
  TestMediaStream,
} from '../multi-source/media-stream.test-support';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  recordingContext.videoStream = null;
  recordingContext.audioMixer = null;
});

it('observes the acquired direct microphone input without another device request', async () => {
  const microphone = createAudioStream();
  const mixed = createAudioStream();
  vi.spyOn(AudioMixerGraph.prototype, 'initialize').mockResolvedValue(undefined);
  vi.spyOn(AudioMixerGraph.prototype, 'getMixedStream').mockReturnValue(mixed);
  vi.spyOn(AudioMixerGraph.prototype, 'connectMicrophoneStream').mockImplementation(
    () => undefined
  );
  vi.spyOn(AudioMixerGraph.prototype, 'disconnectMicrophoneStream').mockImplementation(
    () => undefined
  );
  const gain = vi
    .spyOn(AudioMixerGraph.prototype, 'setMicrophoneGain')
    .mockImplementation(() => undefined);
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
  expect(recordingContext.videoStream.getAudioTracks()).toEqual(mixed.getAudioTracks());
  recordingContext.audioMixer!.setMicrophoneGain(1.5);
  expect(gain).toHaveBeenCalledExactlyOnceWith(1.5);
  expect(observe).toHaveBeenLastCalledWith(microphone, 1.5);
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(microphone.getAudioTracks()[0]?.stop).not.toHaveBeenCalled();
});
