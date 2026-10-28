import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { authorizeOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createSyncOffscreenGateway } from './offscreen-gateway';

const startup = '11111111-1111-4111-8111-111111111111';
const executor = '22222222-2222-4222-8222-222222222222';
const challenge = '33333333-3333-4333-8333-333333333333';
const url = `chrome-extension://extension/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=${startup}`;
const snapshot = () => ({
  offscreenStartupId: startup,
  executorId: executor,
  executorRevision: 1,
  phase: 'idle',
  binding: null,
  jobs: [],
  workspace: null,
});
function setup() {
  const deps = {
    ensureDocument: vi.fn(async () => false),
    waitForReady: vi.fn(async () => {}),
    getDocumentUrls: vi.fn(async (): Promise<readonly string[]> => [url]),
    send: vi.fn(async (_message: unknown): Promise<unknown> => ({
      success: true,
      challenge,
      snapshot: snapshot(),
    })),
    createRequestId: () => challenge,
  };
  return { deps, gateway: createSyncOffscreenGateway(deps) };
}
beforeEach(() => vi.clearAllMocks());
it('uses the shared service and observed startup before a signed fresh inspection', async () => {
  const { deps, gateway } = setup();
  expect(await gateway.ensureDocument()).toBe(startup);
  expect(deps.ensureDocument).toHaveBeenCalledOnce();
  expect(deps.waitForReady).toHaveBeenCalledOnce();
  expect(await gateway.inspectExecutor(startup, challenge)).toEqual({
    kind: 'present',
    challenge,
    snapshot: snapshot(),
  });
  expect(deps.send).toHaveBeenCalledWith(
    expect.objectContaining({
      type: MessageType.OFFSCREEN_SYNC_INSPECT,
      challenge,
      offscreenStartupId: startup,
      capabilityToken: expect.any(String),
    })
  );
});
it('uses only positively observed absence and never creates a document for inspection', async () => {
  const { deps, gateway } = setup();
  deps.getDocumentUrls.mockResolvedValue([]);
  expect(await gateway.inspectExecutor(null, challenge)).toEqual({ kind: 'absent' });
  expect(deps.ensureDocument).not.toHaveBeenCalled();
  expect(deps.send).not.toHaveBeenCalled();
  deps.getDocumentUrls.mockRejectedValue(new Error('unavailable'));
  await expect(gateway.inspectExecutor(null, challenge)).rejects.toThrow();
});
it('never admits synchronization in the privacy-only document', async () => {
  const { deps, gateway } = setup();
  deps.getDocumentUrls.mockResolvedValue([url + '&privacyErasure=1']);
  expect(await gateway.inspectExecutor(null, challenge)).toEqual({ kind: 'absent' });
  await expect(gateway.ensureDocument()).rejects.toThrow('Sync executor command refused');
  expect(deps.ensureDocument).not.toHaveBeenCalled();
  expect(deps.send).not.toHaveBeenCalled();
});
it.each(['wrong-startup', 'wrong-challenge', 'malformed', 'failed'])(
  'refuses uncertain adoption: %s',
  async (kind) => {
    const { deps, gateway } = setup();
    const candidate = {
      ...snapshot(),
      ...(kind === 'wrong-startup' ? { offscreenStartupId: executor } : {}),
    };
    deps.send.mockResolvedValue(
      kind === 'malformed'
        ? { success: true, snapshot: {} }
        : kind === 'failed'
          ? { success: false, error: 'private server failure' }
          : {
              success: true,
              challenge: kind === 'wrong-challenge' ? executor : challenge,
              snapshot: candidate,
            }
    );
    await expect(gateway.inspectExecutor(null, challenge)).rejects.toThrow(
      'Sync executor command refused'
    );
  }
);
it('requires the observed target and an increased Stop revision', async () => {
  const { deps, gateway } = setup();
  const target = { offscreenStartupId: startup, executorId: executor, executorRevision: 1 };
  deps.send.mockResolvedValue({
    success: true,
    result: 'stopped',
    executorId: executor,
    executorRevision: 1,
  });
  await expect(gateway.stopExecutor(target)).rejects.toThrow('Sync executor command refused');
  deps.send.mockResolvedValue({
    success: true,
    result: 'stopped',
    executorId: executor,
    executorRevision: 2,
  });
  expect(await gateway.stopExecutor(target)).toEqual({ executorId: executor, executorRevision: 2 });
});
it('rejects a replaced or ambiguous document before dispatch', async () => {
  const { deps, gateway } = setup();
  await expect(gateway.inspectExecutor(executor, challenge)).rejects.toThrow();
  deps.getDocumentUrls.mockResolvedValue([url, url]);
  await expect(gateway.inspectExecutor(null, challenge)).rejects.toThrow();
  expect(deps.send).not.toHaveBeenCalled();
});

it('signs a workspace selection and returns only the matching accepted receipt', async () => {
  const { deps, gateway } = setup();
  const input = {
    offscreenStartupId: startup,
    executorId: executor,
    executorRevision: 1,
    source: { kind: 'allocation' as const, identity: { incarnation: challenge, revision: 3 } },
    authentication: { kind: 'basic' as const, username: 'alice', password: 'private-password' },
  };
  deps.send.mockImplementation(async (message) => {
    if (!isRecord(message)) throw new Error('Missing message');
    expect(message).toEqual({
      ...input,
      type: MessageType.OFFSCREEN_SYNC_WORKSPACE_START,
      requestId: challenge,
      capabilityToken: expect.any(String),
    });
    expect(authorizeOffscreenCommandCapability(message).authorized).toBe(true);
    return { success: true, result: 'accepted', executorId: executor, executorRevision: 2 };
  });
  const receipt = await gateway.startWorkspaceExecutor(input);
  expect(receipt).toEqual({ executorId: executor, executorRevision: 2 });
  expect(JSON.stringify(receipt)).not.toContain('private-password');
});
it.each([
  { success: true, result: 'accepted', executorId: challenge, executorRevision: 2 },
  { success: true, result: 'accepted', executorId: executor, executorRevision: 0 },
  { success: true, result: 'accepted', executorId: executor, executorRevision: 1.5 },
  { success: true, result: 'accepted', executorId: executor, executorRevision: '2' },
  {
    success: true,
    result: 'accepted',
    executorId: executor,
    executorRevision: Number.MAX_SAFE_INTEGER + 1,
  },
  { success: true, result: 'stopped', executorId: executor, executorRevision: 2 },
  {
    success: true,
    result: 'accepted',
    executorId: executor,
    executorRevision: 2,
    password: 'private',
  },
  { success: false, error: 'private-provider-error' },
  null,
])('refuses malformed workspace acceptance receipt %#', async (response) => {
  const { deps, gateway } = setup();
  deps.send.mockResolvedValue(response);
  await expect(
    gateway.startWorkspaceExecutor({
      offscreenStartupId: startup,
      executorId: executor,
      executorRevision: 1,
      source: { kind: 'allocation' as const, identity: { incarnation: challenge, revision: 3 } },
      authentication: { kind: 'bearer', accessToken: 'private-token' },
    })
  ).rejects.toThrow('Sync executor command refused');
});

it('keeps advisory classification on signed observation and product hops', async () => {
  const { deps, gateway } = setup();
  await gateway.inspectExecutor(startup, challenge, true);
  const inspection = deps.send.mock.lastCall![0];
  expect(inspection).toMatchObject({ advisory: true });
  if (!isRecord(inspection)) throw new Error('Missing signed inspection');
  expect(authorizeOffscreenCommandCapability(inspection).authorized).toBe(true);
  deps.send.mockResolvedValue({
    success: true,
    result: { kind: 'operation', job: null, completion: null },
  });
  await gateway.productExecutor!({
    offscreenStartupId: startup,
    executorId: executor,
    executorRevision: 1,
    advisory: true,
    command: { kind: 'inspect', operationRequestId: challenge },
  });
  expect(deps.send.mock.lastCall![0]).toMatchObject({ advisory: true });
  const product = deps.send.mock.lastCall![0];
  if (!isRecord(product)) throw new Error('Missing signed product command');
  expect(authorizeOffscreenCommandCapability(product).authorized).toBe(true);
});
