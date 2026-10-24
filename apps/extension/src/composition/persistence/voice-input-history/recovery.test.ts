import { expect, it } from 'vitest';
import { createHistoryFixture, deferred, publish, recording } from './test-support';

it('preserves accepted data on metadata failure and permits explicit orphan recovery', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const accepted = await publish(history);
  const token = await history.beginCapture();
  fixture.catalog.write.mockRejectedValueOnce(new Error('write'));
  await expect(history.publishAudio(token, recording('pending'))).rejects.toMatchObject({
    code: 'storage-failed',
  });
  expect(await history.list()).toHaveLength(1);
  expect(fixture.files.size).toBe(2);
  await expect(history.publishAudio(token, recording('pending'))).rejects.toMatchObject({
    code: 'storage-failed',
  });
  await history.recover();
  expect(fixture.files.size).toBe(1);
  expect(await history.get(accepted)).toMatchObject({ status: 'recorded' });
  await history.publishAudio(token, recording('pending'));
  expect(await history.list()).toHaveLength(2);
});

it('retries committed deletion intent after the visible entry is gone', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const scope = await publish(history);
  fixture.audio.remove.mockRejectedValueOnce(new Error('unlink'));
  await expect(history.remove(scope)).rejects.toMatchObject({ code: 'storage-failed' });
  expect(await history.list()).toEqual([]);
  expect(fixture.peek()?.pendingDeletes).toHaveLength(1);
  await history.remove(scope);
  expect(await history.verifyEmpty()).toBe(true);
});

it('refuses retained byte growth until pending physical deletion succeeds', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  for (let i = 0; i < 20; i++) await publish(history);
  fixture.audio.remove.mockRejectedValue(new Error('unlink'));
  await publish(history);
  expect(fixture.files.size).toBe(21);
  const before = fixture.peek();
  const count = fixture.audio.write.mock.calls.length;
  await expect(history.beginCapture()).rejects.toMatchObject({ code: 'storage-failed' });
  expect(fixture.peek()).toEqual(before);
  expect(fixture.audio.write).toHaveBeenCalledTimes(count);
  fixture.audio.remove.mockImplementation(async (identity) => {
    fixture.files.delete(identity);
  });
  await publish(history);
  expect(fixture.files.size).toBe(20);
});

it('explicit recovery does not change a live processing entry', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const scope = await history.beginProcessing(await publish(history));
  fixture.files.set('orphan', new File(['orphan'], 'orphan'));
  await history.recover();
  expect(await history.get(scope)).toMatchObject({
    status: 'processing',
    revision: scope.revision,
  });
  expect(fixture.files.size).toBe(1);
});

it('keeps cancelled in-flight publication invisible until explicit orphan recovery', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const token = await history.beginCapture();
  const entered = deferred();
  const release = deferred();
  const controller = new AbortController();
  const write = fixture.audio.write.getMockImplementation()!;
  fixture.audio.write.mockImplementationOnce(async (identity, blob) => {
    await write(identity, blob);
    entered.resolve();
    await release.promise;
  });
  const publishing = history.publishAudio(token, recording(), controller.signal);
  await entered.promise;
  controller.abort();
  release.resolve();
  await expect(publishing).rejects.toMatchObject({ code: 'stale' });
  expect(await history.list()).toEqual([]);
  expect(fixture.files.size).toBe(1);
  await history.recover();
  expect(fixture.files.size).toBe(0);
});

it('rotates epoch before failed physical erase so delayed writers cannot revive data', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const scope = await publish(history);
  const token = await history.beginCapture();
  fixture.audio.erase.mockRejectedValueOnce(new Error('erase'));
  await expect(history.erase()).rejects.toMatchObject({ code: 'storage-failed' });
  await expect(history.publishAudio(token, recording())).rejects.toMatchObject({ code: 'stale' });
  await expect(history.saveRawTranscript(scope, 'late')).rejects.toMatchObject({ code: 'stale' });
  expect(await history.list()).toEqual([]);
  expect(fixture.peek()?.pendingDeletes).toHaveLength(1);
  await history.recover();
  expect(await history.verifyEmpty()).toBe(true);
});

it('recovers cancelled publication on the next capture admission while preserving live processing', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const processing = await history.beginProcessing(await publish(history, 'accepted audio'));
  const accepted = await history.saveRawTranscript(processing, 'accepted raw');
  const original = await history.get(accepted);
  const token = await history.beginCapture();
  const entered = deferred();
  const release = deferred();
  const controller = new AbortController();
  const write = fixture.audio.write.getMockImplementation()!;
  fixture.audio.write.mockImplementationOnce(async (identity, blob) => {
    await write(identity, blob);
    entered.resolve();
    await release.promise;
  });
  const publishing = history.publishAudio(token, recording('cancelled audio'), controller.signal);
  await entered.promise;
  controller.abort();
  release.resolve();
  await expect(publishing).rejects.toMatchObject({ code: 'stale' });
  expect(fixture.files.size).toBe(2);
  expect(await history.list()).toEqual([original]);

  const next = await history.beginCapture();
  expect(fixture.files.size).toBe(1);
  expect(await history.get(accepted)).toEqual(original);
  const scope = await history.publishAudio(next, recording('next audio'));
  expect(await (await history.readAudio(scope)).text()).toBe('next audio');
  expect(await (await history.readAudio(accepted)).text()).toBe('accepted audio');
  expect(await history.get(accepted)).toEqual(original);
  expect(await history.list()).toHaveLength(2);
});

it('recovers failed metadata publication on the next capture admission without manual maintenance', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const accepted = await publish(history, 'accepted audio');
  const original = await history.get(accepted);
  const token = await history.beginCapture();
  fixture.catalog.write.mockRejectedValueOnce(new Error('metadata commit'));
  await expect(history.publishAudio(token, recording('uncommitted audio'))).rejects.toMatchObject({
    code: 'storage-failed',
  });
  expect(fixture.files.size).toBe(2);
  expect(await history.list()).toEqual([original]);

  const next = await history.beginCapture();
  expect(fixture.files.size).toBe(1);
  const scope = await history.publishAudio(next, recording('next audio'));
  expect(await (await history.readAudio(scope)).text()).toBe('next audio');
  expect(await (await history.readAudio(accepted)).text()).toBe('accepted audio');
  expect(await history.get(accepted)).toEqual(original);
  expect(fixture.files.size).toBe(2);
});

it('denies only capture admission when orphan cleanup fails and accepts an explicit retry', async () => {
  const fixture = createHistoryFixture();
  const history = fixture.create();
  await history.initialize();
  const accepted = await publish(history, 'accepted audio');
  const token = await history.beginCapture();
  fixture.catalog.write.mockRejectedValueOnce(new Error('metadata commit'));
  await expect(history.publishAudio(token, recording('orphan'))).rejects.toMatchObject({
    code: 'storage-failed',
  });
  const before = fixture.peek();
  const original = await history.get(accepted);
  const writes = fixture.audio.write.mock.calls.length;
  fixture.audio.remove.mockRejectedValueOnce(new Error('permission denied'));
  await expect(history.beginCapture()).rejects.toMatchObject({ code: 'storage-failed' });
  expect(fixture.peek()).toEqual(before);
  expect(fixture.audio.write).toHaveBeenCalledTimes(writes);
  expect(await history.list()).toEqual([original]);
  expect(await (await history.readAudio(accepted)).text()).toBe('accepted audio');

  const next = await history.beginCapture();
  expect(fixture.files.size).toBe(1);
  await history.publishAudio(next, recording('retry audio'));
  expect(await history.get(accepted)).toEqual(original);
  expect(await history.list()).toHaveLength(2);
  expect(fixture.files.size).toBe(2);
});

it('retries failed legacy Chrome deletion without losing model audio', async () => {
  const f = createHistoryFixture();
  const h = f.create();
  await h.initialize();
  const model = await publish(h, 'model');
  const browser = await publish(h, 'browser');
  const catalog = f.peek()!;
  catalog.entries.find((entry) => entry.entryId === browser.entryId)!.backend = 'browser';
  f.replace(catalog);
  f.audio.remove.mockRejectedValueOnce(new Error('unlink'));
  await expect(h.initialize()).rejects.toMatchObject({ code: 'storage-failed' });
  expect(await h.list()).toEqual([await h.get(model)]);
  expect(f.peek()?.pendingDeletes).toHaveLength(1);
  await h.recover();
  expect(f.peek()?.pendingDeletes).toEqual([]);
  expect(f.files.size).toBe(1);
  expect((await h.readAudio(model)).size).toBe(5);
});
