// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createReviewSessionRuntime } from './runtime';
import { createBrowserAnnotationSession } from '../../parser/page-preparation/annotations/session';
import type { DesignReviewSessionReply } from '../../../contracts/design-review-session';
import type { DesignReviewSessionRequest } from '../../../contracts/design-review-session';
import { pageA, lease, record, deferred, setup, settled } from './runtime.test-support';

it('preserves local edits and the last acknowledged payload after save failure and explicit retry', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  const lastAck = ctx.saved();
  ctx.ports.request.mockImplementationOnce(async () => {
    throw new Error('Storage refused');
  });
  ctx.setAnnotations([record(pageA, 'Unsaved local feedback')]);
  ctx.runtime.changed();
  await settled(ctx.runtime, true);
  expect(ctx.runtime.getSnapshot().records[0]!.record.comment).toBe('Unsaved local feedback');
  expect(ctx.saved()).toBe(lastAck);
  await ctx.runtime.retry();
  expect(ctx.runtime.getSnapshot().records[0]!.record.comment).toBe('Unsaved local feedback');
  expect(JSON.parse(ctx.saved()).entries[0].record.comment).toBe('Unsaved local feedback');
});

it('orders writes after acknowledgement and uses each acknowledged revision', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  const firstAck = deferred<DesignReviewSessionReply>();
  const started = deferred<DesignReviewSessionRequest>();
  ctx.ports.request.mockImplementationOnce(async (request) => {
    started.resolve(request);
    return firstAck.promise;
  });
  ctx.runtime.setPosition({ x: 20, y: 30 });
  const first = await started.promise;
  expect(first).toMatchObject({ kind: 'save', expectedRevision: 4 });
  ctx.runtime.setPanelOpen(false);
  expect(ctx.ports.request).toHaveBeenCalledTimes(2);
  firstAck.resolve({ ...ctx.ready(first), revision: 5 });
  await ctx.runtime.flush();
  expect(ctx.ports.request.mock.calls[2]![0]).toMatchObject({ kind: 'save', expectedRevision: 5 });
  expect(JSON.parse(ctx.saved())).toMatchObject({ panelOpen: false, position: { x: 20, y: 30 } });
});

it('reopens worker admission before the next save after transport disconnect', async () => {
  const ctx = setup();
  let connected = true;
  let nativeRevision = 4;
  let nativePayload = JSON.stringify(ctx.initial);
  let nativeLease = lease;
  const newLease = '12345678-1234-4234-8234-123456789abe';
  ctx.ports.request.mockImplementation(async (request) => {
    if (request.kind === 'open') connected = true;
    else {
      expect(connected).toBe(true);
      expect(request.lease).toBe(nativeLease);
      expect(request.expectedRevision).toBe(nativeRevision);
      if (request.kind === 'save' || request.kind === 'clear') {
        nativePayload = request.payload;
        nativeRevision += 1;
      }
    }
    return {
      ...ctx.ready(request),
      revision: nativeRevision,
      lease: nativeLease,
      payload: nativePayload,
    };
  });
  const runtime = createReviewSessionRuntime({ ...ctx.ports, connected: () => connected });
  await runtime.open();
  runtime.setPosition({ x: 30, y: 40 });
  await runtime.flush();
  expect(nativeRevision).toBe(5);
  connected = false;
  nativeRevision = 17;
  nativeLease = newLease;
  runtime.setPanelOpen(false);
  await runtime.flush();
  expect(ctx.ports.request.mock.calls.map(([request]) => request.kind)).toEqual([
    'open',
    'save',
    'open',
    'save',
  ]);
  expect(ctx.ports.request.mock.calls.at(-1)![0]).toMatchObject({
    kind: 'save',
    expectedRevision: 17,
    lease: newLease,
  });
  expect(JSON.parse(nativePayload)).toMatchObject({ panelOpen: false, position: { x: 30, y: 40 } });
  expect(runtime.getSnapshot().error).toBe(false);
});

it('recognizes lost acknowledgement without a duplicate mutation', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  const server = ctx.ports.request.getMockImplementation()!;
  const accepted = deferred<void>();
  const replyLost = deferred<DesignReviewSessionReply>();
  ctx.ports.request.mockImplementationOnce(async (request) => {
    await server(request);
    accepted.resolve();
    return replyLost.promise;
  });
  ctx.runtime.setPosition({ x: 44, y: 88 });
  await accepted.promise;
  expect(JSON.parse(ctx.saved()).position).toEqual({ x: 44, y: 88 });
  replyLost.reject(new Error('Worker disconnected before acknowledgement'));
  await settled(ctx.runtime, true);
  expect(ctx.runtime.getSnapshot().error).toBe(true);
  await ctx.runtime.retry();
  expect(ctx.runtime.getSnapshot()).toMatchObject({ error: false, position: { x: 44, y: 88 } });
  expect(ctx.ports.request.mock.calls.map(([request]) => request.kind)).toEqual([
    'open',
    'save',
    'open',
  ]);
  await ctx.runtime.flush();
  expect(ctx.ports.request.mock.calls.filter(([request]) => request.kind === 'save')).toHaveLength(
    1
  );
});

it('preserves dirty feedback on a conflicting remote session', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  ctx.ports.request.mockImplementationOnce(async () => {
    throw new Error('Save connection failed');
  });
  ctx.setAnnotations([record(pageA, 'Local feedback awaiting save')]);
  ctx.runtime.changed();
  await settled(ctx.runtime, true);
  const conflictingPayload = JSON.stringify({
    ...ctx.initial,
    entries: [
      { ...ctx.initial.entries[0]!, record: record(pageA, 'Feedback from another document') },
    ],
  });
  ctx.ports.request.mockImplementation(async (request) => ({
    ...ctx.ready(request),
    revision: 8,
    payload: conflictingPayload,
  }));
  await expect(ctx.runtime.retry()).rejects.toThrow('Review session changed in another document');
  expect(ctx.runtime.getSnapshot()).toMatchObject({
    error: true,
    records: [
      expect.objectContaining({
        record: expect.objectContaining({ comment: 'Local feedback awaiting save' }),
      }),
    ],
  });
  expect(ctx.ports.request.mock.calls.map(([request]) => request.kind)).toEqual([
    'open',
    'save',
    'open',
  ]);
  await expect(ctx.runtime.retry()).rejects.toThrow('Review session changed in another document');
  expect(ctx.ports.request.mock.calls.filter(([request]) => request.kind === 'save')).toHaveLength(
    1
  );
  expect(ctx.runtime.document().entries[0]!.record.comment).toBe('Local feedback awaiting save');
});

it('persists local feedback after initial admission failure and empty-session retry', async () => {
  const ctx = setup();
  const annotations = createBrowserAnnotationSession();
  const target = document.createElement('button');
  let nativePayload: string | undefined;
  let nativeRevision = 0;
  ctx.ports.request.mockImplementation(async (request) => {
    if (request.kind === 'save' || request.kind === 'clear') {
      nativePayload = request.payload;
      nativeRevision += 1;
    }
    return {
      requestId: request.requestId,
      status: 'ready',
      lease,
      revision: nativeRevision,
      available: false,
      ...(nativePayload === undefined ? {} : { payload: nativePayload }),
    };
  });
  ctx.ports.request.mockImplementationOnce(async () => {
    throw new Error('Session storage unavailable');
  });
  const runtime = createReviewSessionRuntime({ ...ctx.ports, annotations, resolve: () => target });
  await expect(runtime.open()).rejects.toThrow('Session storage unavailable');
  runtime.setMode(true, 'comment');
  annotations.setComment({
    target,
    evidence: record().evidence,
    comment: 'Accepted before storage recovered',
  });
  runtime.changed();
  expect(annotations.captureSnapshot().domRecords[0]!.comment).toBe(
    'Accepted before storage recovered'
  );
  await runtime.retry();
  await runtime.flush();
  expect(runtime.getSnapshot()).toMatchObject({
    active: true,
    error: false,
    records: [
      expect.objectContaining({
        record: expect.objectContaining({ comment: 'Accepted before storage recovered' }),
      }),
    ],
  });
  expect(nativePayload).toBeDefined();
  expect(JSON.parse(nativePayload!)).toMatchObject({
    enabled: true,
    tool: 'comment',
    entries: [
      expect.objectContaining({
        record: expect.objectContaining({ comment: 'Accepted before storage recovered' }),
      }),
    ],
  });
  expect(ctx.ports.request.mock.calls.map(([request]) => request.kind)).toEqual([
    'open',
    'open',
    'save',
  ]);
});

it('fences metadata writes after conflicting admission to preserve canonical deletion', async () => {
  const ctx = setup();
  await ctx.runtime.open();
  ctx.ports.request.mockImplementationOnce(async () => {
    throw new Error('Save connection failed');
  });
  ctx.setAnnotations([record(pageA, 'Local feedback awaiting save')]);
  ctx.runtime.changed();
  await settled(ctx.runtime, true);
  let canonical = JSON.stringify({ ...ctx.initial, entries: [] });
  const deletedCanonical = canonical;
  let nativeRevision = 10;
  ctx.ports.request.mockImplementation(async (request) => {
    if (request.kind === 'save' || request.kind === 'clear') {
      canonical = request.payload;
      nativeRevision += 1;
    }
    return {
      ...ctx.ready(request),
      lease: '12345678-1234-4234-8234-123456789abf',
      revision: nativeRevision,
      payload: canonical,
    };
  });
  await expect(ctx.runtime.retry()).rejects.toThrow('Review session changed in another document');
  ctx.runtime.setPosition({ x: 111, y: 222 });
  await ctx.runtime.flush().catch(() => undefined);
  expect(ctx.ports.request.mock.calls.filter(([request]) => request.kind === 'save')).toHaveLength(
    1
  );
  expect(canonical).toBe(deletedCanonical);
  expect(ctx.runtime.getSnapshot().error).toBe(true);
  expect(ctx.runtime.exportSnapshot().snapshot.domRecords[0]!.comment).toBe(
    'Local feedback awaiting save'
  );
});

it('fences metadata writes after saved binding disappears and retains export data', async () => {
  const ctx = setup();
  let connected = true;
  let canonical: string | undefined = JSON.stringify(ctx.initial);
  let nativeRevision = 4;
  let nativeLease = lease;
  ctx.ports.request.mockImplementation(async (request) => {
    if (request.kind === 'open') connected = true;
    if (request.kind === 'save' || request.kind === 'clear') {
      canonical = request.payload;
      nativeRevision += 1;
    }
    return {
      requestId: request.requestId,
      status: 'ready',
      lease: nativeLease,
      revision: nativeRevision,
      available: false,
      ...(canonical === undefined ? {} : { payload: canonical }),
    };
  });
  const runtime = createReviewSessionRuntime({ ...ctx.ports, connected: () => connected });
  await runtime.open();
  runtime.setPosition({ x: 77, y: 88 });
  await runtime.flush();
  expect(ctx.ports.request.mock.calls.filter(([request]) => request.kind === 'save')).toHaveLength(
    1
  );
  canonical = undefined;
  nativeRevision = 0;
  nativeLease = '12345678-1234-4234-8234-123456789abf';
  connected = false;
  await runtime.retry().catch(() => undefined);
  runtime.setPosition({ x: 222, y: 333 });
  await runtime.flush().catch(() => undefined);
  expect(ctx.ports.request.mock.calls.filter(([request]) => request.kind === 'save')).toHaveLength(
    1
  );
  expect(canonical).toBeUndefined();
  expect(runtime.getSnapshot().error).toBe(true);
  expect(runtime.exportSnapshot().snapshot.domRecords[0]!.comment).toBe('Accepted feedback');
});

it('fences dirty writer when identity changes with the same canonical payload', async () => {
  const ctx = setup();
  const sessionA = '12345678-1234-4234-8234-123456789ac1';
  const sessionB = '12345678-1234-4234-8234-123456789ac2';
  const newLease = '12345678-1234-4234-8234-123456789ac3';
  const acknowledgedPayload = ctx.saved();
  let connected = true;
  const server = ctx.ports.request.getMockImplementation()!;
  ctx.ports.request.mockImplementation(async (request) => ({
    ...(await server(request)),
    sessionId: sessionA,
  }));
  const runtime = createReviewSessionRuntime({ ...ctx.ports, connected: () => connected });
  await runtime.open();
  ctx.ports.request.mockImplementationOnce(async () => {
    throw new Error('Save failed before acknowledgement');
  });
  ctx.setAnnotations([record(pageA, 'Local edit owned by session A')]);
  runtime.changed();
  await settled(runtime, true);
  connected = false;
  ctx.ports.request.mockImplementation(async (request) => {
    if (request.kind === 'open') connected = true;
    return {
      ...ctx.ready(request),
      sessionId: sessionB,
      lease: newLease,
      revision: 0,
      payload: acknowledgedPayload,
    };
  });
  await expect(runtime.retry()).rejects.toThrow('Review session changed in another document');
  runtime.setPosition({ x: 99, y: 199 });
  await runtime.flush().catch(() => undefined);
  expect(ctx.ports.request.mock.calls.filter(([request]) => request.kind === 'save')).toHaveLength(
    1
  );
  expect(runtime.getSnapshot().error).toBe(true);
  expect(runtime.exportSnapshot().snapshot.domRecords[0]!.comment).toBe(
    'Local edit owned by session A'
  );
});

it('adopts a new canonical session when clean without replaying old annotation data', async () => {
  const ctx = setup();
  const sessionA = '12345678-1234-4234-8234-123456789ac1';
  const sessionB = '12345678-1234-4234-8234-123456789ac2';
  let connected = true;
  const server = ctx.ports.request.getMockImplementation()!;
  ctx.ports.request.mockImplementation(async (request) => ({
    ...(await server(request)),
    sessionId: sessionA,
  }));
  const runtime = createReviewSessionRuntime({ ...ctx.ports, connected: () => connected });
  await runtime.open();
  const canonical = JSON.stringify({
    ...ctx.initial,
    entries: [{ ...ctx.initial.entries[0]!, record: record(pageA, 'New canonical feedback') }],
  });
  connected = false;
  ctx.ports.request.mockImplementation(async (request) => {
    if (request.kind === 'open') connected = true;
    return { ...ctx.ready(request), sessionId: sessionB, revision: 0, payload: canonical };
  });
  await runtime.retry();
  expect(runtime.getSnapshot().records[0]!.record.comment).toBe('New canonical feedback');
  const exported = runtime.exportSnapshot();
  await runtime.flush();
  expect(exported.snapshot.domRecords[0]!.comment).toBe('New canonical feedback');
  expect(ctx.ports.request.mock.calls.filter(([request]) => request.kind === 'save')).toHaveLength(
    0
  );
  expect(runtime.getSnapshot().error).toBe(false);
});
