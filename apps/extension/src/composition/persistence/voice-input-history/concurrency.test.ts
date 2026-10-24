import { expect, it } from 'vitest';
import { createHistoryFixture, deferred, publish, recording } from './test-support';

it('serializes parallel factories without losing captures or publications', async () => {
  const fixture = createHistoryFixture();
  const left = fixture.create();
  const right = fixture.create();
  await left.initialize();
  const [a, b] = await Promise.all([left.beginCapture(), right.beginCapture()]);
  await Promise.all([right.publishAudio(b, recording('b')), left.publishAudio(a, recording('a'))]);
  expect((await left.list()).map((entry) => entry.sequence)).toEqual([2, 1]);
});

it('refuses queued opening after erase changes the observed epoch', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const entered = deferred();
  const release = deferred();
  const held = fixture.withLock(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const erased = history.erase();
  // Observe admission reads deterministically before releasing the owner lock.
  const read = deferred();
  const originalRead = fixture.catalog.read.getMockImplementation()!;
  fixture.catalog.read.mockImplementationOnce(async () => {
    const value = await originalRead();
    read.resolve();
    return value;
  });
  const opening = history.beginCapture();
  await read.promise;
  release.resolve();
  await held;
  await erased;
  await expect(opening).rejects.toMatchObject({ code: 'stale' });
});

it('rejects late publication and processing results after erase', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const scope = await publish(history);
  const token = await history.beginCapture();
  await history.erase();
  await expect(history.publishAudio(token, recording())).rejects.toMatchObject({ code: 'stale' });
  await expect(history.saveRawTranscript(scope, 'late')).rejects.toMatchObject({ code: 'stale' });
  await expect(
    history.complete(scope, { rawTranscript: 'late', transcript: 'late', correctionStatus: 'off' })
  ).rejects.toMatchObject({ code: 'stale' });
  expect(await history.verifyEmpty()).toBe(true);
});

it('consumes capture admission so deleted and evicted audio cannot be republished', async () => {
  const history = createHistoryFixture().create();
  await history.initialize();
  const token = await history.beginCapture();
  const scope = await history.publishAudio(token, recording());
  await history.remove(scope);
  await expect(history.publishAudio(token, recording())).rejects.toMatchObject({ code: 'stale' });
  const evicted = await history.beginCapture();
  await history.publishAudio(evicted, recording());
  for (let i = 0; i < 20; i++) await publish(history);
  await expect(history.publishAudio(evicted, recording())).rejects.toMatchObject({ code: 'stale' });
});

it('protects recreated identity with a new incarnation from old complete and remove', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const old = await publish(history);
  await history.remove(old);
  const nextToken = await history.beginCapture();
  const catalog = fixture.peek()!;
  catalog.captures[0]!.entryId = old.entryId;
  fixture.replace(catalog);
  const current = await history.publishAudio(
    { ...nextToken, entryId: old.entryId },
    recording('replacement')
  );
  await expect(
    history.complete(old, { rawTranscript: 'late', transcript: 'late', correctionStatus: 'off' })
  ).rejects.toMatchObject({ code: 'stale' });
  await expect(history.remove(old)).rejects.toMatchObject({ code: 'stale' });
  expect(await history.get(current)).toMatchObject({ incarnation: nextToken.incarnation });
});

it('advances retry revisions and rejects a prior result while preserving raw transcript', async () => {
  const history = createHistoryFixture().create();
  await history.initialize();
  const first = await history.beginProcessing(await publish(history));
  const raw = await history.saveRawTranscript(first, 'accepted raw');
  const retry = await history.beginProcessing(raw);
  await expect(
    history.complete(first, { rawTranscript: 'old', transcript: 'old', correctionStatus: 'off' })
  ).rejects.toMatchObject({ code: 'stale' });
  expect(await history.get(retry)).toMatchObject({
    rawTranscript: 'accepted raw',
    status: 'processing',
  });
});

it('retires only oldest uncommitted admission without affecting accepted recordings', async () => {
  const history = createHistoryFixture().create();
  await history.initialize();
  const scope = await publish(history);
  const retired = await history.beginCapture();
  for (let i = 0; i < 20; i++) await history.beginCapture();
  await expect(history.publishAudio(retired, recording())).rejects.toMatchObject({ code: 'stale' });
  expect(await history.get(scope)).toMatchObject({ status: 'recorded' });
});

it('refuses a queued processing completion after deletion commits first', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const scope = await history.beginProcessing(await publish(history));
  const entered = deferred();
  const release = deferred();
  const held = fixture.withLock(async () => {
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const removed = history.remove(scope);
  const completed = history.complete(scope, {
    rawTranscript: 'late',
    transcript: 'late',
    correctionStatus: 'off',
  });
  release.resolve();
  await held;
  await removed;
  await expect(completed).rejects.toMatchObject({ code: 'stale' });
  expect(await history.list()).toEqual([]);
});

it('rejects audio read delivery when deletion commits while bytes are loading', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const scope = await publish(history);
  const entered = deferred();
  const release = deferred();
  const file = [...fixture.files.values()][0]!;
  fixture.audio.read.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
    return file;
  });
  const loading = history.readAudio(scope);
  await entered.promise;
  await history.remove(scope);
  release.resolve();
  await expect(loading).rejects.toMatchObject({ code: 'stale' });
});

it('waits for active publication before admission recovery and preserves its committed audio', async () => {
  const fixture = createHistoryFixture();
  const writer = fixture.create();
  const opener = fixture.create();
  await writer.initialize();
  const token = await writer.beginCapture();
  const entered = deferred();
  const release = deferred();
  const write = fixture.audio.write.getMockImplementation()!;
  fixture.audio.write.mockImplementationOnce(async (identity, blob) => {
    await write(identity, blob);
    entered.resolve();
    await release.promise;
  });
  const publishing = writer.publishAudio(token, recording('active audio'));
  await entered.promise;
  const observed = deferred();
  const read = fixture.catalog.read.getMockImplementation()!;
  fixture.catalog.read.mockImplementationOnce(async () => {
    const catalog = await read();
    observed.resolve();
    return catalog;
  });
  const opening = opener.beginCapture();
  await observed.promise;
  expect(fixture.audio.remove).not.toHaveBeenCalled();
  release.resolve();
  const accepted = await publishing;
  const next = await opening;
  expect(await (await opener.readAudio(accepted)).text()).toBe('active audio');
  expect(fixture.audio.remove).not.toHaveBeenCalled();
  await opener.publishAudio(next, recording('next audio'));
  expect(await writer.list()).toHaveLength(2);
});

it('removes legacy Chrome rows and bytes without changing model identity and rejects late Chrome writers', async () => {
  const f = createHistoryFixture();
  const h = f.create();
  await h.initialize();
  const model = await publish(h, 'model');
  const old = await publish(h, 'chrome');
  const catalog = f.peek()!;
  catalog.entries.find((entry) => entry.entryId === old.entryId)!.backend = 'browser';
  f.replace(catalog);
  const pending = await h.beginCapture();
  await h.initialize();
  expect(await h.list()).toEqual([await h.get(model)]);
  expect(f.files.size).toBe(1);
  await expect(
    h.complete(old, { rawTranscript: 'late', transcript: 'late', correctionStatus: 'off' })
  ).rejects.toMatchObject({ code: 'stale' });
  await expect(
    h.publishAudio(pending, { ...recording(), backend: 'browser' })
  ).rejects.toMatchObject({ code: 'stale' });
});

it('serializes legacy cleanup before a delayed Chrome result while preserving a parallel model capture', async () => {
  const f = createHistoryFixture();
  const cleanupOwner = f.create();
  const writer = f.create();
  await cleanupOwner.initialize();
  const old = await publish(writer, 'chrome');
  const catalog = f.peek()!;
  catalog.entries[0]!.backend = 'browser';
  f.replace(catalog);
  const entered = deferred();
  const release = deferred();
  const write = f.catalog.write.getMockImplementation()!;
  f.catalog.write.mockImplementationOnce(async (...args) => {
    entered.resolve();
    await release.promise;
    await write(...args);
  });
  const cleanup = cleanupOwner.initialize();
  await entered.promise;
  const late = writer.complete(old, {
    rawTranscript: 'late',
    transcript: 'late',
    correctionStatus: 'off',
  });
  const lateProof = expect(late).rejects.toMatchObject({ code: 'stale' });
  const modelCapture = writer.beginCapture();
  release.resolve();
  await cleanup;
  await lateProof;
  const current = await writer.publishAudio(await modelCapture, recording('model'));
  expect(await writer.list()).toEqual([await writer.get(current)]);
  expect(f.files.size).toBe(1);
});
