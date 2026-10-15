// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, expect, it, vi } from 'vitest';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { createVideoProjectCursorTrack } from '../../features/video/project/defaults';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import { exportReviewReport } from './report-actions';
import type { LoadedReview } from './use-session';

const mocks = vi.hoisted(() => ({ download: vi.fn(), locale: 'en' as 'en' | 'ru' }));
vi.mock('../shared/download', () => ({ downloadGalleryBlob: mocks.download }));
vi.mock('../../workflows/file-naming/index', () => ({
  createOutputFilename: vi.fn(async () => 'clip.sniptale-video-review.md'),
}));
vi.mock('../../platform/i18n', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../platform/i18n')>();
  return {
    ...original,
    translate: (key: Parameters<typeof original.translate>[0]) =>
      original.translate(key, mocks.locale),
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function resource(): LoadedReview {
  const source = { duration: 4, width: 320, height: 180, size: 5, mimeType: 'video/webm' };
  const snapshot = {
    workspace: {
      aggregateId: 'recording:r',
      sourceAssetId: 'private',
      formatVersion: 1 as const,
      source,
      revision: 1,
      cursor: 0,
      advanced: createQuickEditAdvancedState(),
      history: [],
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  };
  return {
    source,
    snapshot,
    file: new File(['video'], 'clip.webm'),
    filename: 'clip.webm',
    url: 'blob:original',
    session: createVideoReviewSession(snapshot),
    telemetry: {
      recordingId: 'r',
      createdAt: 1,
      updatedAt: 1,
      captureMode: null,
      viewport: null,
      actionEvents: [],
      signals: [],
      cursorTrack: {
        ...createVideoProjectCursorTrack('embedded-fallback'),
        samples: [{ id: 'sample', time: 1, x: 73, y: 19, visible: true }],
      },
    },
  };
}
for (const locale of ['ru', 'en'] as const)
  it(`copies and downloads one summary of the same committed revision in ${locale}`, async () => {
    mocks.locale = locale;
    vi.stubGlobal('Blob', NodeBlob);
    const clipboard = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboard },
    });
    const loaded = resource();
    const before = JSON.stringify(loaded.telemetry);
    await exportReviewReport(loaded, 'copy');
    await exportReviewReport(loaded, 'download');
    const report = clipboard.mock.calls[0]![0];
    expect(await mocks.download.mock.calls[0]![0].text()).toBe(report);
    expect(report).toContain(
      locale === 'ru'
        ? 'Траектория в отчёт не включена.'
        : 'The trajectory is omitted from this report.'
    );
    expect(report).toContain('"schemaVersion": "sniptale.video-review.v2"');
    expect(report).not.toContain('"samples"');
    expect(JSON.stringify(loaded.telemetry)).toBe(before);
  });
it('propagates clipboard refusal without a full-data or download fallback', async () => {
  mocks.locale = 'en';
  const refusal = new Error('clipboard refused');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: vi.fn(async () => {
        throw refusal;
      }),
    },
  });
  await expect(exportReviewReport(resource(), 'copy')).rejects.toBe(refusal);
  expect(mocks.download).not.toHaveBeenCalled();
});
