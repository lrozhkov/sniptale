import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoOffscreenControlMessageContracts } from './control';

const readyContract =
  runtimeVideoOffscreenControlMessageContracts[VideoMessageType.OFFSCREEN_READY];

it('requires the startup id on offscreen ready messages', () => {
  expect(
    readyContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_READY,
      offscreenStartupId: 'startup-1',
    })
  ).toEqual({
    type: VideoMessageType.OFFSCREEN_READY,
    offscreenStartupId: 'startup-1',
  });

  expect(() =>
    readyContract.parseRequest({
      type: VideoMessageType.OFFSCREEN_READY,
    })
  ).toThrow(/OFFSCREEN_READY/);
});

it('requires offscreen capability for live recording settings updates', () => {
  const contract =
    runtimeVideoOffscreenControlMessageContracts[VideoMessageType.OFFSCREEN_UPDATE_SETTINGS];

  expect(
    contract.parseRequest({
      type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
      capabilityToken: 'capability-token-1',
      recordingId: 'recording-1',
      generation: 2,
      streamInstanceId: 'stream-instance-1',
      settings: { microphoneEnabled: false },
    })
  ).toEqual({
    type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
    capabilityToken: 'capability-token-1',
    recordingId: 'recording-1',
    generation: 2,
    streamInstanceId: 'stream-instance-1',
    settings: { microphoneEnabled: false },
  });

  expect(() =>
    contract.parseRequest({
      type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
      settings: { webcamEnabled: false },
    })
  ).toThrow(/OFFSCREEN_UPDATE_SETTINGS/);
});

it('requires a complete recording source binding for pause and resume', () => {
  for (const type of [
    VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
    VideoMessageType.OFFSCREEN_RESUME_RECORDING,
  ] as const) {
    const contract = runtimeVideoOffscreenControlMessageContracts[type];
    const unbound = { type, capabilityToken: 'capability-token-1' };
    const bound = {
      ...unbound,
      recordingId: 'recording-1',
      generation: 2,
      streamInstanceId: 'stream-instance-1',
    };

    expect(() => contract.parseRequest(unbound)).toThrow(new RegExp(type));
    expect(contract.parseRequest(bound)).toEqual(bound);
    expect(() => contract.parseRequest({ ...unbound, recordingId: 'recording-1' })).toThrow(
      new RegExp(type)
    );
    expect(() =>
      contract.parseRequest({ ...unbound, generation: 2, streamInstanceId: 'stream-instance-1' })
    ).toThrow(new RegExp(type));
  }
});

it('requires a complete source binding for every offscreen stop', () => {
  const contract =
    runtimeVideoOffscreenControlMessageContracts[VideoMessageType.OFFSCREEN_STOP_RECORDING];
  const bound = {
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
    capabilityToken: 'capability-token-1',
    discard: true,
    recordingId: 'recording-1',
    generation: 2,
    streamInstanceId: 'stream-instance-1',
  };

  expect(contract.parseRequest(bound)).toEqual(bound);
  for (const invalid of [
    { type: bound.type, capabilityToken: bound.capabilityToken, discard: true },
    { ...bound, recordingId: undefined },
    { ...bound, generation: undefined },
    { ...bound, streamInstanceId: undefined },
  ]) {
    expect(() => contract.parseRequest(invalid)).toThrow(/OFFSCREEN_STOP_RECORDING/);
  }
});
