import type { VideoRecordingSettings } from '@sniptale/runtime-contracts/video/types/types';
import { acquireCameraSource, type CameraSourceLease } from './session';

export type CameraSourcePeerAnswer = {
  sdp: string;
  type: 'answer';
};

type PeerRecord = {
  cancelNegotiation: ((error: Error) => void) | null;
  connection: CameraPeerConnection;
  connectionListener: () => void;
  disconnectedTimer: ReturnType<typeof setTimeout> | null;
  establishmentTimer: ReturnType<typeof setTimeout> | null;
  lease: CameraSourceLease;
};

type CameraPeerConnection = Pick<
  RTCPeerConnection,
  | 'addEventListener'
  | 'addTrack'
  | 'close'
  | 'createAnswer'
  | 'connectionState'
  | 'iceGatheringState'
  | 'localDescription'
  | 'removeEventListener'
  | 'setLocalDescription'
  | 'setRemoteDescription'
>;

const PEER_ESTABLISHMENT_TIMEOUT_MS = 30_000;
const PEER_DISCONNECTED_TIMEOUT_MS = 10_000;

type CameraSourcePeerDependencies = {
  acquireSource: (settings: VideoRecordingSettings) => Promise<CameraSourceLease>;
  createConnection: () => CameraPeerConnection;
};

function waitForIceGathering(record: PeerRecord): Promise<void> {
  if (record.connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const handleStateChange = () => {
      if (record.connection.iceGatheringState !== 'complete') return;
      record.connection.removeEventListener('icegatheringstatechange', handleStateChange);
      record.cancelNegotiation = null;
      resolve();
    };
    record.cancelNegotiation = (error) => {
      record.connection.removeEventListener('icegatheringstatechange', handleStateChange);
      record.cancelNegotiation = null;
      reject(error);
    };
    record.connection.addEventListener('icegatheringstatechange', handleStateChange);
  });
}

function requireAnswer(description: RTCSessionDescription | null): CameraSourcePeerAnswer {
  if (description?.type !== 'answer' || typeof description.sdp !== 'string') {
    throw new Error('Camera source peer did not produce an SDP answer.');
  }
  return { sdp: description.sdp, type: 'answer' };
}

export function createCameraSourcePeerOwner(deps: CameraSourcePeerDependencies) {
  const peers = new Map<string, PeerRecord>();

  const close = (peerId: string): void => {
    const record = peers.get(peerId);
    if (!record) return;
    peers.delete(peerId);
    if (record.establishmentTimer !== null) clearTimeout(record.establishmentTimer);
    if (record.disconnectedTimer !== null) clearTimeout(record.disconnectedTimer);
    record.connection.removeEventListener('connectionstatechange', record.connectionListener);
    record.cancelNegotiation?.(
      new Error(`Camera source peer ${peerId} was closed during negotiation.`)
    );
    record.connection.close();
    record.lease.release();
  };

  const watchConnection = (peerId: string, record: PeerRecord): void => {
    const handleState = () => {
      if (record.connection.connectionState === 'connected') {
        if (record.establishmentTimer !== null) clearTimeout(record.establishmentTimer);
        record.establishmentTimer = null;
        if (record.disconnectedTimer !== null) clearTimeout(record.disconnectedTimer);
        record.disconnectedTimer = null;
        return;
      }
      if (
        record.connection.connectionState === 'failed' ||
        record.connection.connectionState === 'closed'
      ) {
        close(peerId);
        return;
      }
      if (record.connection.connectionState !== 'disconnected') {
        if (record.disconnectedTimer !== null) clearTimeout(record.disconnectedTimer);
        record.disconnectedTimer = null;
        return;
      }
      if (record.disconnectedTimer === null) {
        record.disconnectedTimer = setTimeout(() => close(peerId), PEER_DISCONNECTED_TIMEOUT_MS);
      }
    };
    record.connectionListener = handleState;
    record.connection.addEventListener('connectionstatechange', handleState);
    record.establishmentTimer = setTimeout(() => {
      if (record.connection.connectionState !== 'connected') close(peerId);
    }, PEER_ESTABLISHMENT_TIMEOUT_MS);
  };

  return {
    async answerOffer(params: {
      offer: RTCSessionDescriptionInit;
      peerId: string;
      settings: VideoRecordingSettings;
    }): Promise<CameraSourcePeerAnswer> {
      if (peers.has(params.peerId)) {
        throw new Error(`Camera source peer ${params.peerId} is already active.`);
      }
      const lease = await deps.acquireSource(params.settings);
      let connection: CameraPeerConnection;
      try {
        connection = deps.createConnection();
      } catch (error) {
        lease.release();
        throw error;
      }
      const record: PeerRecord = {
        cancelNegotiation: null,
        connection,
        connectionListener: () => undefined,
        disconnectedTimer: null,
        establishmentTimer: null,
        lease,
      };
      peers.set(params.peerId, record);
      watchConnection(params.peerId, record);
      try {
        lease.stream.getTracks().forEach((track) => connection.addTrack(track, lease.stream));
        await connection.setRemoteDescription(params.offer);
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await waitForIceGathering(record);
        if (peers.get(params.peerId) !== record) {
          throw new Error(`Camera source peer ${params.peerId} was closed during negotiation.`);
        }
        return requireAnswer(connection.localDescription);
      } catch (error) {
        if (peers.get(params.peerId) === record) close(params.peerId);
        throw error;
      }
    },

    close,

    closeAll(): void {
      [...peers.keys()].forEach(close);
    },

    has(peerId: string): boolean {
      return peers.has(peerId);
    },
  };
}

const cameraSourcePeerOwner = createCameraSourcePeerOwner({
  acquireSource: acquireCameraSource,
  createConnection: () => new RTCPeerConnection(),
});

export const answerCameraSourceOffer = cameraSourcePeerOwner.answerOffer;
export const closeCameraSourcePeer = cameraSourcePeerOwner.close;
