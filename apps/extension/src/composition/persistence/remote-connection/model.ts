import {
  parseSyncWorkspaceIdentity,
  type SyncWorkspaceIdentity,
} from '../../../contracts/sync-workspace';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';

export interface SyncConnectionScope {
  spaceId: string;
  connectionGeneration: number;
  profileCreatedAt: number;
}
export interface SyncConnectionBinding extends SyncConnectionScope {
  provider: 'webdav';
  rootUrl: string;
  accountId: string;
}
export interface SyncConnectionIdentity {
  incarnation: string;
  revision: number;
}
/** Exact native workflow source. Endpoint and credential authority remain with native evidence. */
export interface SyncWorkspaceSource {
  kind: 'allocation' | 'join';
  identity: SyncConnectionIdentity;
}
/** Binary objects remain remote until an admitted selected operation needs them. */
export type SyncStoragePolicy = { version: 1; mode: 'on-demand' };

/** Accept only the supported closed storage policy and detach the caller value. */
export function parseSyncStoragePolicy(value: unknown): SyncStoragePolicy | null {
  if (
    !isRecord(value) ||
    !connectionExact(value, ['version', 'mode']) ||
    value['version'] !== 1 ||
    value['mode'] !== 'on-demand'
  )
    return null;
  return { version: 1, mode: 'on-demand' };
}
export interface SyncConnectionMetadata {
  version: 1;
  kind: 'sync-connection';
  key: 'connection';
  binding: SyncConnectionBinding;
  identity: SyncConnectionIdentity;
  phase: 'updating-auth' | 'active' | 'paused';
  updateNonce: string | null;
  credentialId: string | null;
  workspace?: SyncWorkspaceIdentity;
  storagePolicy?: SyncStoragePolicy;
  pausedBeforeAuthUpdate?: true;
}
export type SyncConnectionAuthentication =
  | { kind: 'basic'; username: string; password: string }
  | { kind: 'bearer'; accessToken: string };

export function connectionExact(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
export function connectionUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)
  );
}
export function connectionText(value: unknown, limit: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= limit &&
    Array.from(value).every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
    )
  );
}
function ordinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
export function parseSyncConnectionIdentity(value: unknown): SyncConnectionIdentity | null {
  if (
    !isRecord(value) ||
    !connectionExact(value, ['incarnation', 'revision']) ||
    !connectionUuid(value['incarnation']) ||
    !ordinal(value['revision']) ||
    value['revision'] < 1
  )
    return null;
  return { incarnation: value['incarnation'], revision: value['revision'] };
}
/** Parse a closed native source and reconstruct its nested identity without caller references. */
export function parseSyncWorkspaceSource(value: unknown): SyncWorkspaceSource | null {
  if (
    !isRecord(value) ||
    !connectionExact(value, ['kind', 'identity']) ||
    (value['kind'] !== 'allocation' && value['kind'] !== 'join')
  )
    return null;
  const identity = parseSyncConnectionIdentity(value['identity']);
  return identity ? { kind: value['kind'], identity } : null;
}
export function sameSyncConnectionIdentity(
  left: SyncConnectionIdentity,
  right: SyncConnectionIdentity
): boolean {
  return left.incarnation === right.incarnation && left.revision === right.revision;
}
export function sameConnectionScope(
  left: SyncConnectionScope,
  right: SyncConnectionScope
): boolean {
  return (
    left.spaceId === right.spaceId &&
    left.connectionGeneration === right.connectionGeneration &&
    left.profileCreatedAt === right.profileCreatedAt
  );
}
/** Admit a canonical HTTPS collection URL without credentials, query or fragment. */
export function parseConnectionRootUrl(value: unknown): string | null {
  if (!connectionText(value, 4096)) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.endsWith('/') ||
      url.href !== value
    )
      return null;
  } catch {
    return null;
  }
  return value;
}
export function parseConnectionBinding(value: unknown): SyncConnectionBinding | null {
  if (
    !isRecord(value) ||
    !connectionExact(value, [
      'provider',
      'rootUrl',
      'accountId',
      'spaceId',
      'connectionGeneration',
      'profileCreatedAt',
    ]) ||
    value['provider'] !== 'webdav' ||
    !connectionText(value['rootUrl'], 4096) ||
    !connectionText(value['accountId'], 1024) ||
    !connectionText(value['spaceId'], 256) ||
    !ordinal(value['connectionGeneration']) ||
    value['connectionGeneration'] < 1 ||
    !ordinal(value['profileCreatedAt'])
  )
    return null;
  if (!parseConnectionRootUrl(value['rootUrl'])) return null;
  return {
    provider: 'webdav',
    rootUrl: value['rootUrl'],
    accountId: value['accountId'],
    spaceId: value['spaceId'],
    connectionGeneration: value['connectionGeneration'],
    profileCreatedAt: value['profileCreatedAt'],
  };
}
export function sameConnectionBinding(
  left: SyncConnectionBinding,
  right: SyncConnectionBinding
): boolean {
  return (
    sameConnectionScope(left, right) &&
    left.provider === right.provider &&
    left.rootUrl === right.rootUrl &&
    left.accountId === right.accountId
  );
}
export function parseConnectionMetadata(value: unknown): SyncConnectionMetadata | null {
  if (
    !isRecord(value) ||
    !connectionExact(value, [
      'version',
      'kind',
      'key',
      'binding',
      'identity',
      'phase',
      'updateNonce',
      'credentialId',
      ...(Object.hasOwn(value, 'workspace') ? ['workspace'] : []),
      ...(Object.hasOwn(value, 'storagePolicy') ? ['storagePolicy'] : []),
      ...(Object.hasOwn(value, 'pausedBeforeAuthUpdate') ? ['pausedBeforeAuthUpdate'] : []),
    ]) ||
    value['version'] !== 1 ||
    value['kind'] !== 'sync-connection' ||
    value['key'] !== 'connection'
  )
    return null;
  const storagePolicy = parseSyncStoragePolicy(
    Object.hasOwn(value, 'storagePolicy')
      ? value['storagePolicy']
      : { version: 1, mode: 'on-demand' }
  );
  if (!storagePolicy) return null;
  let workspace: SyncWorkspaceIdentity | null = null;
  if (Object.hasOwn(value, 'workspace')) {
    try {
      workspace = parseSyncWorkspaceIdentity(value['workspace']);
    } catch {
      return null;
    }
    if (!workspace) return null;
  }
  const binding = parseConnectionBinding(value['binding']);
  const identity = parseSyncConnectionIdentity(value['identity']);
  const phase = value['phase'];
  const updateNonce = value['updateNonce'];
  const credentialId = value['credentialId'];
  if (
    !binding ||
    (workspace !== null && workspace.spaceId !== binding.spaceId) ||
    !identity ||
    !['updating-auth', 'active', 'paused'].includes(typeof phase === 'string' ? phase : '') ||
    !(updateNonce === null || connectionUuid(updateNonce)) ||
    !(credentialId === null || connectionUuid(credentialId))
  )
    return null;
  if (phase === 'updating-auth') {
    if (
      updateNonce === null ||
      (Object.hasOwn(value, 'pausedBeforeAuthUpdate') && value['pausedBeforeAuthUpdate'] !== true)
    )
      return null;
    return {
      version: 1,
      kind: 'sync-connection',
      key: 'connection',
      binding,
      identity,
      phase,
      updateNonce,
      credentialId,
      storagePolicy,
      ...(value['pausedBeforeAuthUpdate'] === true
        ? { pausedBeforeAuthUpdate: true as const }
        : {}),
      ...(workspace ? { workspace } : {}),
    };
  }
  if (
    (phase !== 'active' && phase !== 'paused') ||
    updateNonce !== null ||
    credentialId === null ||
    Object.hasOwn(value, 'pausedBeforeAuthUpdate')
  )
    return null;
  return {
    version: 1,
    kind: 'sync-connection',
    key: 'connection',
    binding,
    identity,
    phase,
    updateNonce,
    credentialId,
    storagePolicy,
    ...(workspace ? { workspace } : {}),
  };
}
export function parseConnectionAuthentication(
  value: unknown,
  accountId: string
): SyncConnectionAuthentication | null {
  if (!isRecord(value)) return null;
  if (
    value['kind'] === 'basic' &&
    connectionExact(value, ['kind', 'username', 'password']) &&
    connectionText(value['username'], 1024) &&
    value['username'] === accountId &&
    !value['username'].includes(':') &&
    connectionText(value['password'], 8192)
  )
    return { kind: 'basic', username: value['username'], password: value['password'] };
  if (
    value['kind'] === 'bearer' &&
    connectionExact(value, ['kind', 'accessToken']) &&
    connectionText(value['accessToken'], 8192)
  )
    return { kind: 'bearer', accessToken: value['accessToken'] };
  return null;
}
