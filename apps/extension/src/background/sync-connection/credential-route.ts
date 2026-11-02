import { SecretProtectionLockedError } from '../../composition/persistence/secret-protection/model';
import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseSyncCredentialLease } from '../../contracts/messaging/contracts/runtime/sync-connection';
import type {
  SyncCredentialLease,
  SyncCredentialResponse,
} from '../../contracts/messaging/contracts/runtime-message/sync-connection.types';
import {
  connectionUuid,
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
  type SyncConnectionMetadata,
  type SyncConnectionAuthentication,
} from '../../composition/persistence/remote-connection/model';

interface ProtectionPort {
  readKey(participant: 'webdav'): Promise<CryptoKey | null>;
  withAdmission<T>(
    participant: 'webdav',
    operation: (key: CryptoKey | null) => Promise<T>
  ): Promise<T>;
}
interface Control {
  epoch: number;
  phase: 'stable' | 'transitioning';
}
interface SyncCredentialLeaseDependencies {
  protection: ProtectionPort;
  workerEpoch: string;
  readControl(): Promise<Control>;
  loadConnection(): Promise<SyncConnectionMetadata | null>;
  loadAuthentication(
    identity: SyncConnectionIdentity,
    key: CryptoKey | null
  ): Promise<SyncConnectionAuthentication>;
  hasOriginPermission(origin: string): Promise<boolean>;
  createId(): string;
}
const REFUSAL = 'Sync credential query refused';
function refused(): never {
  throw new Error(REFUSAL);
}
function sameLease(left: SyncCredentialLease, right: SyncCredentialLease): boolean {
  return (
    left.leaseId === right.leaseId &&
    left.workerEpoch === right.workerEpoch &&
    left.protectionEpoch === right.protectionEpoch &&
    left.offscreenStartupId === right.offscreenStartupId &&
    left.executorId === right.executorId &&
    left.credentialId === right.credentialId &&
    sameSyncConnectionIdentity(left.authorization, right.authorization)
  );
}

/** One worker owns disposable leases. A restarted worker cannot adopt a previous lease. */
export function createSyncCredentialLeaseOwner(deps: SyncCredentialLeaseDependencies) {
  const leases = new Map<string, SyncCredentialLease>();
  let generation = 0;
  async function current(lease: SyncCredentialLease): Promise<SyncConnectionMetadata> {
    const retained = leases.get(lease.leaseId);
    if (!retained || !sameLease(retained, lease) || lease.workerEpoch !== deps.workerEpoch)
      return refused();
    const epoch = generation;
    const control = await deps.readControl();
    if (control.phase !== 'stable' || control.epoch !== lease.protectionEpoch) return refused();
    // This read must not acquire the caller-held sync admission lock or the writer exclusion.
    await deps.protection.readKey('webdav');
    const connection = await deps.loadConnection();
    if (
      !connection ||
      connection.phase !== 'active' ||
      !sameSyncConnectionIdentity(connection.identity, lease.authorization) ||
      connection.credentialId !== lease.credentialId ||
      epoch !== generation ||
      !leases.has(lease.leaseId)
    )
      return refused();
    return connection;
  }
  return {
    async issue(target: {
      offscreenStartupId: string;
      executorId: string;
      authorization: SyncConnectionIdentity;
    }): Promise<SyncCredentialLease> {
      const selectedGeneration = generation;
      const control = await deps.readControl();
      await deps.protection.readKey('webdav');
      const connection = await deps.loadConnection();
      const after = await deps.readControl();
      await deps.protection.readKey('webdav');
      if (
        selectedGeneration !== generation ||
        control.phase !== 'stable' ||
        after.phase !== 'stable' ||
        after.epoch !== control.epoch ||
        !connection ||
        connection.phase !== 'active' ||
        !connection.credentialId ||
        !sameSyncConnectionIdentity(connection.identity, target.authorization)
      )
        return refused();
      for (const [id, retained] of leases) {
        if (
          retained.protectionEpoch !== control.epoch ||
          retained.offscreenStartupId !== target.offscreenStartupId ||
          retained.executorId !== target.executorId ||
          retained.credentialId !== connection.credentialId ||
          !sameSyncConnectionIdentity(retained.authorization, target.authorization)
        ) {
          leases.delete(id);
          continue;
        }
        return structuredClone(retained);
      }
      const lease: SyncCredentialLease = {
        offscreenStartupId: target.offscreenStartupId,
        executorId: target.executorId,
        authorization: structuredClone(target.authorization),
        credentialId: connection.credentialId,
        leaseId: deps.createId(),
        workerEpoch: deps.workerEpoch,
        protectionEpoch: control.epoch,
      };
      leases.set(lease.leaseId, lease);
      return structuredClone(lease);
    },
    revokeAll(): void {
      generation += 1;
      leases.clear();
    },
    async check(
      input: unknown,
      authorization?: SyncConnectionIdentity,
      origin?: string
    ): Promise<boolean> {
      const lease = parseSyncCredentialLease(input);
      if (
        !lease ||
        (authorization && !sameSyncConnectionIdentity(lease.authorization, authorization))
      )
        return false;
      try {
        const connection = await current(lease);
        if (origin && new URL(connection.binding.rootUrl).origin !== origin) return false;
        return true;
      } catch {
        return false;
      }
    },
    async resolveAuthentication(
      input: unknown,
      deliver?: (response: SyncCredentialResponse) => void
    ): Promise<SyncCredentialResponse> {
      let delivered = false;
      function publish(response: SyncCredentialResponse): void {
        if (delivered || !deliver) return;
        delivered = true;
        try {
          deliver(response);
        } catch {
          /* A closed channel cannot receive another response. */
        }
      }
      const lease = parseSyncCredentialLease(input);
      if (!lease) {
        const response = { success: false as const, error: REFUSAL };
        publish(response);
        return response;
      }
      try {
        return await deps.protection.withAdmission('webdav', async (key) => {
          const before = await current(lease);
          const origin = new URL(before.binding.rootUrl).origin;
          if (!(await deps.hasOriginPermission(origin))) return refused();
          await current(lease);
          const authentication = await deps.loadAuthentication(lease.authorization, key);
          const after = await current(lease);
          if (JSON.stringify(before) !== JSON.stringify(after)) return refused();
          const response: SyncCredentialResponse = {
            success: true,
            authentication,
            credentialLease: structuredClone(lease),
          };
          // Deliver while the shared admission permit still excludes lock/rekey transitions.
          publish(response);
          return response;
        });
      } catch (error) {
        const response: SyncCredentialResponse = {
          success: false,
          error: error instanceof SecretProtectionLockedError ? 'secrets-locked' : REFUSAL,
        };
        publish(response);
        return response;
      }
    },
  };
}

/** Privileged response values never enter the product route or UI result projection. */
export function createSyncCredentialRoute(deps: {
  leases: Pick<ReturnType<typeof createSyncCredentialLeaseOwner>, 'resolveAuthentication'>;
  hasTrustedSender(sender: chrome.runtime.MessageSender, startupId: string): boolean;
}) {
  return (
    input: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: ResponseSender
  ): boolean => {
    if (!isRecord(input) || input['type'] !== MessageType.SYNC_CONNECTION_CREDENTIAL) return false;
    const lease = parseSyncCredentialLease(input['credentialLease']);
    if (
      Object.keys(input).length !== 3 ||
      !Object.hasOwn(input, 'requestId') ||
      !lease ||
      !connectionUuid(input['requestId']) ||
      sender.tab ||
      !deps.hasTrustedSender(sender, lease.offscreenStartupId)
    ) {
      sendResponse({ success: false, error: REFUSAL });
      return true;
    }
    void deps.leases.resolveAuthentication(lease, sendResponse);
    return true;
  };
}
