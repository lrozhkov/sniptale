import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../routing-contracts/runtime-messaging/mock';
import {
  disableViewportCursorProjection,
  enableViewportCursorProjection,
  retireViewportCursorProjectionAuthority,
} from './cursor-projection';

const sendTabMessage = vi.fn();
const authority = { generation: 4, recordingId: 'recording-1' };

beforeEach(() => {
  vi.clearAllMocks();
  sendTabMessage.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendTabMessage });
});

it('requires typed acknowledgements for viewport cursor projection lifecycle messages', async () => {
  await enableViewportCursorProjection(7, authority);
  await disableViewportCursorProjection(7, authority);

  expect(sendTabMessage).toHaveBeenNthCalledWith(1, 7, {
    ...authority,
    type: VideoMessageType.ENABLE_VIEWPORT_CURSOR_PROJECTION,
  });
  expect(sendTabMessage).toHaveBeenNthCalledWith(2, 7, {
    ...authority,
    type: VideoMessageType.DISABLE_VIEWPORT_CURSOR_PROJECTION,
  });
});

it('rejects missing and explicit failure acknowledgements', async () => {
  sendTabMessage.mockResolvedValueOnce({ success: false, error: 'projection unavailable' });
  await expect(
    enableViewportCursorProjection(8, { generation: 1, recordingId: 'recording-2' })
  ).rejects.toThrow('projection unavailable');

  sendTabMessage.mockResolvedValueOnce(undefined);
  await expect(
    disableViewportCursorProjection(8, { generation: 1, recordingId: 'recording-2' })
  ).rejects.toThrow('Viewport cursor projection could not be disabled');
});

it('serializes terminal disable after an in-flight enable on the same tab', async () => {
  let acknowledgeEnable!: (response: { success: true }) => void;
  sendTabMessage
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledgeEnable = resolve;
        })
    )
    .mockResolvedValueOnce({ success: true });

  const enable = enableViewportCursorProjection(9, {
    generation: 1,
    recordingId: 'recording-race',
  });
  await vi.waitFor(() => expect(sendTabMessage).toHaveBeenCalledOnce());
  const disable = disableViewportCursorProjection(9, {
    generation: 1,
    recordingId: 'recording-race',
  });
  await Promise.resolve();

  expect(sendTabMessage).toHaveBeenCalledOnce();
  acknowledgeEnable({ success: true });
  await Promise.all([enable, disable]);
  expect(sendTabMessage).toHaveBeenNthCalledWith(
    2,
    9,
    expect.objectContaining({ type: VideoMessageType.DISABLE_VIEWPORT_CURSOR_PROJECTION })
  );
});

it('rejects a late enable after the same projection authority was retired', async () => {
  const retiredAuthority = { generation: 1, recordingId: 'recording-retired' };

  await disableViewportCursorProjection(10, retiredAuthority);

  await expect(enableViewportCursorProjection(10, retiredAuthority)).rejects.toThrow('retired');
  expect(sendTabMessage).toHaveBeenCalledOnce();
});

it('can install the terminal fence before page access is awaited', async () => {
  const retiredAuthority = { generation: 1, recordingId: 'recording-page-access' };

  retireViewportCursorProjectionAuthority(11, retiredAuthority);

  await expect(enableViewportCursorProjection(11, retiredAuthority)).rejects.toThrow('retired');
  expect(sendTabMessage).not.toHaveBeenCalled();
});
