import {
  isRecordingMediaPermissionBootstrap,
  isRecordingMediaPermissionCancellation,
  isVideoRecordingSurfaceSnapshot,
  type RecordingMediaPermissionBootstrap,
  type RecordingMediaPermissionResult,
} from '@sniptale/runtime-contracts/video/types/messages.surface';
import { createRuntimeMessagingTransport } from '../platform/runtime-messaging';
import { createTranslator } from '../platform/i18n';
import { createRecordingMediaPermissionSession } from './session';
import '@sniptale/ui/styles';

function documentAllows(kind: 'audioinput' | 'videoinput'): boolean {
  const policy: unknown =
    Reflect.get(document, 'permissionsPolicy') ?? Reflect.get(document, 'featurePolicy');
  if (typeof policy !== 'object' || policy === null) return true;
  const allowsFeature: unknown = Reflect.get(policy, 'allowsFeature');
  return (
    typeof allowsFeature !== 'function' ||
    Reflect.apply(allowsFeature, policy, [kind === 'audioinput' ? 'microphone' : 'camera']) !==
      false
  );
}

function mountPermissionSession(bootstrap: RecordingMediaPermissionBootstrap, port: MessagePort) {
  const main = document.querySelector('main');
  const heading = document.getElementById('heading');
  const status = document.querySelector('[data-ui="recording.media-permission.status"]');
  const cancel = document.querySelector('[data-ui="recording.media-permission.cancel"]');
  if (
    !(main instanceof HTMLElement) ||
    !heading ||
    !status ||
    !(cancel instanceof HTMLButtonElement)
  ) {
    port.close();
    return;
  }
  const translate = createTranslator(bootstrap.locale);
  document.documentElement.lang = bootstrap.locale;
  document.documentElement.dataset['theme'] = bootstrap.theme;
  main.hidden = false;
  main.setAttribute('aria-labelledby', 'heading');
  heading.textContent = translate(
    bootstrap.request.command.deviceKind === 'audioinput'
      ? 'content.toolbar.videoRecordingMicrophonePermissionTitle'
      : 'content.toolbar.videoRecordingCameraPermissionTitle'
  );
  status.textContent = translate('content.toolbar.videoRecordingMediaPermissionDescription');
  cancel.setAttribute('aria-label', translate('common.actions.close'));
  cancel.title = translate('common.actions.close');
  const messaging = createRuntimeMessagingTransport();
  const report = (result: RecordingMediaPermissionResult) => {
    if (result.status === 'failed') {
      status.setAttribute('role', 'alert');
      status.textContent = translate(
        result.reason === 'policy'
          ? 'content.toolbar.videoRecordingPermissionPolicy'
          : result.reason === 'denied'
            ? 'content.toolbar.videoRecordingPermissionDenied'
            : result.reason === 'unauthorized'
              ? 'content.toolbar.videoRecordingPermissionUnauthorized'
              : 'content.toolbar.videoRecordingPermissionFailed'
      );
    }
    port.postMessage(result);
  };
  const session = createRecordingMediaPermissionSession({
    authorize: async (request) => {
      const response = await messaging.sendRuntimeMessage(request);
      return response.success === true && isVideoRecordingSurfaceSnapshot(response.snapshot);
    },
    acquire: (kind) =>
      navigator.mediaDevices.getUserMedia({
        audio: kind === 'audioinput',
        video: kind === 'videoinput',
      }),
    policyAllows: documentAllows,
    report,
  });
  const dispose = () => {
    session.dispose();
    port.close();
  };
  cancel.addEventListener('click', () => session.cancel());
  port.onmessage = (event: MessageEvent<unknown>) => {
    if (isRecordingMediaPermissionCancellation(event.data)) session.cancel();
  };
  port.start();
  window.addEventListener('pagehide', dispose, { once: true });
  window.addEventListener('unload', dispose, { once: true });
  report({ status: 'ready' });
  void session.start(bootstrap);
}

function receiveBootstrap(event: MessageEvent<unknown>) {
  const port = event.ports[0];
  if (
    event.source !== window.parent ||
    event.ports.length !== 1 ||
    !port ||
    !isRecordingMediaPermissionBootstrap(event.data)
  )
    return;
  window.removeEventListener('message', receiveBootstrap);
  mountPermissionSession(event.data, port);
}

window.addEventListener('message', receiveBootstrap);
