// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createReviewSessionRuntime } from './runtime';
import { createBrowserAnnotationSession } from '../../parser/page-preparation/annotations/session';
import { pageA, pageB, lease, record, setup } from './runtime.test-support';

it('restores last accepted payload without opening writes', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  expect(ctx.ports.request.mock.calls.map(([request]) => request.kind)).toEqual(['open']);
  expect(ctx.runtime.getSnapshot()).toMatchObject({
    active: true,
    panelOpen: true,
    position: { x: 60, y: 100 },
    error: false,
  });
  expect(ctx.ports.restoreMode).toHaveBeenCalledWith(
    expect.objectContaining({ tool: 'navigate', panelOpen: true })
  );
  expect(ctx.runtime.getSnapshot().records[0]!.record.comment).toBe('Accepted feedback');
  await ctx.runtime.flush();
  expect(ctx.ports.request).toHaveBeenCalledTimes(1);
});

it('isolates reused page-local annotation IDs when another page accepts feedback', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  ctx.navigatePage(pageB);
  ctx.setAnnotations([record(pageB, 'Second-page feedback')]);
  ctx.runtime.changed();
  await ctx.runtime.flush();
  const entries = ctx.runtime.getSnapshot().records;
  expect(entries.map((entry) => entry.record.annotationId)).toEqual([1, 1]);
  expect(entries.map((entry) => entry.record.comment)).toEqual([
    'Accepted feedback',
    'Second-page feedback',
  ]);
  expect(new Set(entries.map((entry) => entry.id)).size).toBe(2);
  await ctx.runtime.deleteRecord(entries[0]!.id);
  expect(ctx.ports.removeTarget).not.toHaveBeenCalled();
  expect(ctx.runtime.getSnapshot().records.map((entry) => entry.record.comment)).toEqual([
    'Second-page feedback',
  ]);
  ctx.runtime.changed();
  await ctx.runtime.flush();
  expect(ctx.runtime.getSnapshot().records).toHaveLength(1);
});

it('retires previous-page DOM bindings before the next page accepts feedback', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  let page = pageA;
  const oldTarget = document.createElement('button');
  const newTarget = document.createElement('button');
  const runtime = createReviewSessionRuntime({
    ...ctx.ports,
    annotations,
    pageUrl: () => page,
    resolve: (item) =>
      item.evidence.pageUrl === page ? (page === pageA ? oldTarget : newTarget) : null,
  });
  await runtime.open();
  expect(annotations.getLiveTarget(1)).toBe(oldTarget);
  page = pageB;
  runtime.navigatePage();
  expect(annotations.getLiveTarget(1)).toBeNull();
  annotations.setComment({
    target: newTarget,
    evidence: record(pageB).evidence,
    comment: 'Second page',
  });
  runtime.changed();
  await runtime.flush();
  expect(annotations.getLiveTarget(annotations.getAnnotationId(newTarget)!)).toBe(newTarget);
  expect(runtime.getSnapshot().records.map((entry) => entry.record.evidence.pageUrl)).toEqual([
    pageA,
    pageB,
  ]);
  expect(runtime.getSnapshot().records.map((entry) => entry.unavailable)).toEqual([true, false]);
});

it('preserves enabled review and feedback during old-page navigation cleanup', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  const target = document.createElement('button');
  const runtime = createReviewSessionRuntime({ ...ctx.ports, annotations, resolve: () => target });
  await runtime.open();
  runtime.setMode(true, 'comment');
  await runtime.flush();
  annotations.setComment({
    target,
    evidence: record().evidence,
    comment: 'Review before navigation',
  });
  runtime.beginNavigation();
  annotations.resetForDocument();
  runtime.setMode(false, 'comment');
  runtime.changed();
  await runtime.flush();
  expect(JSON.parse(ctx.saved())).toMatchObject({
    enabled: true,
    tool: 'comment',
    entries: [
      expect.objectContaining({
        record: expect.objectContaining({ comment: 'Review before navigation' }),
      }),
    ],
  });
  expect(runtime.getSnapshot().active).toBe(true);
  expect(runtime.getSnapshot().records).toHaveLength(1);
});

it('preserves accepted feedback when page preparation resets without a navigation signal', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  const runtime = createReviewSessionRuntime({ ...ctx.ports, annotations, resolve: () => null });
  await runtime.open();
  const saved = ctx.saved();
  annotations.resetForDocument();
  runtime.changed();
  await runtime.flush();
  expect(runtime.getSnapshot().records).toEqual([
    expect.objectContaining({
      id: lease,
      record: expect.objectContaining({ comment: 'Accepted feedback' }),
    }),
  ]);
  expect(ctx.saved()).toBe(saved);
  expect(ctx.ports.request.mock.calls.map(([request]) => request.kind)).toEqual(['open']);
});

it('retains unrelated text when restored review collides with its annotation ID', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  const unrelatedTarget = document.createElement('p');
  const reviewTarget = document.createElement('button');
  const evidence = {
    ...record().evidence,
    locator: '#unrelated',
    targetSelector: '#unrelated',
    targetPath: 'p#unrelated',
  };
  const textChange = { before: 'Original source', after: 'Edited source' };
  const markers = [
    { id: 'source-marker', start: 0, end: 8, source: 'Original source', color: '#ff0000' },
  ];
  annotations.recordTextChange({ target: unrelatedTarget, evidence, ...textChange });
  annotations.setTextMarkers({ target: unrelatedTarget, evidence, markers });
  const original = annotations.captureSnapshot().domRecords[0]!;
  expect(original.annotationId).toBe(1);
  const runtime = createReviewSessionRuntime({
    ...ctx.ports,
    annotations,
    resolve: (item) =>
      item.evidence.targetSelector === '#unrelated' ? unrelatedTarget : reviewTarget,
  });
  await runtime.open();
  const records = annotations.captureSnapshot().domRecords;
  expect(records).toHaveLength(2);
  expect(records.find((item) => item.annotationId === 1)).toEqual(original);
  const restored = records.find((item) => item.comment === 'Accepted feedback')!;
  expect(restored.annotationId).not.toBe(1);
  expect(annotations.getLiveTarget(1)).toBe(unrelatedTarget);
  expect(annotations.getLiveTarget(restored.annotationId)).toBe(reviewTarget);
  expect(runtime.getSnapshot().records).toEqual([
    expect.objectContaining({
      id: lease,
      record: expect.objectContaining({
        annotationId: restored.annotationId,
        comment: 'Accepted feedback',
      }),
    }),
  ]);
});

it('retains same-target text fields when restoring saved review feedback', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  const target = document.createElement('button');
  const textChange = { before: 'Original source', after: 'Edited source' };
  const markers = [
    { id: 'source-marker', start: 0, end: 8, source: 'Original source', color: '#ff0000' },
  ];
  annotations.recordTextChange({ target, evidence: record().evidence, ...textChange });
  annotations.setTextMarkers({ target, evidence: record().evidence, markers });
  const runtime = createReviewSessionRuntime({ ...ctx.ports, annotations, resolve: () => target });
  await runtime.open();
  expect(annotations.captureSnapshot().domRecords).toEqual([
    expect.objectContaining({
      annotationId: 1,
      comment: 'Accepted feedback',
      textChange,
      textMarkers: markers,
    }),
  ]);
  expect(runtime.getSnapshot().records[0]!.id).toBe(lease);
});
