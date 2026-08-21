import type { Dispatch } from 'react';
import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';
import type { VideoRecordingToolbarStateAction } from './state';
import { resolveVideoRecordingFailureMessage } from '../../../../features/video/recording-failure';

export function projectVideoRecordingSurfaceSnapshot(
  snapshot: VideoRecordingSurfaceSnapshot,
  surfaceToken: string,
  dispatch: Dispatch<VideoRecordingToolbarStateAction>
): void {
  dispatch({
    type: 'snapshot',
    snapshot,
    surfaceToken,
    error: resolveVideoRecordingFailureMessage(snapshot.errorCode),
  });
}
