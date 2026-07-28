import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoOffscreenViewportMessageContracts } from './viewport';

it('carries the current viewport through source revalidation', () => {
  const contract =
    runtimeVideoOffscreenViewportMessageContracts[VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE];
  const message = {
    type: VideoMessageType.OFFSCREEN_REVALIDATE_SOURCE,
    capabilityToken: 'capability-1',
    generation: 1,
    recordingId: 'recording-1',
    streamInstanceId: 'stream-1',
    viewport: {
      devicePixelRatio: 2,
      height: 720,
      scrollX: 0,
      scrollY: 0,
      visualViewportScale: 1,
      width: 1280,
    },
  };

  expect(contract.parseRequest(message)).toEqual(message);
  expect(() =>
    contract.parseRequest({ ...message, viewport: { ...message.viewport, width: '1280' } })
  ).toThrow(/OFFSCREEN_REVALIDATE_SOURCE/);
});
