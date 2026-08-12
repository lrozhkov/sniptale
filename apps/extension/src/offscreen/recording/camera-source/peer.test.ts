import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createTrackedStream } from '../multi-source/media-stream.test-support';
import { createCameraSourcePeerOwner } from './peer';

class TestPeerConnection extends EventTarget {
  connectionState: RTCPeerConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'complete';
  localDescription: RTCSessionDescription | null = {
    sdp: 'local-answer',
    toJSON: () => ({ sdp: 'local-answer', type: 'answer' }),
    type: 'answer',
  };
  addTrack = vi.fn();
  close = vi.fn();
  createAnswer = vi.fn().mockResolvedValue({ sdp: 'draft-answer', type: 'answer' });
  setLocalDescription = vi.fn().mockResolvedValue(undefined);
  setRemoteDescription = vi.fn().mockResolvedValue(undefined);
}

it('self-retires a peer that never establishes a connection', async () => {
  vi.useFakeTimers();
  const release = vi.fn();
  const connection = new TestPeerConnection();
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({
      release,
      stream: createTrackedStream(),
      trackSettings: {},
    }),
    createConnection: () => connection,
  });
  await owner.answerOffer({
    offer: { sdp: 'remote-offer', type: 'offer' },
    peerId: 'stale-offer',
    settings: DEFAULT_VIDEO_SETTINGS,
  });

  await vi.advanceTimersByTimeAsync(30_000);

  expect(owner.has('stale-offer')).toBe(false);
  expect(connection.close).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it('keeps a connected peer and retires it after a sustained disconnect', async () => {
  vi.useFakeTimers();
  const release = vi.fn();
  const connection = new TestPeerConnection();
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({
      release,
      stream: createTrackedStream(),
      trackSettings: {},
    }),
    createConnection: () => connection,
  });
  await owner.answerOffer({
    offer: { sdp: 'remote-offer', type: 'offer' },
    peerId: 'connected-peer',
    settings: DEFAULT_VIDEO_SETTINGS,
  });
  connection.connectionState = 'connected';
  connection.dispatchEvent(new Event('connectionstatechange'));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(owner.has('connected-peer')).toBe(true);

  connection.connectionState = 'disconnected';
  connection.dispatchEvent(new Event('connectionstatechange'));
  await vi.advanceTimersByTimeAsync(10_000);

  expect(owner.has('connected-peer')).toBe(false);
  expect(release).toHaveBeenCalledOnce();
  vi.useRealTimers();
});

it('cancels disconnect retirement when the peer begins reconnecting', async () => {
  vi.useFakeTimers();
  const release = vi.fn();
  const connection = new TestPeerConnection();
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({
      release,
      stream: createTrackedStream(),
      trackSettings: {},
    }),
    createConnection: () => connection,
  });
  await owner.answerOffer({
    offer: { sdp: 'remote-offer', type: 'offer' },
    peerId: 'recovering-peer',
    settings: DEFAULT_VIDEO_SETTINGS,
  });
  connection.connectionState = 'connected';
  connection.dispatchEvent(new Event('connectionstatechange'));
  connection.connectionState = 'disconnected';
  connection.dispatchEvent(new Event('connectionstatechange'));
  await vi.advanceTimersByTimeAsync(5_000);
  connection.connectionState = 'connecting';
  connection.dispatchEvent(new Event('connectionstatechange'));
  await vi.advanceTimersByTimeAsync(10_000);

  expect(owner.has('recovering-peer')).toBe(true);
  expect(release).not.toHaveBeenCalled();
  owner.close('recovering-peer');
  vi.useRealTimers();
});

it('retires a failed peer immediately', async () => {
  const release = vi.fn();
  const connection = new TestPeerConnection();
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({
      release,
      stream: createTrackedStream(),
      trackSettings: {},
    }),
    createConnection: () => connection,
  });
  await owner.answerOffer({
    offer: { sdp: 'remote-offer', type: 'offer' },
    peerId: 'failed-peer',
    settings: DEFAULT_VIDEO_SETTINGS,
  });

  connection.connectionState = 'failed';
  connection.dispatchEvent(new Event('connectionstatechange'));

  expect(owner.has('failed-peer')).toBe(false);
  expect(release).toHaveBeenCalledOnce();
});

it('answers a non-trickle offer with the leased stable camera track', async () => {
  const release = vi.fn();
  const stream = createTrackedStream();
  const connection = new TestPeerConnection();
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({ release, stream, trackSettings: {} }),
    createConnection: () => connection,
  });

  await expect(
    owner.answerOffer({
      offer: { sdp: 'remote-offer', type: 'offer' },
      peerId: 'document-1',
      settings: DEFAULT_VIDEO_SETTINGS,
    })
  ).resolves.toEqual({ sdp: 'local-answer', type: 'answer' });

  expect(connection.addTrack).toHaveBeenCalledWith(stream.track, stream);
  expect(connection.setRemoteDescription).toHaveBeenCalledWith({
    sdp: 'remote-offer',
    type: 'offer',
  });
  expect(owner.has('document-1')).toBe(true);
  owner.close('document-1');
  expect(connection.close).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});

it('rejects duplicate peer identities without acquiring another source lease', async () => {
  const acquireSource = vi.fn().mockResolvedValue({
    release: vi.fn(),
    stream: createTrackedStream(),
    trackSettings: {},
  });
  const owner = createCameraSourcePeerOwner({
    acquireSource,
    createConnection: () => new TestPeerConnection(),
  });
  const params = {
    offer: { sdp: 'offer', type: 'offer' as const },
    peerId: 'same-peer',
    settings: DEFAULT_VIDEO_SETTINGS,
  };

  await owner.answerOffer(params);
  await expect(owner.answerOffer(params)).rejects.toThrow('already active');
  expect(acquireSource).toHaveBeenCalledOnce();
  owner.closeAll();
});

it('closes the connection and releases the camera lease when negotiation fails', async () => {
  const release = vi.fn();
  const connection = new TestPeerConnection();
  connection.setRemoteDescription.mockRejectedValueOnce(new Error('invalid offer'));
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({
      release,
      stream: createTrackedStream(),
      trackSettings: {},
    }),
    createConnection: () => connection,
  });

  await expect(
    owner.answerOffer({
      offer: { sdp: 'bad', type: 'offer' },
      peerId: 'bad-peer',
      settings: DEFAULT_VIDEO_SETTINGS,
    })
  ).rejects.toThrow('invalid offer');
  expect(owner.has('bad-peer')).toBe(false);
  expect(connection.close).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});

it('rejects an in-flight negotiation when its document peer is closed', async () => {
  const release = vi.fn();
  const connection = new TestPeerConnection();
  connection.iceGatheringState = 'gathering';
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({
      release,
      stream: createTrackedStream(),
      trackSettings: {},
    }),
    createConnection: () => connection,
  });
  const negotiation = owner.answerOffer({
    offer: { sdp: 'offer', type: 'offer' },
    peerId: 'navigated-document',
    settings: DEFAULT_VIDEO_SETTINGS,
  });
  await vi.waitFor(() => expect(owner.has('navigated-document')).toBe(true));

  owner.close('navigated-document');

  await expect(negotiation).rejects.toThrow('closed during negotiation');
  expect(connection.close).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});

it('releases the lease when connection creation fails', async () => {
  const release = vi.fn();
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({
      release,
      stream: createTrackedStream(),
      trackSettings: {},
    }),
    createConnection: () => {
      throw new Error('peer unavailable');
    },
  });
  await expect(
    owner.answerOffer({
      offer: { type: 'offer', sdp: 'offer' },
      peerId: 'peer',
      settings: DEFAULT_VIDEO_SETTINGS,
    })
  ).rejects.toThrow('peer unavailable');
  expect(release).toHaveBeenCalledOnce();
  owner.close('missing-peer');
});

it('waits for ICE completion and rejects malformed local answers', async () => {
  const connection = new TestPeerConnection();
  connection.iceGatheringState = 'gathering';
  connection.localDescription = null;
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({
      release: vi.fn(),
      stream: createTrackedStream(),
      trackSettings: {},
    }),
    createConnection: () => connection,
  });
  const answer = owner.answerOffer({
    offer: { type: 'offer', sdp: 'offer' },
    peerId: 'gathering-peer',
    settings: DEFAULT_VIDEO_SETTINGS,
  });
  await vi.waitFor(() => expect(connection.addTrack).toHaveBeenCalled());
  connection.iceGatheringState = 'complete';
  connection.dispatchEvent(new Event('icegatheringstatechange'));
  await expect(answer).rejects.toThrow('did not produce an SDP answer');
});
