import type { Dispatch } from 'react';
import type { VideoRecordingSurfaceSnapshot } from '@sniptale/runtime-contracts/video/types/messages.surface';
import type { VideoRecordingToolbarStateAction } from './state';
import { translate } from '../../../../platform/i18n';

export function projectVideoRecordingSurfaceSnapshot(
  snapshot: VideoRecordingSurfaceSnapshot,
  surfaceToken: string,
  dispatch: Dispatch<VideoRecordingToolbarStateAction>
): void {
  dispatch({
    type: 'snapshot',
    snapshot,
    surfaceToken,
    error: snapshot.errorCode ? translate('content.toolbar.videoRecordingActionFailed') : null,
  });
}
