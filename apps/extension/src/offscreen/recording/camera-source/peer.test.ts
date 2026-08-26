import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { createTrackedStream } from '../multi-source/media-stream.test-support';
import { createCameraSourcePeerOwner } from './peer';
import type { CameraSourceLease } from './session';

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

it('switches the stable camera source only for an active preview peer', async () => {
  const switchInput = vi.fn().mockResolvedValue(undefined);
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({
      release: vi.fn(),
      stream: createTrackedStream(),
      trackSettings: {},
    }),
    createConnection: () => new TestPeerConnection(),
    switchInput,
  });
  await owner.answerOffer({
    offer: { sdp: 'remote-offer', type: 'offer' },
    peerId: 'active-preview',
    settings: DEFAULT_VIDEO_SETTINGS,
  });

  await expect(owner.switchInput('active-preview', 'camera-2')).resolves.toBeUndefined();
  await expect(owner.switchInput('stale-preview', 'camera-3')).rejects.toThrow(
    'Camera source peer stale-preview is not active'
  );
  expect(switchInput).toHaveBeenCalledOnce();
  expect(switchInput).toHaveBeenCalledWith('camera-2');
  owner.closeAll();
});

it('accepts a source switch while the matching preview peer is still acquiring its lease', async () => {
  let resolveLease!: (lease: CameraSourceLease) => void;
  const leasePromise = new Promise<CameraSourceLease>((resolve) => {
    resolveLease = resolve;
  });
  const switchInput = vi.fn().mockResolvedValue(undefined);
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockReturnValue(leasePromise),
    createConnection: () => new TestPeerConnection(),
    switchInput,
  });
  const answer = owner.answerOffer({
    offer: { sdp: 'remote-offer', type: 'offer' },
    peerId: 'pending-preview',
    settings: DEFAULT_VIDEO_SETTINGS,
  });

  await expect(owner.switchInput('pending-preview', null)).resolves.toBeUndefined();
  expect(switchInput).toHaveBeenCalledWith(null);
  resolveLease({
    release: vi.fn(),
    sourceLabel: 'Desk camera',
    stream: createTrackedStream(),
    trackSettings: {},
  });
  await answer;
  owner.closeAll();
});

it('returns the available local answer when ICE gathering does not reach complete', async () => {
  vi.useFakeTimers();
  const connection = new TestPeerConnection();
  connection.iceGatheringState = 'gathering';
  const owner = createCameraSourcePeerOwner({
    acquireSource: vi.fn().mockResolvedValue({
      release: vi.fn(),
      stream: createTrackedStream(),
      trackSettings: {},
    }),
    createConnection: () => connection,
  });

  const answer = owner.answerOffer({
    offer: { sdp: 'remote-offer', type: 'offer' },
    peerId: 'slow-ice-peer',
    settings: DEFAULT_VIDEO_SETTINGS,
  });
  await vi.advanceTimersByTimeAsync(3_000);

  await expect(answer).resolves.toEqual({ sdp: 'local-answer', type: 'answer' });
  owner.close('slow-ice-peer');
  vi.useRealTimers();
});

it('atomically replaces a duplicate peer identity during document reconnect', async () => {
  const firstRelease = vi.fn();
  const secondRelease = vi.fn();
  const acquireSource = vi
    .fn()
    .mockResolvedValue({
      release: firstRelease,
      stream: createTrackedStream(),
      trackSettings: {},
    })
    .mockResolvedValueOnce({
      release: firstRelease,
      stream: createTrackedStream(),
      trackSettings: {},
    })
    .mockResolvedValueOnce({
      release: secondRelease,
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
  await expect(owner.answerOffer(params)).resolves.toEqual({
    sdp: 'local-answer',
    type: 'answer',
  });
  expect(acquireSource).toHaveBeenCalledTimes(2);
  expect(firstRelease).toHaveBeenCalledOnce();
  owner.closeAll();
  expect(secondRelease).toHaveBeenCalledOnce();
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
