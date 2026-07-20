import { describe, expect, it } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { isVideoRuntimeMessage } from './video-runtime';

describe('video-runtime runtime-message guards', () => {
  it('recognizes supported video runtime messages', () => {
    expect(isVideoRuntimeMessage({ type: VideoMessageType.GET_RECORDING_STATE })).toBe(true);
    expect(isVideoRuntimeMessage({ type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES })).toBe(
      true
    );
    expect(isVideoRuntimeMessage({ type: VideoMessageType.DESKTOP_MEDIA_FAILED })).toBe(true);
    expect(isVideoRuntimeMessage({ type: VideoMessageType.VIDEO_SAVED_TO_IDB })).toBe(true);
    expect(isVideoRuntimeMessage({ type: VideoMessageType.DOWNLOAD_RECORDING })).toBe(true);
  });

  it('rejects unknown runtime messages', () => {
    expect(isVideoRuntimeMessage({ type: 'UNKNOWN_RUNTIME' })).toBe(false);
  });
});
