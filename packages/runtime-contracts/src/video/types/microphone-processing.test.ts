import { expect, it } from 'vitest';
import {
  buildMicrophoneAudioConstraints,
  getMicrophoneConstraintStatus,
  resolveMicrophoneGain,
} from './microphone-processing';

it('builds microphone constraints from recording settings', () => {
  expect(
    buildMicrophoneAudioConstraints({
      autoGainControl: false,
      echoCancellation: false,
      microphoneDeviceId: 'mic-1',
      noiseSuppression: true,
    })
  ).toEqual({
    autoGainControl: false,
    deviceId: { exact: 'mic-1' },
    echoCancellation: false,
    noiseSuppression: true,
    sampleRate: 48000,
  });
});

it('clamps software microphone gain', () => {
  expect(resolveMicrophoneGain({ microphoneGain: -1 })).toBe(0);
  expect(resolveMicrophoneGain({ microphoneGain: 1.25 })).toBe(1.25);
  expect(resolveMicrophoneGain({ microphoneGain: 3 })).toBe(2);
  expect(resolveMicrophoneGain({})).toBe(1);
});

it('reports capability and browser confirmation statuses', () => {
  expect(
    getMicrophoneConstraintStatus({
      capabilities: { echoCancellation: [false] } as MediaTrackCapabilities,
      desired: true,
      key: 'echoCancellation',
      settings: {},
    })
  ).toBe('unsupported');
  expect(
    getMicrophoneConstraintStatus({
      capabilities: { noiseSuppression: [true, false] } as MediaTrackCapabilities,
      desired: false,
      key: 'noiseSuppression',
      settings: { noiseSuppression: true },
    })
  ).toBe('not-confirmed');
  expect(
    getMicrophoneConstraintStatus({
      capabilities: null,
      desired: true,
      key: 'autoGainControl',
      settings: { autoGainControl: true },
    })
  ).toBe('applied');
});
