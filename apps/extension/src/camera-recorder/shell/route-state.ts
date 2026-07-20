import { translate } from '../../platform/i18n';
import { clearCameraRecorderLaunchUrlParams } from '../platform/browser-driver';
import type { CameraRecorderRouteState } from './types';

export function consumeCameraRecorderRouteState(): CameraRecorderRouteState {
  const params = new URLSearchParams(window.location.search);
  const launchToken = params.get('launchToken');
  const recordingId = params.get('recordingId');
  clearCameraRecorderLaunchUrlParams();

  if (!launchToken || !recordingId) {
    return {
      launchToken: '',
      recordingId: '',
      routeError: translate('popup.video.startRecordingError'),
    };
  }

  return { launchToken, recordingId, routeError: null };
}
