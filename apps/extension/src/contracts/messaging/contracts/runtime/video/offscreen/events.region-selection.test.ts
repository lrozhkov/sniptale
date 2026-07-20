import { expect, it } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { runtimeVideoOffscreenEventMessageContracts } from './events';

const selectedContract =
  runtimeVideoOffscreenEventMessageContracts[VideoMessageType.REGION_SELECTED];
const cancelledContract =
  runtimeVideoOffscreenEventMessageContracts[VideoMessageType.REGION_SELECTION_CANCELLED];

const binding = {
  regionSelectionCapabilityToken: 'token-1',
  regionSelectionRequestGeneration: 'generation-1',
  regionSelectionRequestId: 'request-1',
};

it('requires request binding on region-selection runtime results', () => {
  expect(
    selectedContract.parseRequest({
      type: VideoMessageType.REGION_SELECTED,
      ...binding,
      region: { height: 20, width: 10, x: 1, y: 2 },
    })
  ).toEqual({
    type: VideoMessageType.REGION_SELECTED,
    ...binding,
    region: { height: 20, width: 10, x: 1, y: 2 },
  });

  expect(
    cancelledContract.parseRequest({
      type: VideoMessageType.REGION_SELECTION_CANCELLED,
      ...binding,
    })
  ).toEqual({ type: VideoMessageType.REGION_SELECTION_CANCELLED, ...binding });
  expect(() =>
    selectedContract.parseRequest({
      type: VideoMessageType.REGION_SELECTED,
      region: { height: 20, width: 10, x: 1, y: 2 },
    })
  ).toThrow(/REGION_SELECTED/);
  expect(() =>
    cancelledContract.parseRequest({ type: VideoMessageType.REGION_SELECTION_CANCELLED })
  ).toThrow(/REGION_SELECTION_CANCELLED/);
});
