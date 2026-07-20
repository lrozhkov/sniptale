import { describe, expect, it } from 'vitest';

import { VideoMessageType } from './index';

describe('video-message-types', () => {
  it('keeps canonical recorder and export message ids stable', () => {
    expect(VideoMessageType.OPEN_VIDEO_RECORDER).toBe('OPEN_VIDEO_RECORDER');
    expect(VideoMessageType.START_RECORDING).toBe('START_RECORDING');
    expect(VideoMessageType.STOP_RECORDING).toBe('STOP_RECORDING');
    expect(VideoMessageType.OFFSCREEN_START_RECORDING).toBe('OFFSCREEN_START_RECORDING');
    expect(VideoMessageType.GET_DESKTOP_MEDIA).toBe('GET_DESKTOP_MEDIA');
    expect(VideoMessageType.DESKTOP_MEDIA_FAILED).toBe('DESKTOP_MEDIA_FAILED');
    expect(VideoMessageType.START_PROJECT_EXPORT).toBe('START_PROJECT_EXPORT');
    expect(VideoMessageType.PROJECT_EXPORT_COMPLETED).toBe('PROJECT_EXPORT_COMPLETED');
    expect(VideoMessageType.DOWNLOAD_RECORDING).toBe('DOWNLOAD_RECORDING');
    expect(VideoMessageType.VIDEO_SAVED_TO_IDB).toBe('VIDEO_SAVED_TO_IDB');
  });

  it('exposes unique string values for the video runtime contract', () => {
    const values = Object.values(VideoMessageType);

    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain('SHOW_REGION_SELECTOR');
    expect(values).toContain('DESKTOP_STREAM_CACHE_FAILED');
    expect(values).toContain('PROJECT_EXPORT_CANCELLED');
  });
});
