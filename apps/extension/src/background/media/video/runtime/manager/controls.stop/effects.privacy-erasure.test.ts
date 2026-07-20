import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';

const {
  clearViewport,
  detachDebugger,
  detachDebuggerForPrivacyErasure,
  hasAttachedClient,
  listAttachedDebuggerClientOwners,
  sendTabMessage,
} = vi.hoisted(() => ({
  clearViewport: vi.fn(),
  detachDebugger: vi.fn(),
  detachDebuggerForPrivacyErasure: vi.fn(),
  hasAttachedClient: vi.fn(),
  listAttachedDebuggerClientOwners: vi.fn(),
  sendTabMessage: vi.fn(),
}));

vi.mock('../../../../../debugger/session/detach', () => ({ detachDebugger }));
vi.mock('../../../../../debugger/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../debugger/session')>()),
  hasAttachedClient,
  listAttachedDebuggerClientOwners,
}));
vi.mock('../../../../../debugger/session/detach.privacy-erasure', () => ({
  detachDebuggerForPrivacyErasure,
}));
vi.mock('../../../../../debugger/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../debugger/workspace')>()),
  clearViewport,
}));

import {
  quiesceViewportEmulationForPrivacyErasure,
  runStopSideEffects,
  waitForStopSideEffects,
} from './effects';

beforeEach(() => {
  installBackgroundRuntimeMessagingMock({ sendTabMessage });
  vi.clearAllMocks();
  clearViewport.mockResolvedValue(undefined);
  detachDebuggerForPrivacyErasure.mockResolvedValue(undefined);
  hasAttachedClient.mockReturnValue(false);
  listAttachedDebuggerClientOwners.mockReturnValue([]);
  sendTabMessage.mockResolvedValue(undefined);
});

it('awaits strict viewport clear and detach during privacy erasure', async () => {
  runStopSideEffects({ mode: CaptureMode.VIEWPORT_EMULATION, tabId: 7 }, 'fixed');

  await expect(waitForStopSideEffects()).resolves.toBeUndefined();

  expect(clearViewport).toHaveBeenCalledWith(7);
  expect(detachDebuggerForPrivacyErasure).toHaveBeenCalledWith(7, 'video-emulation');
  expect(detachDebugger).not.toHaveBeenCalled();
});

it('retains and retries orphaned viewport debugger ownership after strict detach failure', async () => {
  listAttachedDebuggerClientOwners
    .mockReturnValueOnce([{ tabId: 8, clients: ['video-emulation'], targetId: 'target-8' }])
    .mockReturnValueOnce([{ tabId: 8, clients: ['video-emulation'], targetId: 'target-8' }])
    .mockReturnValue([]);
  detachDebuggerForPrivacyErasure.mockRejectedValueOnce(new Error('detach failed'));

  await expect(quiesceViewportEmulationForPrivacyErasure()).rejects.toThrow('detach failed');
  await expect(quiesceViewportEmulationForPrivacyErasure()).resolves.toBeUndefined();
});
