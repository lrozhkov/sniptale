import { runtimeInfo } from '@sniptale/platform/browser/runtime';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  isRecordingMediaPermissionResult,
  type RecordingMediaPermissionBootstrap,
} from '@sniptale/runtime-contracts/video/types/messages.surface';
import { appendToContentOverlayRoot, resolveContentShadowRoot } from '../../../platform/dom-host';
import { getCurrentLocale, translate } from '../../../../platform/i18n';
import type { SurfaceIdentity } from '../transport/client';

type DeviceKind = 'audioinput' | 'videoinput';
type PermissionLease = { promise: Promise<void>; dispose: () => void; failed: boolean };

export class RecordingPermissionFrameError extends Error {
  constructor(
    message: string,
    readonly presented: boolean
  ) {
    super(message);
  }
}

export function createRecordingPermissionFrameOwner(
  dependencies = {
    mount: appendToContentOverlayRoot<HTMLIFrameElement>,
    createChannel: () => new MessageChannel(),
    url: () => runtimeInfo.getURL('apps/extension/src/media-permission/index.html'),
    origin: () => runtimeInfo.getURL(''),
  }
) {
  const leases = new Map<DeviceKind, PermissionLease>();

  const release = (kind?: DeviceKind) => {
    if (kind) {
      leases.get(kind)?.dispose();
      leases.delete(kind);
    } else {
      for (const lease of leases.values()) lease.dispose();
      leases.clear();
    }
  };

  const request = (identity: SurfaceIdentity, kind: DeviceKind): Promise<void> => {
    const existing = leases.get(kind);
    if (existing && !existing.failed) return existing.promise;
    if (existing) release(kind);
    const frame = document.createElement('iframe');
    const channel = dependencies.createChannel();
    const originUrl = new URL(dependencies.origin());
    const extensionOrigin = `${originUrl.protocol}//${originUrl.host}`;
    frame.src = dependencies.url();
    frame.allow = `camera ${extensionOrigin}; microphone ${extensionOrigin}`;
    frame.title = translate('content.toolbar.videoRecordingPermissionTitle');
    frame.dataset['ui'] = 'content.toolbar.video-recording.permission-frame';
    Object.assign(frame.style, {
      position: 'fixed',
      top: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: 'min(340px, calc(100vw - 32px))',
      height: '92px',
      border: '0',
      borderRadius: '12px',
      zIndex: '2147483647',
      pointerEvents: 'auto',
      visibility: 'hidden',
      boxShadow: '0 12px 40px #0003',
    });
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    let finished = false;
    const promise = new Promise<void>((accept, refuse) => {
      resolve = accept;
      reject = refuse;
    });
    const lease: PermissionLease = {
      promise,
      failed: false,
      dispose: () => {
        clearTimeout(timer);
        channel.port1.postMessage({ type: 'cancel' });
        channel.port1.close();
        frame.remove();
        if (!finished) {
          finished = true;
          reject(new Error(translate('content.toolbar.videoRecordingPermissionCancelled')));
        }
      },
    };
    const timer = setTimeout(() => {
      release(kind);
    }, 10_000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      if (!isRecordingMediaPermissionResult(event.data)) return;
      clearTimeout(timer);
      if (event.data.status === 'ready') return;
      if (event.data.status === 'cancelled') {
        release(kind);
        return;
      }
      if (finished) return;
      finished = true;
      if (event.data.status === 'granted') {
        frame.style.visibility = 'hidden';
        frame.style.pointerEvents = 'none';
        resolve();
      } else {
        lease.failed = true;
        frame.style.visibility = 'visible';
        frame.style.pointerEvents = 'auto';
        reject(
          new RecordingPermissionFrameError(
            translate('content.toolbar.videoRecordingPermissionFailed'),
            true
          )
        );
      }
    };
    channel.port1.start();
    frame.onload = () => {
      const bootstrap: RecordingMediaPermissionBootstrap = {
        type: 'recording-media-permission',
        request: {
          type: VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND,
          surfaceSessionId: identity.surfaceSessionId,
          surfaceToken: identity.surfaceToken,
          documentGeneration: identity.documentGeneration,
          capabilityEpoch: identity.capabilityEpoch,
          recordingId: identity.recordingId,
          command: { kind: 'list-media-devices', deviceKind: kind, requestPermission: false },
        },
        locale: getCurrentLocale(),
        theme:
          resolveContentShadowRoot()?.host.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
      };
      frame.contentWindow?.postMessage(bootstrap, extensionOrigin, [channel.port2]);
    };
    frame.onerror = () => release(kind);
    leases.set(kind, lease);
    dependencies.mount(frame);
    return promise;
  };
  return { request, release };
}
