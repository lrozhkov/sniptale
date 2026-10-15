import { expect, it, vi } from 'vitest';
import {
  createReviewExportDiagnostics,
  reviewExportPhase,
  cleanupReviewExportFailure,
} from './export-diagnostics';
import { QuickEditExportUnavailable } from './export-unavailable';

it('keeps concurrent phases and nested causes bound to their own operations', async () => {
  const sink = vi.fn();
  const attempt = createReviewExportDiagnostics({ destination: 'gallery', route: 'render' }, sink);
  let rejectAudio!: (error: unknown) => void;
  let rejectVideo!: (error: unknown) => void;
  const audioCause = new Error('private audio');
  const audio = attempt.phase(
    'audio-prepare',
    () =>
      new Promise<void>((_, reject) => {
        rejectAudio = reject;
      })
  );
  const video = attempt.phase('compose', () =>
    attempt.phase(
      'encode',
      () =>
        new Promise<void>((_, reject) => {
          rejectVideo = reject;
        })
    )
  );
  const completed = Promise.allSettled([audio, video]);
  rejectVideo(new Error('private video'));
  rejectAudio(audioCause);
  const results = await completed;
  expect(results[0]).toMatchObject({
    status: 'rejected',
    reason: { stage: 'audio-prepare', cause: audioCause },
  });
  expect(results[1]).toMatchObject({ status: 'rejected', reason: { stage: 'encode' } });
  if (results[1]?.status !== 'rejected') throw new Error('Expected failed video operation');
  attempt.reportFailure(results[1].reason);
  attempt.reportFailure(results[1].reason);
  expect(sink).toHaveBeenCalledOnce();
  expect(sink.mock.calls[0]?.[0]).toContain('stage=encode code=encode-failed');
  const nextSink = vi.fn();
  const next = createReviewExportDiagnostics({ destination: 'download', route: 'copy' }, nextSink);
  next.reportFailure(new Error('private'));
  expect(nextSink.mock.calls[0]?.[0]).toContain('route=copy destination=download');
});

it('retains a measured failure through a later abort and bounds every metric', async () => {
  const controller = new AbortController();
  const sink = vi.fn();
  const attempt = createReviewExportDiagnostics(
    { destination: 'download', signal: controller.signal },
    sink
  );
  const error = await reviewExportPhase(controller.signal, 'decode', () => {
    throw new Error('private');
  }).catch((value: unknown) => value);
  controller.abort();
  attempt.setMetrics({ width: 640, height: Infinity, completedFrames: -1, bytes: 2 ** 41 });
  attempt.reportFailure(error);
  expect(sink.mock.calls[0]?.[0]).toBe(
    'export outcome=failed route=undetermined destination=download stage=decode code=decode-failed width=640'
  );
});

it('preserves expected abort identity and known capability admission', async () => {
  const controller = new AbortController();
  const abort = new DOMException('private abort', 'AbortError');
  const unavailable = new QuickEditExportUnavailable(['asset-missing']);
  const sink = vi.fn();
  const attempt = createReviewExportDiagnostics(
    { destination: 'gallery', signal: controller.signal },
    sink
  );
  for (const error of [abort, unavailable]) {
    await expect(
      attempt.phase('prepare', () => {
        throw error;
      })
    ).rejects.toBe(error);
    attempt.reportFailure(error);
  }
  controller.abort('cancelled');
  attempt.reportFailure(controller.signal.reason);
  expect(sink).not.toHaveBeenCalled();
});

it('keeps cleanup secondary to the original failure, including cancellation', async () => {
  const primary = new DOMException('aborted', 'AbortError');
  const cleanup = new Error('private cleanup');
  const error = await cleanupReviewExportFailure(primary, () => {
    throw cleanup;
  }).catch((value: unknown) => value);
  expect(error).toMatchObject({ cause: primary, errors: [primary, cleanup] });
  const sink = vi.fn();
  createReviewExportDiagnostics({ destination: 'gallery', route: 'copy' }, sink).reportFailure(
    error
  );
  expect(sink).toHaveBeenCalledOnce();
  expect(sink.mock.calls[0]?.[0]).toContain('outcome=cleanup-failed');
});

it('does not retry or throw when the advisory sink refuses a summary', () => {
  const sink = vi.fn(() => {
    throw new Error('quota');
  });
  const attempt = createReviewExportDiagnostics({ destination: 'gallery' }, sink);
  expect(() => attempt.reportFailure(new Error('private'))).not.toThrow();
  attempt.reportFailure(new Error('private again'));
  expect(sink).toHaveBeenCalledOnce();
});
