import { expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { tabVideoControlledCursorContracts } from './controlled';

it('admits both block streams at capture start and preserves the modes at Stop', () => {
  const enable = {
    type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
    recordingId: 'recording',
    cursorTrajectoryMode: 'blocks',
    recordingEventsMode: 'blocks',
  };
  expect(
    tabVideoControlledCursorContracts[
      VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE
    ].parseRequest(enable)
  ).toEqual(enable);
  for (const boundaryReason of ['stop', 'observation']) {
    const disable = {
      type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE,
      cursorTrajectoryMode: 'blocks',
      recordingEventsMode: 'blocks',
      boundaryReason,
    };
    expect(
      tabVideoControlledCursorContracts[
        VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE
      ].parseRequest(disable)
    ).toEqual(disable);
  }
});

it.each([
  { cursorTrajectoryMode: 'inline' },
  { recordingEventsMode: 'inline' },
  { cursorTrajectoryMode: true },
  { recordingEventsMode: 1 },
])('refuses an unsupported capture mode at both lifecycle boundaries: %j', (patch) => {
  expect(() =>
    tabVideoControlledCursorContracts[
      VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE
    ].parseRequest({
      type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
      recordingId: 'recording',
      ...patch,
    })
  ).toThrow();
  expect(() =>
    tabVideoControlledCursorContracts[
      VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE
    ].parseRequest({ type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE, ...patch })
  ).toThrow();
});

it('refuses an unknown boundary without rejecting legacy requests with no mode', () => {
  const type = VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE;
  expect(tabVideoControlledCursorContracts[type].parseRequest({ type })).toEqual({ type });
  expect(() =>
    tabVideoControlledCursorContracts[type].parseRequest({ type, boundaryReason: 'discard' })
  ).toThrow();
});
