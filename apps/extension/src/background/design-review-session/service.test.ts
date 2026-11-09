import { expect, it, vi } from 'vitest';
import {
  installPersistenceLockManagerForTests,
  runWithAtomicPersistenceMutationPermit,
} from '../../composition/persistence/infrastructure/mutation-barrier';
import { DesignReviewSessionService } from './service';
import { DesignReviewSessionStorage } from '../storage/design-review-session';
import type {
  DesignReviewSessionRequest,
  DesignReviewSessionReply,
} from '../../contracts/design-review-session';
function area() {
  let data: Record<string, unknown> = {};
  return {
    get: vi.fn(async () => structuredClone(data)),
    set: vi.fn(async (items: Record<string, unknown>) => {
      data = { ...data, ...structuredClone(items) };
    }),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
    clear: () => {
      data = {};
    },
    read: () => structuredClone(data),
  };
}
function fixture() {
  const local = area();
  const session = area();
  const current = vi.fn(async () => true);
  const create = () =>
    new DesignReviewSessionService({
      storage: new DesignReviewSessionStorage(local, session),
      isCurrentDocument: current,
    });
  const service = create();
  const connect = (tabId = 1, documentId = 'document-one') =>
    service.connect({ tabId, documentId });
  return { local, session, current, service, connect, create };
}
const authored = (comment: string) => JSON.stringify({ enabled: true, entries: [{ comment }] });
const open = () => ({ requestId: crypto.randomUUID(), kind: 'open' as const });
function mutate(
  reply: DesignReviewSessionReply,
  payload = 'authored',
  kind: 'save' | 'clear' = 'save'
): DesignReviewSessionRequest {
  return {
    requestId: crypto.randomUUID(),
    kind,
    lease: reply.lease!,
    expectedRevision: reply.revision,
    payload,
  };
}
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
it('opens read-only without creating a project or tab binding', async () => {
  const f = fixture();
  expect(await f.connect().request(open())).toMatchObject({
    status: 'ready',
    revision: 0,
    available: false,
  });
  expect(f.local.set).not.toHaveBeenCalled();
  expect(f.session.set).not.toHaveBeenCalled();
});
it('serializes parallel writers', async () => {
  const f = fixture();
  const connection = f.connect();
  const opened = await connection.request(open());
  const entered = gate();
  const finish = gate();
  const original = f.local.set.getMockImplementation()!;
  f.local.set.mockImplementationOnce(async (data) => {
    entered.release();
    await finish.promise;
    await original(data);
  });
  const first = connection.request(mutate(opened, 'first'));
  await entered.promise;
  const second = connection.request(mutate(opened, 'second'));
  finish.release();
  expect((await first).status).toBe('ready');
  expect((await second).status).toBe('stale');
  expect(await connection.request(open())).toMatchObject({ payload: 'first', revision: 1 });
});
it('refuses delayed writes after clear', async () => {
  const f = fixture();
  const connection = f.connect();
  const saved = await connection.request(mutate(await connection.request(open())));
  const entered = gate();
  const finish = gate();
  const original = f.local.set.getMockImplementation()!;
  f.local.set.mockImplementationOnce(async (data) => {
    entered.release();
    await finish.promise;
    await original(data);
  });
  const clear = connection.request(mutate(saved, 'empty-state', 'clear'));
  await entered.promise;
  const delayed = connection.request(mutate(saved, 'late-preview'));
  finish.release();
  const cleared = await clear;
  expect(cleared.status).toBe('ready');
  expect(cleared.lease).not.toBe(saved.lease);
  expect((await delayed).status).toBe('refused');
  expect(await connection.request(open())).toMatchObject({ payload: 'empty-state', revision: 2 });
  expect((await connection.request(mutate(cleared, 'new-note'))).status).toBe('ready');
});
it('preserves acknowledged data after failed write and retry', async () => {
  const f = fixture();
  const connection = f.connect();
  const saved = await connection.request(mutate(await connection.request(open()), 'accepted'));
  f.local.set.mockRejectedValueOnce(new Error('storage unavailable'));
  expect((await connection.request(mutate(saved, 'failed'))).status).toBe('failed');
  expect(await connection.request(open())).toMatchObject({
    payload: 'accepted',
    revision: saved.revision,
  });
  expect((await connection.request(mutate(saved, 'retried'))).status).toBe('ready');
  expect((await connection.request(mutate(saved, 'blind-retry'))).status).toBe('stale');
});
it('retries creation after a failed binding or local write without replacing accepted records', async () => {
  const f = fixture();
  const connection = f.connect();
  const opened = await connection.request(open());
  f.session.set.mockRejectedValueOnce(new Error('session unavailable'));
  expect((await connection.request(mutate(opened))).status).toBe('failed');
  expect(f.local.read()).toEqual({});
  f.local.set.mockRejectedValueOnce(new Error('local unavailable'));
  expect((await connection.request(mutate(opened))).status).toBe('failed');
  expect(f.local.read()).toEqual({});
  expect((await connection.request(mutate(opened, 'retry'))).status).toBe('ready');
  expect((await connection.request(open())).payload).toBe('retry');
});
it('restores tab binding after worker restart', async () => {
  const f = fixture();
  const connection = f.connect();
  const saved = await connection.request(mutate(await connection.request(open())));
  const worker = f.create();
  const fresh = worker.connect({ tabId: 1, documentId: 'document-one' });
  const restored = await fresh.request(open());
  expect(restored).toMatchObject({ payload: 'authored', revision: 1 });
  expect(restored.lease).not.toBe(saved.lease);
  expect((await fresh.request(mutate(saved))).status).toBe('refused');
});
it('rejects old document after navigation', async () => {
  const f = fixture();
  const old = f.connect();
  const saved = await old.request(mutate(await old.request(open())));
  f.service.navigate(1, 'document-two');
  expect((await old.request(mutate(saved, 'old'))).status).toBe('refused');
  expect(await f.connect(1, 'document-two').request(open())).toMatchObject({
    payload: 'authored',
    revision: 1,
  });
  f.current.mockResolvedValue(false);
  expect((await f.connect(2, 'missed-navigation').request(open())).status).toBe('refused');
});
it('isolates native tabs and explicitly resumes detached sessions after close or browser restart', async () => {
  const f = fixture();
  const first = f.connect();
  await first.request(mutate(await first.request(open()), authored('first')));
  const other = f.connect(2);
  const empty = await other.request(open());
  expect(empty.payload).toBeUndefined();
  expect(empty.available).toBe(false);
  await f.service.forgetTab(1);
  const available = await other.request(open());
  expect(available.available).toBe(true);
  expect(available.payload).toBeUndefined();
  const resumed = await other.request({
    requestId: crypto.randomUUID(),
    kind: 'resume',
    lease: available.lease!,
    expectedRevision: 0,
  });
  expect(resumed).toMatchObject({ status: 'ready', payload: authored('first'), revision: 1 });
  expect(
    (
      await other.request({
        requestId: crypto.randomUUID(),
        kind: 'resume',
        lease: resumed.lease!,
        expectedRevision: 1,
      })
    ).status
  ).toBe('refused');
  f.session.clear();
  const browser = f.create().connect({ tabId: 3, documentId: 'new-browser' });
  const reopened = await browser.request(open());
  expect(reopened).toMatchObject({ available: true, revision: 0 });
  expect(reopened.payload).toBeUndefined();
  expect(
    (
      await browser.request({
        requestId: crypto.randomUUID(),
        kind: 'resume',
        lease: reopened.lease!,
        expectedRevision: 0,
      })
    ).payload
  ).toBe(authored('first'));
});
it('retains previous detached sessions and refuses new creation at capacity', async () => {
  const f = fixture();
  for (let tab = 0; tab < 128; tab++) {
    const connection = f.connect(tab);
    expect(
      (await connection.request(mutate(await connection.request(open()), authored(`note-${tab}`))))
        .status
    ).toBe('ready');
    await f.service.forgetTab(tab);
  }
  const before = f.local.read();
  const connection = f.connect(999);
  const opened = await connection.request(open());
  expect((await connection.request(mutate(opened, 'overflow'))).status).toBe('refused');
  expect(f.local.read()).toEqual(before);
  expect(
    (
      await connection.request({
        requestId: crypto.randomUUID(),
        kind: 'resume',
        lease: opened.lease!,
        expectedRevision: 0,
      })
    ).payload
  ).toBe(authored('note-127'));
});
it('does not recreate an erased session', async () => {
  const f = fixture();
  const connection = f.connect();
  const opened = await connection.request(open());
  const entered = gate();
  const finish = gate();
  const original = f.local.set.getMockImplementation()!;
  f.local.set.mockImplementationOnce(async (data) => {
    entered.release();
    await finish.promise;
    await original(data);
  });
  const writing = connection.request(mutate(opened));
  await entered.promise;
  const exclusion = f.service.reserveErasureExclusion();
  const delayed = connection.request(mutate(opened, 'resurrection'));
  const opening = f.connect(2).request(open());
  const drained = exclusion.waitForActiveMutations();
  finish.release();
  await writing;
  await drained;
  expect((await delayed).status).toBe('refused');
  expect((await opening).status).toBe('refused');
  expect(await f.service.cleanup()).toMatchObject([
    { id: 'design-review-session-runtime-state', status: 'verified-empty' },
  ]);
  f.local.clear();
  f.session.clear();
  exclusion.release();
  expect((await connection.request(mutate(opened))).status).toBe('refused');
  expect(f.local.read()).toEqual({});
  const fresh = f.connect();
  expect((await fresh.request(mutate(await fresh.request(open()), 'new-lifetime'))).status).toBe(
    'ready'
  );
});
it('selects the last closed session while retaining earlier detached records', async () => {
  const f = fixture();
  const first = f.connect();
  const second = f.connect(2);
  await second.request(mutate(await second.request(open()), authored('older-write-closed-last')));
  await first.request(mutate(await first.request(open()), authored('newer-write-closed-first')));
  await f.service.forgetTab(1);
  await f.service.forgetTab(2);
  const next = f.connect(3);
  const opened = await next.request(open());
  expect(
    (
      await next.request({
        requestId: crypto.randomUUID(),
        kind: 'resume',
        lease: opened.lease!,
        expectedRevision: 0,
      })
    ).payload
  ).toBe(authored('older-write-closed-last'));
  const remaining = f.connect(4);
  const available = await remaining.request(open());
  expect(
    (
      await remaining.request({
        requestId: crypto.randomUUID(),
        kind: 'resume',
        lease: available.lease!,
        expectedRevision: 0,
      })
    ).payload
  ).toBe(authored('newer-write-closed-first'));
});

it('reads only bound enabled sessions for navigation restoration without creating records', async () => {
  const f = fixture();
  expect(await f.service.shouldRestore(1)).toBe(false);
  expect(f.local.set).not.toHaveBeenCalled();
  expect(f.session.set).not.toHaveBeenCalled();
  const connection = f.connect();
  const opened = await connection.request(open());
  const active = await connection.request(
    mutate(opened, JSON.stringify({ enabled: true, entries: [] }))
  );
  const before = f.local.read();
  const writes = f.local.set.mock.calls.length;
  expect(await f.service.shouldRestore(1)).toBe(true);
  expect(await f.service.shouldRestore(2)).toBe(false);
  expect(f.local.read()).toEqual(before);
  expect(f.local.set).toHaveBeenCalledTimes(writes);
  const disabled = await connection.request(mutate(active, JSON.stringify({ enabled: false })));
  expect(await f.service.shouldRestore(1)).toBe(false);
  await connection.request(mutate(disabled, 'malformed opaque payload'));
  expect(await f.service.shouldRestore(1)).toBe(false);
  await f.service.forgetTab(1);
  expect(await f.service.shouldRestore(1)).toBe(false);
});

it('resumes a detached session from an enabled empty current session and retains both records', async () => {
  const f = fixture();
  const previous = f.connect();
  const previousPayload = JSON.stringify({
    enabled: true,
    entries: [{ comment: 'retained feedback' }],
  });
  await previous.request(mutate(await previous.request(open()), previousPayload));
  await f.service.forgetTab(1);
  const current = f.connect(2);
  const empty = await current.request(
    mutate(await current.request(open()), JSON.stringify({ enabled: true, entries: [] }))
  );
  const before = f.local.read();
  const resumed = await current.request({
    requestId: crypto.randomUUID(),
    kind: 'resume',
    lease: empty.lease!,
    expectedRevision: empty.revision,
  });
  expect(resumed).toMatchObject({ status: 'ready', payload: previousPayload });
  expect(resumed.lease).not.toBe(empty.lease);
  expect(f.local.read()).toEqual(before);
  expect((await current.request(mutate(empty, 'late empty-session save'))).status).toBe('refused');
  expect((await current.request(open())).payload).toBe(previousPayload);
});
it('refuses resume over authored or unrecognized current entries and preserves both sessions', async () => {
  const f = fixture();
  const previous = f.connect();
  await previous.request(
    mutate(
      await previous.request(open()),
      JSON.stringify({ enabled: true, entries: [{ comment: 'detached feedback' }] })
    )
  );
  await f.service.forgetTab(1);
  const current = f.connect(2);
  let saved = await current.request(open());
  for (const payload of [
    JSON.stringify({ enabled: true, entries: [{ comment: 'current feedback' }] }),
    'invalid payload',
    JSON.stringify({ enabled: true }),
  ]) {
    saved = await current.request(mutate(saved, payload));
    const before = f.local.read();
    const resumed = await current.request({
      requestId: crypto.randomUUID(),
      kind: 'resume',
      lease: saved.lease!,
      expectedRevision: saved.revision,
    });
    expect(resumed.status).toBe('refused');
    expect(f.local.read()).toEqual(before);
    expect((await current.request(open())).payload).toBe(payload);
  }
});

it('offers the last authored session across empty detached activations', async () => {
  const f = fixture();
  const previous = f.connect();
  await previous.request(
    mutate(await previous.request(open()), authored('last authored feedback'))
  );
  await f.service.forgetTab(1);
  const empty = f.connect(2);
  await empty.request(
    mutate(await empty.request(open()), JSON.stringify({ enabled: true, entries: [] }))
  );
  await f.service.forgetTab(2);
  const before = f.local.read();
  const next = f.connect(3);
  const opened = await next.request(open());
  expect(opened.available).toBe(true);
  const resumed = await next.request({
    requestId: crypto.randomUUID(),
    kind: 'resume',
    lease: opened.lease!,
    expectedRevision: 0,
  });
  expect(resumed).toMatchObject({ status: 'ready', payload: authored('last authored feedback') });
  expect(f.local.read()).toEqual(before);
  expect((await f.connect(4).request(open())).available).toBe(false);
});

it('opens read-only while unrelated exclusive persistence maintenance is active', async () => {
  const f = fixture();
  const entered = gate();
  const finish = gate();
  installPersistenceLockManagerForTests(null);
  const maintenance = runWithAtomicPersistenceMutationPermit(async () => {
    entered.release();
    await finish.promise;
  });
  await entered.promise;
  try {
    const opened = await f.connect().request(open());
    expect(opened.status).toBe('ready');
    expect(f.local.set).not.toHaveBeenCalled();
    expect(f.session.set).not.toHaveBeenCalled();
    const exclusion = f.service.reserveErasureExclusion();
    try {
      expect((await f.connect(2).request(open())).status).toBe('refused');
      expect(f.local.set).not.toHaveBeenCalled();
      expect(f.session.set).not.toHaveBeenCalled();
    } finally {
      exclusion.release();
    }
  } finally {
    finish.release();
    await maintenance;
    installPersistenceLockManagerForTests(null);
  }
});

it('changes session identity after same-tab erasure and recreation with identical payload', async () => {
  const f = fixture();
  const original = f.connect();
  const opened = await original.request(open());
  expect(opened.sessionId).toBeNull();
  const payload = authored('identical feedback');
  const saved = await original.request(mutate(opened, payload));
  expect(saved.sessionId).toEqual(expect.any(String));
  expect((await original.request(open())).sessionId).toBe(saved.sessionId);
  const exclusion = f.service.reserveErasureExclusion();
  await exclusion.waitForActiveMutations();
  await f.service.cleanup();
  f.local.clear();
  f.session.clear();
  exclusion.release();
  const replacement = f.connect();
  const empty = await replacement.request(open());
  expect(empty.sessionId).toBeNull();
  const recreated = await replacement.request(mutate(empty, payload));
  expect(recreated.revision).toBe(saved.revision);
  expect(recreated.sessionId).toEqual(expect.any(String));
  expect(recreated.sessionId).not.toBe(saved.sessionId);
  expect((await replacement.request(mutate(saved, 'late cached producer'))).status).toBe('refused');
  expect((await original.request(mutate(saved, 'old connection'))).status).toBe('refused');
  expect((await replacement.request(open())).payload).toBe(payload);
  const cleared = await replacement.request(
    mutate(recreated, JSON.stringify({ enabled: true, entries: [] }), 'clear')
  );
  expect(cleared.sessionId).toBe(recreated.sessionId);
});
it('returns the detached session identity only after explicit resume', async () => {
  const f = fixture();
  const original = f.connect();
  const saved = await original.request(
    mutate(await original.request(open()), authored('resume identity'))
  );
  await f.service.forgetTab(1);
  const replacement = f.connect(2);
  const opened = await replacement.request(open());
  expect(opened.sessionId).toBeNull();
  expect(opened.available).toBe(true);
  const resumed = await replacement.request({
    requestId: crypto.randomUUID(),
    kind: 'resume',
    lease: opened.lease!,
    expectedRevision: 0,
  });
  expect(resumed.sessionId).toBe(saved.sessionId);
  expect((await replacement.request(open())).sessionId).toBe(saved.sessionId);
});
