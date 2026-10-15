import { afterEach, expect, it, vi } from 'vitest';
import {
  installDiagnosticLogObserver,
  type DiagnosticLogEvent,
} from '@sniptale/platform/observability/logger';
import { createReviewExportFixture } from './export-lifecycle.test-support';
import { exportReviewedVideo, QuickEditExportUnavailable } from './export-lifecycle';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';

afterEach(() => vi.unstubAllGlobals());

function observe() {
  vi.stubGlobal('__SNIPTALE_RELEASE_BUILD__', true);
  const events: DiagnosticLogEvent[] = [];
  const stop = installDiagnosticLogObserver((event) => events.push(event));
  return { events, stop };
}

it.each([
  'prepare',
  'encode',
  'staging-finalize',
  'staging-read',
  'publish',
  'release-protection',
] as const)('retains a controlled %s failure through the real logger in release', async (stage) => {
  const { args, deps, writer } = createReviewExportFixture();
  const error = new Error('private-file.webm https://private.example/secret selected text');
  if (stage === 'prepare') deps.loadVideoReviewSource.mockRejectedValueOnce(error);
  if (stage === 'encode') deps.writeReviewPackets.mockRejectedValueOnce(error);
  if (stage === 'staging-finalize') writer.finalize.mockRejectedValueOnce(error);
  if (stage === 'staging-read') deps.readAssetFile.mockRejectedValueOnce(error);
  if (stage === 'publish') deps.saveRecordingsBatchSafely.mockRejectedValueOnce(error);
  if (stage === 'release-protection') deps.releaseAssetReadyProtection.mockRejectedValueOnce(error);
  const observer = observe();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const fail = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    await expect(exportReviewedVideo(args, deps)).rejects.toThrow();
    expect(observer.events).toHaveLength(1);
    expect(observer.events[0]).toMatchObject({ source: 'ReviewExport', level: 'info' });
    expect(observer.events[0]?.message).toContain(`stage=${stage} code=${stage}-failed`);
    expect(observer.events[0]?.message).toContain(
      `route=${stage === 'prepare' ? 'undetermined' : 'copy'}`
    );
    expect(observer.events[0]?.message).toContain('destination=gallery');
    expect(JSON.stringify(observer.events)).not.toMatch(/private|selected text|stack/);
    expect(warn).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
  } finally {
    observer.stop();
    warn.mockRestore();
    fail.mockRestore();
  }
});

it('keeps the primary failure and staging cleanup failure as separate terminal summaries', async () => {
  const { args, deps, writer } = createReviewExportFixture();
  const primary = new Error('private encoder cause');
  const cleanup = new Error('private cleanup cause');
  deps.writeReviewPackets.mockRejectedValueOnce(primary);
  writer.abort.mockRejectedValueOnce(cleanup);
  const observer = observe();
  try {
    await expect(exportReviewedVideo(args, deps)).rejects.toThrow();
    expect(observer.events.map((event) => event.message)).toEqual([
      expect.stringContaining('outcome=failed route=copy destination=gallery stage=encode'),
      expect.stringContaining(
        'outcome=cleanup-failed route=copy destination=gallery stage=cleanup'
      ),
    ]);
    expect(JSON.stringify(observer.events)).not.toContain('private');
  } finally {
    observer.stop();
  }
});

it('reports a download release refusal after success without reporting encoder failure', async () => {
  const { args, deps, writer } = createReviewExportFixture();
  const observer = observe();
  try {
    const result = await exportReviewedVideo({ ...args, destination: 'download' }, deps);
    writer.abort.mockRejectedValueOnce(new Error('private release'));
    await expect(result.release?.()).rejects.toThrow();
    expect(observer.events).toHaveLength(1);
    expect(observer.events[0]?.message).toContain(
      'outcome=download-release-failed route=copy destination=download stage=download-release'
    );
  } finally {
    observer.stop();
  }
});

it('keeps expected cancellation and known unavailable admission quiet', async () => {
  const observer = observe();
  try {
    const cancelled = createReviewExportFixture();
    cancelled.controller.abort();
    await expect(exportReviewedVideo(cancelled.args, cancelled.deps)).rejects.toThrow();
    const unavailable = createReviewExportFixture();
    unavailable.deps.loadVideoReviewSource.mockRejectedValueOnce(
      new QuickEditExportUnavailable(['asset-missing'])
    );
    await expect(exportReviewedVideo(unavailable.args, unavailable.deps)).rejects.toBeInstanceOf(
      QuickEditExportUnavailable
    );
    expect(observer.events).toEqual([]);
  } finally {
    observer.stop();
  }
});

it('identifies the prepared render route and unexpected external-audio preparation failure', async () => {
  const { args, deps } = createReviewExportFixture();
  const advanced = args.snapshot.workspace.advanced;
  advanced.ui.mode = 'advanced';
  advanced.ui.tracks.audio = true;
  advanced.ui.tracks.zoom = true;
  advanced.zoom.enabled = true;
  advanced.zoom.regions = [
    createQuickEditZoomRegion({ id: 'focus', at: 0, duration: 1, endMax: 6 }),
  ];
  advanced.audio.music = [
    {
      id: 'music',
      assetId: 'private-asset',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 4,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  args.index.processedVideoCodec = 'vp8';
  deps.readProjectAsset.mockRejectedValueOnce(new Error('private audio resource'));
  const observer = observe();
  try {
    await expect(exportReviewedVideo(args, deps)).rejects.toThrow();
    expect(observer.events[0]?.message).toContain(
      'route=render destination=gallery stage=audio-prepare'
    );
    expect(deps.writeReviewFrames).not.toHaveBeenCalled();
  } finally {
    observer.stop();
  }
});
