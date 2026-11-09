import { expect, it, vi } from 'vitest';
import { DesignReviewSessionClient } from './client';
import { createRuntimePortFixture } from '../../../../../../tooling/test/support/chrome-runtime-port';
import {
  DESIGN_REVIEW_SESSION_PORT,
  type DesignReviewSessionRequest,
} from '../../../contracts/design-review-session';

const native = vi.hoisted(() => ({ connect: vi.fn(), getLastError: vi.fn() }));
vi.mock('@sniptale/platform/browser/runtime', () => ({ browserRuntime: native }));

const idA = '12345678-1234-4234-8234-123456789aa1';
const idB = '12345678-1234-4234-8234-123456789aa2';
const lease = '12345678-1234-4234-8234-123456789aa3';
const open = (requestId = idA): DesignReviewSessionRequest => ({ kind: 'open', requestId });
const save = (): DesignReviewSessionRequest => ({
  kind: 'save',
  requestId: idB,
  lease,
  expectedRevision: 0,
  payload: '{}',
});
const ready = (requestId = idA) => ({
  requestId,
  status: 'ready',
  lease,
  revision: 0,
  available: false,
});
function connection() {
  const wire = createRuntimePortFixture();
  vi.spyOn(wire.onMessage, 'addListener');
  vi.spyOn(wire.onMessage, 'removeListener');
  vi.spyOn(wire.onDisconnect, 'addListener');
  vi.spyOn(wire.onDisconnect, 'removeListener');
  return wire;
}
function expectDetached(wire: ReturnType<typeof connection>) {
  expect(wire.onMessage.removeListener).toHaveBeenCalledWith(
    vi.mocked(wire.onMessage.addListener).mock.calls[0]![0]
  );
  expect(wire.onDisconnect.removeListener).toHaveBeenCalledWith(
    vi.mocked(wire.onDisconnect.addListener).mock.calls[0]![0]
  );
}

it('opens the named native port and resolves only correlated replies', async () => {
  const wire = connection();
  native.connect.mockReturnValueOnce(wire.port);
  const client = new DesignReviewSessionClient();
  const first = client.request(open());
  const second = client.request(save());
  const observed = vi.fn();
  void first.then(observed);
  expect(native.connect).toHaveBeenCalledWith({ name: DESIGN_REVIEW_SESSION_PORT });
  expect(client.isConnected()).toBe(true);
  wire.onMessage.emit(ready(lease));
  await Promise.resolve();
  expect(observed).not.toHaveBeenCalled();
  wire.onMessage.emit(ready(idB));
  await expect(second).resolves.toMatchObject({ requestId: idB });
  expect(observed).not.toHaveBeenCalled();
  wire.onMessage.emit(ready());
  await expect(first).resolves.toEqual(ready());
  wire.onMessage.emit(ready());
  expect(wire.postMessage.mock.calls.map(([message]) => message.kind)).toEqual(['open', 'save']);
  client.dispose();
});

it('rejects every pending request and detaches native listeners on a malformed reply', async () => {
  const wire = connection();
  const client = new DesignReviewSessionClient(() => wire.port);
  const first = expect(client.request(open())).rejects.toThrow('connection is unavailable');
  const second = expect(client.request(save())).rejects.toThrow('connection is unavailable');
  wire.onMessage.emit({ requestId: idA, status: 'ready', lease, revision: -1, available: false });
  await Promise.all([first, second]);
  expect(client.isConnected()).toBe(false);
  expectDetached(wire);
  expect(wire.disconnect).toHaveBeenCalledTimes(1);
  client.dispose();
  expect(wire.disconnect).toHaveBeenCalledTimes(1);
});

it('refuses mutations before admission without opening a native connection', async () => {
  const connect = vi.fn();
  const client = new DesignReviewSessionClient(connect);
  await expect(client.request(save())).rejects.toThrow('requires admission');
  expect(connect).not.toHaveBeenCalled();
  expect(client.isConnected()).toBe(false);
});

it('rejects pending work on disconnect and requires new open admission', async () => {
  const firstWire = connection();
  const nextWire = connection();
  const connect = vi.fn().mockReturnValueOnce(firstWire.port).mockReturnValueOnce(nextWire.port);
  const client = new DesignReviewSessionClient(connect);
  const failure = expect(client.request(open())).rejects.toThrow('connection is unavailable');
  firstWire.onDisconnect.emit(firstWire.port);
  await failure;
  expect(native.getLastError).toHaveBeenCalled();
  expectDetached(firstWire);
  await expect(client.request(save())).rejects.toThrow('requires admission');
  expect(connect).toHaveBeenCalledTimes(1);
  const admitted = client.request(open(idB));
  nextWire.onMessage.emit(ready(idB));
  await expect(admitted).resolves.toEqual(ready(idB));
  expect(connect).toHaveBeenCalledTimes(2);
  expect(nextWire.postMessage).toHaveBeenCalledTimes(1);
  client.dispose();
});

it('cleans up a native post failure and can reopen without replaying the mutation', async () => {
  const wire = connection();
  const reopened = connection();
  wire.postMessage.mockImplementationOnce(() => {
    throw new Error('Native post failed');
  });
  const connect = vi.fn().mockReturnValueOnce(wire.port).mockReturnValueOnce(reopened.port);
  const client = new DesignReviewSessionClient(connect);
  await expect(client.request(open())).rejects.toThrow('connection is unavailable');
  expect(client.isConnected()).toBe(false);
  expectDetached(wire);
  expect(wire.disconnect).toHaveBeenCalledTimes(1);
  const request = client.request(open(idB));
  reopened.onMessage.emit(ready(idB));
  await expect(request).resolves.toEqual(ready(idB));
  expect(reopened.postMessage).toHaveBeenCalledExactlyOnceWith(open(idB));
  client.dispose();
});

it('retains no port after native connect throws and permits a later open', async () => {
  const wire = connection();
  const connect = vi
    .fn()
    .mockImplementationOnce(() => {
      throw new Error('Native connect failed');
    })
    .mockReturnValueOnce(wire.port);
  const client = new DesignReviewSessionClient(connect);
  expect(() => client.request(open())).toThrow('Native connect failed');
  expect(client.isConnected()).toBe(false);
  const request = client.request(open(idB));
  wire.onMessage.emit(ready(idB));
  await expect(request).resolves.toEqual(ready(idB));
  client.dispose();
});

it('still rejects pending requests when native disconnect itself throws', async () => {
  const wire = connection();
  wire.disconnect.mockImplementationOnce(() => {
    throw new Error('Already disconnected');
  });
  const client = new DesignReviewSessionClient(() => wire.port);
  const failure = expect(client.request(open())).rejects.toThrow('connection is unavailable');
  expect(() => client.dispose()).not.toThrow();
  await failure;
  expect(client.isConnected()).toBe(false);
  expectDetached(wire);
});
