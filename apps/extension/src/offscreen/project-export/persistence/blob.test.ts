import { describe, expect, it } from 'vitest';
import {
  VideoExportFormat,
  type VideoProjectExportSettings,
} from '../../../features/video/project/types';
import { isMimeTypeCompatibleWithFormat, prepareOutputBlob } from './blob';

describe('persistence blob helpers', () => {
  it('matches mp4-compatible mime types case-insensitively', () => {
    expect(isMimeTypeCompatibleWithFormat('APPLICATION/MP4', VideoExportFormat.MP4)).toBe(true);
  });

  it('passes through webm inputs for webm exports', async () => {
    const inputBlob = new Blob(['video'], { type: 'video/unknown' });
    const settings = { format: VideoExportFormat.WEBM } as VideoProjectExportSettings;
    await expect(prepareOutputBlob(settings, inputBlob)).resolves.toBe(inputBlob);
  });

  it('rejects mp4 fast path when source mime is incompatible', async () => {
    const inputBlob = new Blob(['video'], { type: 'video/unknown' });
    const settings = { format: VideoExportFormat.MP4 } as VideoProjectExportSettings;
    await expect(prepareOutputBlob(settings, inputBlob)).rejects.toThrow(
      'Fast-path MP4 экспорт поддерживается только для исходного MP4 asset.'
    );
  });
});
