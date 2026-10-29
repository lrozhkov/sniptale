import { deleteProjectExport } from '../../../apps/extension/src/composition/persistence/projects/index.exports';
import { createArchiveMemorySink } from '../../../apps/extension/src/composition/archive-transfer/test-support';
import { openArchiveReader } from '../../../apps/extension/src/composition/archive-transfer';
import { readSettingsTransferSnapshot } from '../../../apps/extension/src/composition/persistence/settings-transfer/read';
import { SETTINGS_TRANSFER_DOMAIN_IDS } from '../../../apps/extension/src/workflows/settings-transfer/registry';
import { buildMediaHubBackupExportPlanFromLibraryV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/inventory';
import { createMediaHubBackupExportOptions } from '../../../apps/extension/src/workflows/media-hub-backup/v6/options';
import { exportMediaHubBackupV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/export';
import { inspectMediaHubBackupV6 } from '../../../apps/extension/src/workflows/media-hub-backup/v6/inspect';
import { MEDIA_HUB_BACKUP_ROOT_PROFILE_ORDER } from '../../../apps/extension/src/workflows/media-hub-backup/v6/contracts';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isEncryptedSecretEnvelope } from '@sniptale/platform/security/local-secret-crypto';
import {
  initDB,
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
} from '../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core';
import { parseSyncCaptureRecord } from '../../../apps/extension/src/composition/persistence/sync-capture/guards';
import type { SyncConnectionMetadata } from '../../../apps/extension/src/composition/persistence/remote-connection/model';
import {
  beginSyncConnectionAuthUpdate,
  commitSyncConnectionAuthentication,
  commandSyncConnection,
  loadSyncConnection,
  loadSyncConnectionAuthentication,
} from '../../../apps/extension/src/composition/persistence/remote-connection/store';
import { createSyncConnectionRequests } from '../../../apps/extension/src/workflows/sync-transfer/connection-requests';
import { createWebdavRemoteStore } from '../../../apps/extension/src/workflows/sync-transfer/webdav';
import {
  SyncRemoteError,
  type SyncRemoteStore,
} from '../../../apps/extension/src/workflows/sync-transfer/remote-store';

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error('Native connection fixture is unavailable.');
  return value;
}
function result(error: unknown) {
  return error instanceof SyncRemoteError
    ? { code: error.code, status: error.status }
    : { code: 'fixture', status: null };
}
async function captureProfile() {
  const db = await initDB();
  const profile = parseSyncCaptureRecord(await db.get(SYNC_CAPTURE_STORE, 'profile'));
  if (!profile || profile.kind !== 'profile')
    throw new Error('Native connection fixture profile is missing.');
  return profile;
}

/** Test-only native connection ingress; the production extension has no caller. */
export function createWebdavConnectionHarness(setStore: (remote: SyncRemoteStore) => void) {
  let owned: {
    metadata: SyncConnectionMetadata;
    requests: ReturnType<typeof createSyncConnectionRequests>;
    remote: SyncRemoteStore;
  } | null = null;

  async function inspect() {
    const metadata = required(await loadSyncConnection());
    const profile = await captureProfile();
    const db = await initDB();
    const credential: unknown = await db.get(SYNC_CONNECTION_STORE, 'credential');
    const fields = ['version', 'kind', 'key', 'credentialId', 'cryptoKey', 'envelope'];
    const credentialFieldsOnly =
      isRecord(credential) &&
      Object.keys(credential).length === fields.length &&
      fields.every((field) => Object.hasOwn(credential, field));
    const key =
      isRecord(credential) && credential['cryptoKey'] instanceof CryptoKey
        ? credential['cryptoKey']
        : null;
    const envelope = isRecord(credential) ? credential['envelope'] : null;
    const encryptedEnvelope = isEncryptedSecretEnvelope(envelope) && envelope.version === 2;
    let keyExportRefused = false;
    if (key) {
      try {
        await crypto.subtle.exportKey('raw', key);
      } catch {
        keyExportRefused = true;
      }
    }
    return {
      identity: metadata.identity,
      phase: metadata.phase,
      profile: {
        enabled: profile.enabled,
        spaceId: profile.spaceId,
        connectionGeneration: profile.connectionGeneration,
        createdAt: profile.createdAt,
      },
      credential: {
        present: credential !== undefined,
        credentialFieldsOnly,
        nonExportableKey: key !== null && key.extractable === false,
        keyExportRefused,
        encryptedEnvelope,
        contextBound:
          encryptedEnvelope &&
          envelope.additionalData['rootUrl'] === metadata.binding.rootUrl &&
          envelope.additionalData['accountId'] === metadata.binding.accountId &&
          envelope.additionalData['spaceId'] === metadata.binding.spaceId &&
          envelope.additionalData['incarnation'] === metadata.identity.incarnation,
      },
    };
  }

  async function activate(metadata: SyncConnectionMetadata) {
    if (metadata.phase !== 'active') throw new Error('Native connection fixture is not active.');
    await owned?.requests.close();
    owned = null;
    const requests = createSyncConnectionRequests({
      identity: metadata.identity,
      hasOriginPermission: (origin) => chrome.permissions.contains({ origins: [`${origin}/*`] }),
    });
    try {
      const remote = await createWebdavRemoteStore(
        {
          rootUrl: metadata.binding.rootUrl,
          authentication: () => loadSyncConnectionAuthentication(metadata.identity),
          request: requests.request,
        },
        new AbortController().signal
      );
      owned = { metadata, requests, remote };
      setStore(remote);
      return inspect();
    } catch {
      await requests.close();
      throw new Error('Native connection fixture activation failed.');
    }
  }

  async function configure(input: { rootUrl: string; username: string; password: string }) {
    const profile = await captureProfile();
    const reservation = await beginSyncConnectionAuthUpdate(
      {
        provider: 'webdav',
        rootUrl: input.rootUrl,
        accountId: input.username,
        spaceId: profile.spaceId,
        connectionGeneration: profile.connectionGeneration,
        profileCreatedAt: profile.createdAt,
      },
      null
    );
    const metadata = await commitSyncConnectionAuthentication(reservation, {
      kind: 'basic',
      username: input.username,
      password: input.password,
    });
    return activate(metadata);
  }

  async function rotate(input: { username: string; password: string }) {
    const current = required(owned);
    const reservation = await beginSyncConnectionAuthUpdate(
      current.metadata.binding,
      current.metadata.identity
    );
    const metadata = await commitSyncConnectionAuthentication(reservation, {
      kind: 'basic',
      username: input.username,
      password: input.password,
    });
    return activate(metadata);
  }

  async function pause() {
    const current = required(owned);
    await commandSyncConnection(current.metadata.identity, 'pause');
    await current.requests.close();
    return inspect();
  }

  async function probe() {
    try {
      await required(owned).remote.list('', { signal: new AbortController().signal });
      return { code: 'success', status: null };
    } catch (error) {
      return result(error);
    }
  }

  /** Always attempt the next DAV operation, including after the controlled PUT is aborted. */
  async function writeThenList(key: string) {
    const current = required(owned);
    const directory = await navigator.storage.getDirectory();
    const handle = await directory.getFileHandle('dav-fixture-source.bin');
    const file = await handle.getFile();
    let write: { code: string; status: number | null } = { code: 'success', status: null };
    try {
      await current.remote.write(key, file, new AbortController().signal);
    } catch (error) {
      write = result(error);
    }
    const next = await probe();
    return { write, next };
  }

  /** Export the disposable native fixture through the ordinary transfer owners. */
  async function transferExclusion() {
    const metadata = required(await loadSyncConnection());
    const authentication = await loadSyncConnectionAuthentication(metadata.identity);
    const db = await initDB();
    const before = JSON.stringify(await db.getAll(SYNC_CONNECTION_STORE));
    const credential: unknown = await db.get(SYNC_CONNECTION_STORE, 'credential');
    const envelope = isRecord(credential) ? credential['envelope'] : null;
    const forbidden = new Set([
      metadata.identity.incarnation,
      metadata.credentialId,
      ...(authentication.kind === 'basic'
        ? [
            authentication.password,
            `Basic ${btoa(`${authentication.username}:${authentication.password}`)}`,
          ]
        : [authentication.accessToken, `Bearer ${authentication.accessToken}`]),
      ...(isEncryptedSecretEnvelope(envelope) ? [envelope.iv, envelope.ciphertext] : []),
    ]);
    const authorityFields = new Set([
      'sync_connection',
      'cryptoKey',
      'ciphertext',
      'credentialId',
      'updateNonce',
      'incarnation',
      'password',
      'accessToken',
      'authorization',
    ]);
    function containsAuthority(value: unknown): boolean {
      if (typeof value === 'string') return forbidden.has(value);
      if (Array.isArray(value)) return value.some(containsAuthority);
      if (!isRecord(value)) return false;
      return Object.entries(value).some(
        ([key, child]) => authorityFields.has(key) || containsAuthority(child)
      );
    }
    const plan = await buildMediaHubBackupExportPlanFromLibraryV6(
      createMediaHubBackupExportOptions({ scope: 'all', includeDrafts: true })
    );
    if (plan.roots.length > 16 || plan.manifest.totals.bytes > 8 * 1024 * 1024)
      throw new Error('Native connection export fixture exceeds its bounded inventory.');
    let backupExcluded = !containsAuthority(plan.manifest);
    for (const root of plan.roots) {
      const payload = await root.load();
      if (JSON.stringify(payload.metadata).length > 4 * 1024 * 1024)
        throw new Error('Native connection export metadata exceeds its fixture budget.');
      backupExcluded = backupExcluded && !containsAuthority(payload.metadata);
    }
    const sink = createArchiveMemorySink();
    await exportMediaHubBackupV6({ plan, sink: sink.sink });
    const archive = sink.blob();
    // The ordinary inspector requires every archive entry to belong to a declared portable root.
    const inspected = await inspectMediaHubBackupV6(archive);
    const backupProfiles = [
      ...new Set(
        inspected.descriptors.map((descriptor) =>
          descriptor.rootKind === 'media' ? `media:${descriptor.mediaSubtype}` : descriptor.rootKind
        )
      ),
    ].sort();
    backupExcluded =
      backupExcluded &&
      backupProfiles.every((profile) =>
        MEDIA_HUB_BACKUP_ROOT_PROFILE_ORDER.some((allowed) => profile === allowed)
      );
    const reader = await openArchiveReader(archive);
    let backupEntries = 0;
    try {
      backupEntries = reader.entries().length;
      backupExcluded =
        backupExcluded &&
        reader
          .entries()
          .every(
            (entry) =>
              !entry.path.includes('sync_connection') &&
              !entry.path.includes(metadata.identity.incarnation)
          );
    } finally {
      await reader.close();
    }
    const settings = await readSettingsTransferSnapshot();
    if (JSON.stringify(settings).length > 2 * 1024 * 1024)
      throw new Error('Native connection Settings fixture exceeds its metadata budget.');
    const settingsDomains = Object.keys(settings.domains).sort();
    const settingsExcluded =
      !containsAuthority(settings) &&
      settingsDomains.length === SETTINGS_TRANSFER_DOMAIN_IDS.length &&
      settingsDomains.every((id) => SETTINGS_TRANSFER_DOMAIN_IDS.includes(id));
    const afterAuthentication = await loadSyncConnectionAuthentication(metadata.identity);
    return {
      backupRoots: inspected.descriptors.length,
      backupEntries,
      backupProfiles,
      backupExcluded,
      settingsDomains,
      settingsExcluded,
      nativeConnectionUnchanged:
        before === JSON.stringify(await db.getAll(SYNC_CONNECTION_STORE)) &&
        JSON.stringify(authentication) === JSON.stringify(afterAuthentication),
    };
  }

  return {
    configure,
    rotate,
    restore: async () => activate(required(await loadSyncConnection())),
    inspect,
    pause,
    probe,
    writeThenList,
    transferExclusion,
    removeSyntheticExport: deleteProjectExport,
    close: async () => {
      await owned?.requests.close();
    },
  };
}
