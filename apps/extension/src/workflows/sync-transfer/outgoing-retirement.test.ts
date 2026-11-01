import { beforeEach, expect, it, vi } from 'vitest';
import { createPublishedOutgoingRetirement } from './outgoing-retirement';
import { SyncRemoteError } from './remote-store';
import type { SyncRemoteStore } from './remote-store';

const io = vi.hoisted(() => ({ discover: vi.fn(), release: vi.fn(), warn: vi.fn() }));
vi.mock('../../composition/persistence/sync-capture/outgoing-results', () => ({
  discoverPublishedOutgoingRetirement: io.discover,
}));
vi.mock('./outgoing', () => ({ releasePublishedOutgoing: io.release }));
vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({ warn: io.warn }),
}));
const scope = { spaceId: 'space', connectionGeneration: 1, profileCreatedAt: 1 };
const authorization = { incarnation: '11111111-1111-4111-8111-111111111111', revision: 1 };
function input(controller = new AbortController()) {
  const remote: SyncRemoteStore = {
    read: vi.fn(),
    list: vi.fn(),
    write: vi.fn(),
    stat: vi.fn(),
  };
  return { scope, authorization, remote, signal: controller.signal };
}
beforeEach(() => {
  vi.clearAllMocks();
  io.discover.mockResolvedValue({ operationIds: ['old'], afterKey: null, scanned: 1 });
  io.release.mockResolvedValue({ released: [], intent: null });
});
it('revisits old published pins after busy readers and remote failure without queue replay', async () => {
  const owner = createPublishedOutgoingRetirement();
  const args = input();
  await expect(owner.run(args)).resolves.toMatchObject({ attempted: 1, retiredPins: 0 });
  io.release.mockRejectedValueOnce(new SyncRemoteError('temporary'));
  await expect(owner.run(args)).resolves.toMatchObject({ deferred: 1 });
  io.release.mockResolvedValueOnce({ released: ['transport'], intent: null });
  await expect(owner.run(args)).resolves.toMatchObject({ retiredPins: 1 });
  expect(io.discover).toHaveBeenCalledTimes(3);
  expect(io.release).toHaveBeenLastCalledWith(
    'space',
    'old',
    authorization,
    args.remote,
    args.signal
  );
});
it('continues a bounded page, resets on binding replacement and restarts discovery after runtime restart', async () => {
  const owner = createPublishedOutgoingRetirement();
  const args = input();
  io.discover.mockResolvedValueOnce({ operationIds: [], afterKey: 'page1', scanned: 64 });
  await owner.run(args);
  await owner.run(args);
  expect(io.discover.mock.calls[1]?.[0]).toMatchObject({ afterKey: 'page1' });
  io.discover.mockResolvedValueOnce({ operationIds: [], afterKey: 'page2', scanned: 64 });
  await owner.run(args);
  await owner.run({ ...args, authorization: { ...authorization, revision: 2 } });
  expect(io.discover.mock.lastCall?.[0]).toMatchObject({ afterKey: null });
  await createPublishedOutgoingRetirement().run(args);
  expect(io.discover.mock.lastCall?.[0]).toMatchObject({ afterKey: null });
});
it('continues after a refused candidate and contains diagnostic sink failure', async () => {
  io.discover.mockResolvedValueOnce({ operationIds: ['bad', 'later'], afterKey: null, scanned: 2 });
  io.release.mockRejectedValueOnce(new Error('private endpoint and secret'));
  io.release.mockResolvedValueOnce({ released: ['later'], intent: null });
  io.warn.mockImplementationOnce(() => {
    throw new Error('sink unavailable');
  });
  await expect(createPublishedOutgoingRetirement().run(input())).resolves.toMatchObject({
    attempted: 2,
    deferred: 1,
  });
  expect(io.release.mock.calls.map((call) => call[1])).toEqual(['bad', 'later']);
  expect(io.warn).toHaveBeenCalledWith('sync.retirement.deferred stage=release reason=unexpected');
});
it('stops later releases when disconnection aborts an issued verification', async () => {
  const controller = new AbortController();
  io.discover.mockResolvedValueOnce({
    operationIds: ['first', 'later'],
    afterKey: null,
    scanned: 2,
  });
  io.release.mockImplementationOnce(async () => {
    controller.abort();
    controller.signal.throwIfAborted();
  });
  await expect(createPublishedOutgoingRetirement().run(input(controller))).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(io.release).toHaveBeenCalledOnce();
});
it('coalesces parallel wakeups without another release authority', async () => {
  let settle!: () => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  io.release.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        began();
        settle = () => resolve({ released: [], intent: null });
      })
  );
  const owner = createPublishedOutgoingRetirement();
  const args = input();
  const first = owner.run(args);
  const second = owner.run(args);
  await started;
  expect(io.release).toHaveBeenCalledOnce();
  settle();
  await Promise.all([first, second]);
  expect(io.discover).toHaveBeenCalledOnce();
});

it.each([
  'temporary',
  'transport',
  'missing',
  'authentication',
  'access-denied',
  'invalid-response',
] as const)('preserves retry after%s remote failure with fixed diagnostic codes', async (code) => {
  io.release.mockRejectedValueOnce(new SyncRemoteError(code));
  const owner = createPublishedOutgoingRetirement();
  const args = input();
  await expect(owner.run(args)).resolves.toMatchObject({ retiredPins: 0, deferred: 1 });
  expect(io.warn).toHaveBeenCalledWith(`sync.retirement.deferred stage=release reason=${code}`);
  io.release.mockResolvedValueOnce({ released: ['transport'], intent: null });
  await expect(owner.run(args)).resolves.toMatchObject({ retiredPins: 1 });
});
it('contains discovery failure and retries without losing the previous continuation', async () => {
  const owner = createPublishedOutgoingRetirement();
  const args = input();
  io.discover.mockRejectedValueOnce(new Error('private provider body'));
  await expect(owner.run(args)).resolves.toMatchObject({ attempted: 0, deferred: 1 });
  await owner.run(args);
  expect(io.discover.mock.lastCall?.[0]).toMatchObject({ afterKey: null });
  expect(io.warn).toHaveBeenCalledWith(
    'sync.retirement.deferred stage=discovery reason=unexpected'
  );
});

it.each(['private-secret-code', 'getter'] as const)(
  'continues later candidates after hostile diagnostic%s',
  async (kind) => {
    const error = new SyncRemoteError('temporary');
    if (kind === 'getter')
      Object.defineProperty(error, 'code', {
        get() {
          throw new Error('private getter');
        },
      });
    else Object.defineProperty(error, 'code', { value: kind });
    io.discover.mockResolvedValueOnce({
      operationIds: ['first', 'later'],
      afterKey: null,
      scanned: 2,
    });
    io.release
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ released: ['later'], intent: null });
    await expect(createPublishedOutgoingRetirement().run(input())).resolves.toEqual({
      attempted: 2,
      retiredPins: 1,
      deferred: 1,
    });
    expect(io.release.mock.calls.map((call) => call[1])).toEqual(['first', 'later']);
    if (kind !== 'getter')
      expect(io.warn).toHaveBeenCalledWith(
        'sync.retirement.deferred stage=release reason=unexpected'
      );
    expect(JSON.stringify(io.warn.mock.calls)).not.toContain('private');
  }
);
it('coalesces a replacement binding advisory pass and admits it on a later wakeup', async () => {
  let settle!: () => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  io.release.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        began();
        settle = () => resolve({ released: [], intent: null });
      })
  );
  io.discover.mockResolvedValueOnce({ operationIds: ['old'], afterKey: 'old-page', scanned: 64 });
  const owner = createPublishedOutgoingRetirement();
  const args = input();
  const first = owner.run(args);
  await started;
  const replacement = { ...input(), authorization: { ...authorization, revision: 2 } };
  const overlapping = owner.run(replacement);
  expect(overlapping).toBe(first);
  settle();
  await overlapping;
  expect(io.discover).toHaveBeenCalledOnce();
  await owner.run(replacement);
  expect(io.discover.mock.lastCall?.[0]).toMatchObject({
    authorization: replacement.authorization,
    afterKey: null,
  });
});

it('reads a typed diagnostic code once before retaining its allowlisted value', async () => {
  const error = new SyncRemoteError('temporary');
  let reads = 0;
  Object.defineProperty(error, 'code', {
    get() {
      return reads++ === 0 ? 'temporary' : 'private-secret';
    },
  });
  io.release.mockRejectedValueOnce(error);
  await createPublishedOutgoingRetirement().run(input());
  expect(reads).toBe(1);
  expect(io.warn).toHaveBeenCalledWith('sync.retirement.deferred stage=release reason=temporary');
  expect(JSON.stringify(io.warn.mock.calls)).not.toContain('private');
});
