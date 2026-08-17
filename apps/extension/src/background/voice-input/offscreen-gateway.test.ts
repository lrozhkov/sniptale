import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({
  acquirePermit: vi.fn(),
  ensureReady: vi.fn(),
  getContexts: vi.fn(),
  releasePermit: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  waitForReady: vi.fn(),
}));

vi.mock('@sniptale/platform/security/offscreen-command-capability', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@sniptale/platform/security/offscreen-command-capability')
  >()),
  attachOffscreenCommandCapability: (message: object) => ({
    ...message,
    capabilityToken: 'signed-capability',
  }),
}));

vi.mock('../mutation-exclusion/media-activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../mutation-exclusion/media-activity')>()),
  acquireMediaMutationPermit: mocks.acquirePermit,
}));

vi.mock('../routing-contracts/runtime-messaging/services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../routing-contracts/runtime-messaging/services')>()),
  getBackgroundRuntimeMessaging: () => ({ sendRuntimeMessage: mocks.sendRuntimeMessage }),
}));

vi.mock('../offscreen-document/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../offscreen-document/service')>()),
  ensureOffscreenDocument: mocks.ensureReady,
  waitForOffscreenReady: mocks.waitForReady,
}));

vi.mock('@sniptale/platform/browser/runtime', () => ({
  browserRuntime: { getContexts: mocks.getContexts },
}));

import { createVoiceInputOffscreenGateway } from './offscreen-gateway';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acquirePermit.mockReturnValue(mocks.releasePermit);
  mocks.ensureReady.mockResolvedValue(true);
  mocks.getContexts.mockResolvedValue([]);
  mocks.sendRuntimeMessage.mockResolvedValue({ result: 'accepted', success: true });
  mocks.waitForReady.mockResolvedValue(undefined);
});

describe('voice input offscreen gateway', () => {
  it('inspects the real offscreen context without creating one', async () => {
    mocks.getContexts.mockResolvedValueOnce([{ contextType: 'OFFSCREEN_DOCUMENT' }]);

    await expect(createVoiceInputOffscreenGateway().hasExistingDocument()).resolves.toBe(true);
    expect(mocks.ensureReady).not.toHaveBeenCalled();
  });

  it('creates the shared offscreen document and sends signed commands', async () => {
    const gateway = createVoiceInputOffscreenGateway();
    await gateway.ensureReady();
    await expect(
      gateway.send({
        requestId: 'status-1',
        type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
      })
    ).resolves.toEqual({ result: 'accepted', success: true });

    expect(mocks.ensureReady).toHaveBeenCalledWith('Recognize extension voice input');
    expect(mocks.waitForReady).toHaveBeenCalledWith(5_000);
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
      capabilityToken: 'signed-capability',
      requestId: 'status-1',
      type: MessageType.OFFSCREEN_VOICE_INPUT_STATUS,
    });
  });

  it('holds and releases the privacy-erasure exclusion around media work', async () => {
    const work = vi.fn().mockResolvedValue(undefined);
    await createVoiceInputOffscreenGateway().withMediaMutationPermit(work);
    expect(work).toHaveBeenCalledOnce();
    expect(mocks.releasePermit).toHaveBeenCalledOnce();
  });

  it('releases the exclusion on failure and rejects when erasure already owns it', async () => {
    const gateway = createVoiceInputOffscreenGateway();
    await expect(
      gateway.withMediaMutationPermit(async () => {
        throw new Error('work failed');
      })
    ).rejects.toThrow('work failed');
    expect(mocks.releasePermit).toHaveBeenCalledOnce();

    mocks.acquirePermit.mockReturnValue(null);
    await expect(gateway.withMediaMutationPermit(vi.fn())).rejects.toThrow(
      'privacy-erasure-in-progress'
    );
  });
});
