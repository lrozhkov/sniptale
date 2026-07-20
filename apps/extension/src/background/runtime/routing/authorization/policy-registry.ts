import {
  reject,
  type IpcAuthorizationResult,
} from '../../../routing-contracts/authorization-result';
import { rejectDisabledIncidentCapabilityFamily } from './incident-capability-kill-switch';
import { authorizationPolicyRegistryEntries } from './policy-registry.entries';
import type {
  AsyncProjectExportAuthorizationPolicyRegistryEntry,
  AuthorizationPolicyRegistryEntry,
  IpcAuthorizationRequest,
  ProjectExportRuntimeAuthorizationInput,
  SyncAuthorizationPolicyRegistryEntry,
} from './policy-registry.types';

export type { IpcAuthorizationRequest } from './policy-registry.types';

export const authorizationPolicyRegistry: readonly AuthorizationPolicyRegistryEntry[] =
  authorizationPolicyRegistryEntries;

export function getAuthorizationPolicyEntry(
  request: IpcAuthorizationRequest
): SyncAuthorizationPolicyRegistryEntry | undefined {
  const key =
    request.kind === 'privileged-tab-route' ? `${request.kind}:${request.family}` : request.kind;
  return authorizationPolicyRegistry.find(
    (entry): entry is SyncAuthorizationPolicyRegistryEntry =>
      entry.authorizationMode === 'sync' && entry.key === key
  );
}

export function getProjectExportAuthorizationPolicyEntry():
  | AsyncProjectExportAuthorizationPolicyRegistryEntry
  | undefined {
  return authorizationPolicyRegistry.find(
    (entry): entry is AsyncProjectExportAuthorizationPolicyRegistryEntry =>
      entry.authorizationMode === 'async' && entry.key === 'project-export-runtime'
  );
}

export function authorizeRegisteredIPCMessage(
  request: IpcAuthorizationRequest
): IpcAuthorizationResult {
  const entry = getAuthorizationPolicyEntry(request);
  if (!entry) {
    return reject('Missing IPC authorization policy');
  }
  const disabledResult = rejectDisabledIncidentCapabilityFamily(entry.key);
  if (disabledResult) {
    return disabledResult;
  }
  return entry.authorize(request);
}

export function authorizeRegisteredProjectExportRuntimeMessage(
  request: ProjectExportRuntimeAuthorizationInput
): Promise<IpcAuthorizationResult> {
  const entry = getProjectExportAuthorizationPolicyEntry();
  if (!entry) {
    return Promise.resolve(reject('Missing IPC authorization policy'));
  }
  const disabledResult = rejectDisabledIncidentCapabilityFamily(entry.key);
  if (disabledResult) {
    return Promise.resolve(disabledResult);
  }
  return entry.authorize({
    kind: 'project-export-runtime',
    message: request.message,
    sender: request.sender,
  });
}

export function authorizeMissingPolicyForTests(): IpcAuthorizationResult {
  return reject('Missing IPC authorization policy');
}
