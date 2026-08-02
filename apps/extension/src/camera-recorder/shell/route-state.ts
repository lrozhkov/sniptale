import { translate } from '../../platform/i18n';
import { clearCameraRecorderLaunchUrlParams } from '../platform/browser-driver';
import type { CameraRecorderRouteState } from './types';

export function consumeCameraRecorderRouteState(): CameraRecorderRouteState {
  const params = new URLSearchParams(window.location.search);
  const registrationToken = params.get('launchToken');
  const recordingId = params.get('recordingId');
  clearCameraRecorderLaunchUrlParams();

  if (registrationToken && recordingId) {
    return { recordingId, registrationToken, routeError: null };
  }
  if (!registrationToken && !recordingId) {
    return { recordingId: null, registrationToken: null, routeError: null };
  }
  return {
    registrationToken: null,
    recordingId: null,
    routeError: translate('popup.video.startRecordingError'),
  };
}
