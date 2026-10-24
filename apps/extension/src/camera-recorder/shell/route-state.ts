import { translate } from '../../platform/i18n';
import { clearCameraRecorderLaunchUrlParams } from '../platform/browser-driver';
import type { CameraRecorderRouteState } from './types';

export function consumeCameraRecorderRouteState(): CameraRecorderRouteState {
  const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
  const flags = {
    ...(params.get('draft') === '1' ? { draft: true } : {}),
    ...(params.get('teleprompter') === '1' ? { teleprompter: true } : {}),
  };
  const registrationToken = params.get('launchToken');
  const recordingId = params.get('recordingId');
  clearCameraRecorderLaunchUrlParams();

  if (registrationToken && recordingId) {
    return { recordingId, registrationToken, routeError: null, ...flags };
  }
  if (!registrationToken && !recordingId) {
    return { recordingId: null, registrationToken: null, routeError: null, ...flags };
  }
  return {
    registrationToken: null,
    recordingId: null,
    routeError: translate('popup.video.startRecordingError'),
  };
}
