import { describe, expect, it, vi } from 'vitest';
import { VideoExportFormat } from '../../../features/video/project/types';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => `translated:${key}`,
}));

describe('persistence format helper', () => {
  it('returns translated descriptor data for the requested format', async () => {
    vi.resetModules();
    const { getExportFormatDescriptor } = await import('./format');

    expect(getExportFormatDescriptor(VideoExportFormat.MP4)).toEqual({
      extension: 'mp4',
      label: 'translated:offscreenExport.formatMp4Label',
      labelKey: 'offscreenExport.formatMp4Label',
      mimeType: 'video/mp4',
    });
  });

  it('falls back to the webm descriptor for unknown formats', async () => {
    vi.resetModules();
    const { getExportFormatDescriptor } = await import('./format');

    expect(getExportFormatDescriptor('unknown-format' as VideoExportFormat)).toEqual({
      extension: 'webm',
      label: 'translated:offscreenExport.formatWebmLabel',
      labelKey: 'offscreenExport.formatWebmLabel',
      mimeType: 'video/webm',
    });
  });
});
