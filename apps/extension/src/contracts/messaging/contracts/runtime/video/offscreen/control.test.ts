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
      settings: { microphoneEnabled: false },
    })
  ).toEqual({
    type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
    capabilityToken: 'capability-token-1',
    settings: { microphoneEnabled: false },
  });

  expect(() =>
    contract.parseRequest({
      type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS,
      settings: { webcamEnabled: false },
    })
  ).toThrow(/OFFSCREEN_UPDATE_SETTINGS/);
});
