// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { RuntimeMessagingTransport } from '../../platform/runtime-messaging';
import { CameraPreview } from './camera-preview';

vi.mock('../../platform/i18n', () => ({ translate: (key: string) => key }));
vi.mock('../../features/video/recording/media-stream-video', () => ({
  MediaStreamVideo: () => <video />,
}));
const peers: PreviewPeer[] = [];
class PreviewPeer {
  iceGatheringState = 'complete';
  localDescription = { sdp: 'offer' };
  ontrack = null;
  onconnectionstatechange = null;
  addTransceiver = vi.fn();
  createOffer = vi.fn().mockResolvedValue({ sdp: 'offer', type: 'offer' });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
  close = vi.fn();
  constructor() {
    peers.push(this);
  }
}
beforeEach(() => {
  peers.length = 0;
  vi.stubGlobal('RTCPeerConnection', PreviewPeer);
});
it('negotiates a receiving preview without opening camera hardware and closes its peer on unmount', async () => {
  const hardware = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: hardware },
  });
  const sendRuntimeMessage = vi.fn().mockResolvedValue({ success: true, sdp: 'answer' });
  const messaging = { sendRuntimeMessage } as unknown as RuntimeMessagingTransport;
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <CameraPreview
        active
        capability={{ recordingId: 'rec', controlToken: 'token' }}
        messaging={messaging}
        webcamDeviceId="camera"
      />
    );
  });
  expect(peers[0]?.setRemoteDescription).toHaveBeenCalledWith({ sdp: 'answer', type: 'answer' });
  expect(hardware).not.toHaveBeenCalled();
  expect(sendRuntimeMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: VideoMessageType.COUNTDOWN_CAMERA_OFFER,
      recordingId: 'rec',
      controlToken: 'token',
    })
  );
  act(() => root.unmount());
  expect(peers[0]?.close).toHaveBeenCalledOnce();
  expect(sendRuntimeMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: VideoMessageType.COUNTDOWN_CAMERA_CLOSE })
  );
});
