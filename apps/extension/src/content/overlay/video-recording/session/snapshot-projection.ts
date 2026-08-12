import type { Dispatch } from 'react';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';
import type { VideoRecordingToolbarStateAction } from './state';

export function projectVideoRecordingSurfaceSnapshot(
  snapshot: VideoRecordingSurfaceSnapshot,
  surfaceToken: string,
  dispatch: Dispatch<VideoRecordingToolbarStateAction>
): void {
  dispatch({ type: 'surface-ready', surfaceSessionId: snapshot.surfaceSessionId, surfaceToken });
  dispatch({ type: 'duration', durationSeconds: snapshot.duration });
  dispatch({ type: 'microphone', enabled: snapshot.microphoneEnabled });
  dispatch({ type: 'microphone-device', deviceId: snapshot.microphoneDeviceId });
  dispatch({ type: 'camera', enabled: snapshot.webcamEnabled });
  dispatch({ type: 'camera-device', deviceId: snapshot.webcamDeviceId });
  dispatch({ type: 'camera-presentation', presentation: snapshot.webcamPresentation });
  dispatch({ type: 'spotlight', enabled: snapshot.cursorSpotlightEnabled });

  switch (snapshot.status) {
    case VideoRecordingStatus.IDLE:
      dispatch(
        snapshot.errorCode ? { type: 'failed', error: snapshot.errorCode } : { type: 'idle' }
      );
      return;
    case VideoRecordingStatus.PREPARING:
    case VideoRecordingStatus.COUNTDOWN:
      dispatch({
        type: 'starting',
        ...(snapshot.recordingId ? { recordingId: snapshot.recordingId } : {}),
      });
      return;
    case VideoRecordingStatus.RECORDING:
      if (snapshot.recordingId) {
        dispatch({ type: 'recording', recordingId: snapshot.recordingId });
      }
      return;
    case VideoRecordingStatus.PAUSED:
      dispatch({ type: 'recording', recordingId: snapshot.recordingId ?? '' });
      dispatch({ type: 'paused' });
      return;
    case VideoRecordingStatus.STOPPING:
      dispatch({ type: 'stopping' });
  }
}
