import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseSyncExecutorSnapshot } from '../../contracts/messaging/contracts/runtime/sync-connection';
import type { SyncConnectionCoordinatorDependencies } from './coordinator';

import type {
  SyncStartRequest,
  SyncInspectRequest,
  SyncStopRequest,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
type GatewayMessage = SyncStartRequest | SyncInspectRequest | SyncStopRequest;
type GatewayCommand =
  | Omit<SyncStartRequest, 'capabilityToken'>
  | Omit<SyncInspectRequest, 'capabilityToken'>
  | Omit<SyncStopRequest, 'capabilityToken'>;
interface GatewayDependencies {
  ensureDocument(): Promise<unknown>;
  waitForReady(): Promise<void>;
  getDocumentUrls(): Promise<readonly string[]>;
  send(message: GatewayMessage): Promise<unknown>;
  createRequestId(): string;
}
function refused(): never {
  throw new Error('Sync executor command refused');
}

/** Bridge one shared document service to identity-bound sync commands. */
export function createSyncOffscreenGateway(
  deps: GatewayDependencies
): Pick<
  SyncConnectionCoordinatorDependencies,
  'ensureDocument' | 'inspectExecutor' | 'startExecutor' | 'stopExecutor'
> {
  async function document() {
    const urls = await deps.getDocumentUrls();
    if (urls.length === 0) return null;
    if (urls.length !== 1) return refused();
    const url = new URL(urls[0]!);
    if (url.searchParams.get('privacyErasure') === '1') return { privacy: true, startupId: null };
    const startupId = url.searchParams.get('offscreenStartupId');
    if (!startupId) return refused();
    return { privacy: false, startupId };
  }
  async function send(message: GatewayCommand) {
    const response = await deps.send(attachOffscreenCommandCapability(message));
    if (!isRecord(response) || response['success'] !== true) return refused();
    return response;
  }
  return {
    async ensureDocument() {
      const before = await document();
      if (before?.privacy) refused();
      await deps.ensureDocument();
      await deps.waitForReady();
      const current = await document();
      if (!current || current.privacy || !current.startupId) return refused();
      return current.startupId;
    },
    async inspectExecutor(startupId, challenge) {
      const current = await document();
      if (!current || current.privacy) return { kind: 'absent' };
      if (!current.startupId || (startupId !== null && startupId !== current.startupId))
        return refused();
      const response = await send({
        type: MessageType.OFFSCREEN_SYNC_INSPECT,
        requestId: deps.createRequestId(),
        offscreenStartupId: current.startupId,
        challenge,
      });
      const snapshot = parseSyncExecutorSnapshot(response['snapshot']);
      if (
        !snapshot ||
        response['challenge'] !== challenge ||
        snapshot.offscreenStartupId !== current.startupId
      )
        return refused();
      return { kind: 'present', challenge, snapshot };
    },
    async startExecutor(input) {
      const response = await send({
        type: MessageType.OFFSCREEN_SYNC_START,
        requestId: deps.createRequestId(),
        ...input,
      });
      if (
        response['result'] !== 'accepted' ||
        response['executorId'] !== input.executorId ||
        typeof response['executorRevision'] !== 'number' ||
        !Number.isSafeInteger(response['executorRevision']) ||
        response['executorRevision'] < input.executorRevision
      )
        return refused();
      return { executorId: input.executorId, executorRevision: response['executorRevision'] };
    },
    async stopExecutor(input) {
      const response = await send({
        type: MessageType.OFFSCREEN_SYNC_STOP,
        requestId: deps.createRequestId(),
        ...input,
      });
      if (
        response['result'] !== 'stopped' ||
        response['executorId'] !== input.executorId ||
        typeof response['executorRevision'] !== 'number' ||
        !Number.isSafeInteger(response['executorRevision']) ||
        response['executorRevision'] <= input.executorRevision
      )
        return refused();
      return { executorId: input.executorId, executorRevision: response['executorRevision'] };
    },
  };
}
