// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createReviewSessionRuntime } from './runtime';
import { createBrowserAnnotationSession } from '../../parser/page-preparation/annotations/session';
import type { ReviewSessionPreview } from './controller';
import {
  pageA,
  pageB,
  lease,
  record,
  annotationSnapshot,
  deferred,
  setup,
} from './runtime.test-support';

it('keeps unavailable feedback and its saved preview across navigation', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  const preview = { dataUrl: 'data:image/png;base64,YQ==', width: 100, height: 50 };
  ctx.ports.capture.mockResolvedValueOnce(preview);
  await ctx.runtime.captureCurrent({ kind: 'trusted-content-event' });
  ctx.navigatePage(pageB);
  expect(ctx.runtime.getSnapshot().records).toEqual([
    expect.objectContaining({
      unavailable: true,
      preview,
      record: expect.objectContaining({ comment: 'Accepted feedback' }),
    }),
  ]);
  expect(ctx.runtime.exportSnapshot().snapshot.domRecords[0]!.evidence.pageUrl).toBe(pageA);
  expect(ctx.runtime.exportSnapshot().previews.get(1)).toEqual(preview);
  ctx.runtime.changed();
  await ctx.runtime.flush();
  expect(ctx.runtime.getSnapshot().records).toHaveLength(1);
});

it('does not restore deleted records after delayed capture', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  const captured = deferred<ReviewSessionPreview | null>();
  const started = deferred<void>();
  ctx.ports.capture.mockImplementationOnce(async () => {
    started.resolve();
    return captured.promise;
  });
  const capture = ctx.runtime.captureCurrent({ kind: 'trusted-content-event' });
  await started.promise;
  await ctx.runtime.deleteRecord(ctx.runtime.getSnapshot().records[0]!.id);
  captured.resolve({ dataUrl: 'data:image/png;base64,YQ==', width: 100, height: 50 });
  await capture;
  ctx.runtime.changed();
  await ctx.runtime.flush();
  expect(ctx.runtime.getSnapshot().records).toEqual([]);
  expect(JSON.parse(ctx.saved()).entries).toEqual([]);
  expect(ctx.runtime.exportSnapshot().previews.size).toBe(0);
});

it('rolls back failed deletion and retains the last acknowledged evidence', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  const before = structuredClone(ctx.runtime.getSnapshot().records);
  const saved = ctx.saved();
  ctx.ports.request.mockImplementationOnce(async () => {
    throw new Error('Storage refused');
  });
  await expect(ctx.runtime.deleteRecord(before[0]!.id)).rejects.toThrow('Storage refused');
  expect(ctx.runtime.getSnapshot().records).toEqual(before);
  expect(ctx.saved()).toBe(saved);
  expect(ctx.runtime.getSnapshot().error).toBe(true);
  expect(ctx.ports.annotations.applySnapshot).toHaveBeenLastCalledWith(
    expect.objectContaining({ domRecords: [before[0]!.record] })
  );
});

it('clears unavailable feedback and excludes it from aggregate exports', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  ctx.navigatePage(pageB);
  await ctx.runtime.clear();
  expect(ctx.runtime.getSnapshot().records).toEqual([]);
  expect(ctx.runtime.exportSnapshot().snapshot.domRecords).toEqual([]);
  expect(ctx.ports.request.mock.calls.at(-1)![0]).toMatchObject({ kind: 'clear' });
});

it.each([false, true])(
  'keeps unavailable feedback deleted after another annotation changes (retained text: %s)',
  async (retainText) => {
    const ctx = setup();
    const annotations = createBrowserAnnotationSession();
    const reviewed = {
      ...record(),
      designReview: { action: 'refine' as const },
      markerNumber: 1,
      propertyChanges: [
        {
          property: 'color',
          order: 1,
          before: { value: 'red', priority: '' },
          after: { value: 'blue', priority: '' },
        },
      ],
      ...(retainText
        ? {
            textChange: { before: 'Original', after: 'Edited' },
            textMarkers: [
              { id: 'highlight', start: 0, end: 3, source: 'Original', color: '#ff0000' },
            ],
          }
        : {}),
    };
    ctx.ports.request.mockImplementationOnce(async (request) => ({
      ...ctx.ready(request),
      payload: JSON.stringify({
        ...ctx.initial,
        entries: [{ id: lease, record: reviewed, unavailable: true }],
      }),
    }));
    const runtime = createReviewSessionRuntime({ ...ctx.ports, annotations, resolve: () => null });
    await runtime.open();
    expect(runtime.getSnapshot().records[0]!.unavailable).toBe(true);
    await runtime.deleteRecord(lease);
    expect(ctx.ports.removeTarget).not.toHaveBeenCalled();
    if (retainText) {
      expect(annotations.captureSnapshot().domRecords).toEqual([
        expect.objectContaining({
          annotationId: 1,
          textChange: reviewed.textChange,
          textMarkers: reviewed.textMarkers,
          propertyChanges: [],
        }),
      ]);
      expect(annotations.captureSnapshot().domRecords[0]).not.toHaveProperty('comment');
      expect(annotations.captureSnapshot().domRecords[0]).not.toHaveProperty('designReview');
      expect(annotations.captureSnapshot().domRecords[0]).not.toHaveProperty('markerNumber');
    } else expect(annotations.captureSnapshot().domRecords).toEqual([]);
    const newTarget = document.createElement('button');
    annotations.setComment({
      target: newTarget,
      evidence: { ...record().evidence, targetSelector: '#other', targetPath: '#other' },
      comment: 'Other feedback',
    });
    runtime.changed();
    await runtime.flush();
    expect(runtime.getSnapshot().records.map((entry) => entry.record.comment)).toEqual([
      'Other feedback',
    ]);
    expect(runtime.getSnapshot().records.some((entry) => entry.id === lease)).toBe(false);
    expect(
      JSON.parse(ctx.saved()).entries.map(
        (entry: { record: { comment: string } }) => entry.record.comment
      )
    ).toEqual(['Other feedback']);
  }
);

it('removes intentional live deletion while retaining unavailable feedback', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  const target = document.createElement('button');
  document.body.append(target);
  const unavailableId = '12345678-1234-4234-8234-123456789abd';
  const unavailable = {
    ...record(pageA, 'Unavailable feedback'),
    annotationId: 2,
    creationOrder: 2,
    evidence: { ...record().evidence, locator: '#missing', targetSelector: '#missing' },
  };
  ctx.ports.request.mockImplementationOnce(async (request) => ({
    ...ctx.ready(request),
    payload: JSON.stringify({
      ...ctx.initial,
      entries: [
        ...ctx.initial.entries,
        { id: unavailableId, record: unavailable, unavailable: true },
      ],
    }),
  }));
  const runtime = createReviewSessionRuntime({
    ...ctx.ports,
    annotations,
    resolve: (item) => (item.annotationId === 1 ? target : null),
  });
  try {
    await runtime.open();
    expect(annotations.getRecoveryTarget(1)).toBe(target);
    expect(annotations.getRecoveryTarget(2)).toBeNull();
    annotations.clearDesignReview(target);
    annotations.applySnapshot({ ...annotations.captureSnapshot(), domRecords: [] });
    runtime.changed();
    await runtime.flush();
    expect(runtime.getSnapshot().records).toEqual([
      expect.objectContaining({
        id: unavailableId,
        unavailable: true,
        record: expect.objectContaining({ comment: 'Unavailable feedback' }),
      }),
    ]);
    expect(JSON.parse(ctx.saved()).entries.map((entry: { id: string }) => entry.id)).toEqual([
      unavailableId,
    ]);
  } finally {
    target.remove();
    runtime.dispose();
  }
});

it('removes feedback after history restores a pure text marker while preserving that marker', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  const target = document.createElement('button');
  const runtime = createReviewSessionRuntime({ ...ctx.ports, annotations, resolve: () => target });
  await runtime.open();
  expect(target.isConnected).toBe(false);
  const markers = [
    { id: 'history-marker', start: 0, end: 3, source: 'Original', color: '#ff0000' },
  ];
  const pureText = { ...record(pageA, ''), textMarkers: markers };
  delete pureText.comment;
  annotations.applySnapshot(annotationSnapshot([pureText]));
  expect(annotations.getRecoveryTarget(1)).toBe(target);
  runtime.changed();
  await runtime.flush();
  expect(runtime.getSnapshot().records).toEqual([]);
  expect(JSON.parse(ctx.saved()).entries).toEqual([]);
  expect(runtime.exportSnapshot().snapshot.domRecords).toEqual([]);
  expect(annotations.captureSnapshot().domRecords).toEqual([pureText]);
  expect(annotations.getLiveTarget(1)).toBe(target);
});

it('preserves undone unavailable feedback when an annotation changes before acknowledgement', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  const target = document.createElement('button');
  let available = true;
  const runtime = createReviewSessionRuntime({
    ...ctx.ports,
    annotations,
    resolve: () => (available ? target : null),
  });
  await runtime.open();
  available = false;
  await runtime.deleteRecord(lease);
  expect(runtime.getSnapshot().records).toEqual([]);
  expect(annotations.captureSnapshot().domRecords).toEqual([]);
  expect(annotations.getRecoveryTarget(1)).toBe(target);
  const server = ctx.ports.request.getMockImplementation()!;
  const saving = deferred<void>();
  const acknowledge = deferred<void>();
  ctx.ports.request.mockImplementationOnce(async (request) => {
    saving.resolve();
    await acknowledge.promise;
    return server(request);
  });
  const undo = runtime.undoDelete();
  await saving.promise;
  expect(runtime.getSnapshot().pending).toBe(true);
  runtime.changed();
  acknowledge.resolve();
  await undo;
  await runtime.flush();
  expect(runtime.getSnapshot().records).toEqual([
    expect.objectContaining({
      id: lease,
      record: expect.objectContaining({ comment: 'Accepted feedback' }),
    }),
  ]);
  expect(annotations.captureSnapshot().domRecords).toEqual([ctx.initial.entries[0]!.record]);
  expect(JSON.parse(ctx.saved()).entries.map((entry: { id: string }) => entry.id)).toEqual([lease]);
});

it('restarts markers after acknowledged Clear without reusing annotation identities', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  const target = document.createElement('button');
  const next = document.createElement('button');
  ctx.initial.entries[0]!.record.markerNumber = 19;
  ctx.ports.request.mockImplementationOnce(async (request) => ({
    ...ctx.ready(request),
    payload: JSON.stringify(ctx.initial),
  }));
  annotations.applySnapshot({
    ...annotationSnapshot(),
    nextAnnotationId: 200,
    nextCreationOrder: 200,
  });
  const runtime = createReviewSessionRuntime({
    ...ctx.ports,
    annotations,
    resolve: () => target,
    clearTargets: async () => {
      annotations.clearDesignReview(target);
    },
  });
  try {
    await runtime.open();
    await runtime.clear();
    expect(annotations.captureSnapshot().nextMarkerNumber).toBe(1);
    expect(annotations.captureSnapshot().nextAnnotationId).toBe(200);
    annotations.setComment({ target, evidence: record().evidence, comment: 'First after Clear' });
    expect(annotations.captureSnapshot().domRecords[0]?.markerNumber).toBe(1);
    annotations.setComment({
      target: next,
      evidence: { ...record().evidence, targetSelector: '#next' },
      comment: 'Second',
    });
    expect(annotations.captureSnapshot().domRecords.map((item) => item.markerNumber)).toEqual([
      1, 2,
    ]);
    runtime.changed();
    await runtime.flush();
    expect(runtime.exportSnapshot().snapshot.domRecords.map((item) => item.markerNumber)).toEqual([
      1, 2,
    ]);
    runtime.navigatePage();
    expect(annotations.captureSnapshot().nextMarkerNumber).toBe(3);
  } finally {
    runtime.dispose();
  }
});

it('preserves marker allocation after failed Clear and resets only after successful retry', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  const target = document.createElement('button');
  ctx.initial.entries[0]!.record.markerNumber = 19;
  ctx.ports.request.mockImplementationOnce(async (request) => ({
    ...ctx.ready(request),
    payload: JSON.stringify(ctx.initial),
  }));
  const runtime = createReviewSessionRuntime({
    ...ctx.ports,
    annotations,
    resolve: () => target,
    clearTargets: async () => {
      annotations.clearDesignReview(target);
    },
  });
  try {
    await runtime.open();
    ctx.ports.request.mockRejectedValueOnce(new Error('Storage refused'));
    await expect(runtime.clear()).rejects.toThrow('Storage refused');
    expect(annotations.captureSnapshot().domRecords[0]?.markerNumber).toBe(19);
    expect(annotations.captureSnapshot().nextMarkerNumber).toBe(20);
    await runtime.clear();
    expect(annotations.captureSnapshot().nextMarkerNumber).toBe(1);
  } finally {
    runtime.dispose();
  }
});
