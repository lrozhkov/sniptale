import { expect, it, vi } from 'vitest';
import { createSimplifyComputeClient, type SimplifyComputeRequest } from './compute-client';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';
const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const source = { dataUrl: png, width: 1, height: 1 };
const input = {
  source,
  region: { x: 0, y: 0, width: 1, height: 1 },
  settings: createDefaultSimplifySettings(),
};
const prepared = (id = 'source-1') => ({
  success: true,
  sessionId: id,
  width: 1,
  height: 1,
  version: 'test',
});
const rendered = (id = 'source-1') => ({ ...prepared(id), dataUrl: png });

it('reuses the prepared source for settings and region renders', async () => {
  const send = vi.fn(async (request: SimplifyComputeRequest): Promise<unknown> => {
    if (request.operation === 'prepare') return prepared();
    if (request.operation === 'render') return rendered();
    return { success: true, result: 'disposed' };
  });
  const client = createSimplifyComputeClient({ send });
  expect(await client.render(input)).toEqual({ ...source, version: 'test' });
  await client.render({ ...input, settings: { ...input.settings, content: 'all' } });
  expect(send.mock.calls.map(([r]) => r.operation)).toEqual(['prepare', 'render', 'render']);
  client.dispose();
  expect(send.mock.calls.at(-1)?.[0].operation).toBe('cancel');
});

it('releases a late prepared source after cancellation without rendering it', async () => {
  const ready = Promise.withResolvers<unknown>();
  const send = vi.fn((request: SimplifyComputeRequest): Promise<unknown> =>
    request.operation === 'prepare'
      ? ready.promise
      : Promise.resolve({ success: true, result: 'disposed' })
  );
  const client = createSimplifyComputeClient({ send });
  const result = client.render(input);
  const rejection = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  client.cancel();
  ready.resolve(prepared());
  await rejection;
  expect(send.mock.calls.map(([r]) => r.operation)).toEqual(['prepare', 'dispose']);
});

it('newer work replaces an in-flight render and ignores the old response', async () => {
  const old = Promise.withResolvers<unknown>();
  const started = Promise.withResolvers<void>();
  let sourceId = 0;
  let renders = 0;
  const send = vi.fn(async (request: SimplifyComputeRequest): Promise<unknown> => {
    if (request.operation === 'prepare') return prepared('source-' + ++sourceId);
    if (request.operation === 'render') {
      if (++renders === 1) {
        started.resolve();
        return old.promise;
      }
      return rendered(request.sessionId);
    }
    return { success: true, result: 'disposed' };
  });
  const client = createSimplifyComputeClient({ send });
  const first = client.render(input);
  const rejection = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await started.promise;
  expect(
    await client.render({ ...input, settings: { ...input.settings, content: 'all' } })
  ).toEqual({ ...source, version: 'test' });
  old.resolve(rendered('source-1'));
  await rejection;
  expect(send.mock.calls.filter(([r]) => r.operation === 'cancel')).toHaveLength(1);
  client.dispose();
});

it('rejects malformed result dimensions and retries from the retained source', async () => {
  let invalid = true;
  const send = vi.fn(async (request: SimplifyComputeRequest): Promise<unknown> => {
    if (request.operation === 'prepare') return prepared();
    if (request.operation === 'render') return invalid ? { ...rendered(), width: 2 } : rendered();
    return { success: true, result: 'disposed' };
  });
  const client = createSimplifyComputeClient({ send });
  await expect(client.render(input)).rejects.toThrow('Simplify computation failed.');
  invalid = false;
  expect(await client.render(input)).toMatchObject(source);
  expect(send.mock.calls.filter(([r]) => r.operation === 'prepare')).toHaveLength(2);
  client.dispose();
});

it('validates source and region before IPC and refuses work after disposal', async () => {
  const send = vi.fn(async (): Promise<unknown> => prepared());
  const client = createSimplifyComputeClient({ send });
  await expect(client.render({ ...input, source: { ...source, width: 2 } })).rejects.toThrow();
  await expect(
    client.render({ ...input, region: { x: 1, y: 0, width: 1, height: 1 } })
  ).rejects.toThrow();
  expect(send).not.toHaveBeenCalled();
  client.dispose();
  await expect(client.render(input)).rejects.toMatchObject({ name: 'AbortError' });
});

it('forwards finite manual rotation and rejects invalid rotation before IPC', async () => {
  const send = vi.fn(async (request: SimplifyComputeRequest): Promise<unknown> => {
    if (request.operation === 'prepare') return prepared();
    if (request.operation === 'render') return rendered();
    return { success: true, result: 'disposed' };
  });
  const client = createSimplifyComputeClient({ send });
  await client.render({
    ...input,
    region: { ...input.region, rotation: 15 },
    settings: { ...input.settings, automatic: false },
  });
  expect(send.mock.calls.find(([r]) => r.operation === 'render')?.[0]).toMatchObject({
    region: { rotation: 15 },
  });
  const calls = send.mock.calls.length;
  await expect(
    client.render({ ...input, region: { ...input.region, rotation: NaN } })
  ).rejects.toThrow();
  expect(send.mock.calls).toHaveLength(calls);
  client.dispose();
});
