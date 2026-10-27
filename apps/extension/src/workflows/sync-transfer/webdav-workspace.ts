import {
  commandSyncWorkspaceAllocation,
  completeSyncWorkspaceMarker,
  loadSyncWorkspaceAllocation,
  prepareSyncWorkspaceMarker,
  type SyncWorkspaceAllocation,
} from '../../composition/persistence/remote-connection/workspace-allocation';
import {
  parseSyncConnectionIdentity,
  parseConnectionAuthentication,
  type SyncConnectionAuthentication,
  sameSyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import { parseSyncWorkspaceMarker } from '../../contracts/sync-workspace';
import { SyncCatalogError } from './catalog';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { allocateWebdavWorkspaceRoot, createWebdavWorkspaceWriter } from './webdav';
import { createSyncWorkspaceRequests } from './connection-requests';
import { prepareSyncWorkspaceJoin, SyncWorkspaceError } from './workspace';

type WebdavWorkspaceWriter = Awaited<ReturnType<typeof createWebdavWorkspaceWriter>>;

/** Bind each client to this exact native plan and revision. The caller owns request admission and drain. */
type WebdavWorkspaceClientFactory = (
  plan: SyncWorkspaceAllocation,
  signal: AbortSignal
) => Promise<WebdavWorkspaceWriter>;

/** Fixed creation failures contain no endpoint, provider body or native exception. */
class WebdavWorkspaceCreationError extends Error {
  constructor(
    readonly code: 'allocation-refused' | 'foreign-metadata' | 'unavailable' | 'containment-failed'
  ) {
    super(code);
    this.name = 'WebdavWorkspaceCreationError';
  }
}

function frozenIdentity(plan: SyncWorkspaceAllocation) {
  if (!plan.marker) throw new WebdavWorkspaceCreationError('allocation-refused');
  const identity = parseSyncWorkspaceMarker(plan.marker.text);
  if (
    identity.spaceId !== plan.spaceId ||
    identity.bootstrapId !== plan.bootstrapId ||
    identity.fingerprint !== plan.marker.fingerprint
  )
    throw new WebdavWorkspaceCreationError('allocation-refused');
  return identity;
}

async function rootContents(remote: SyncRemoteStore, signal: AbortSignal) {
  signal.throwIfAborted();
  const page = await remote.list('', { signal });
  signal.throwIfAborted();
  if (page.nextCursor !== null) throw new SyncWorkspaceError('metadata-limit');
  if (
    page.objects.length !== 0 ||
    page.prefixes.length > 1 ||
    page.prefixes.some((prefix) => prefix !== '.sniptale/')
  )
    throw new WebdavWorkspaceCreationError('foreign-metadata');
  return page.prefixes.length === 1;
}

async function emptyMetadata(remote: SyncRemoteStore, signal: AbortSignal) {
  signal.throwIfAborted();
  const page = await remote.list('.sniptale/', { signal });
  signal.throwIfAborted();
  if (page.nextCursor !== null) throw new SyncWorkspaceError('metadata-limit');
  if (page.objects.length !== 0 || page.prefixes.length !== 0)
    throw new WebdavWorkspaceCreationError('foreign-metadata');
}

async function prepareMetadata(client: WebdavWorkspaceWriter, signal: AbortSignal) {
  if (!(await rootContents(client.remote, signal))) {
    signal.throwIfAborted();
    try {
      await client.createMetadataDirectory(signal);
    } catch (error) {
      // A 405 is only a reason to inspect this positively allocated root again.
      if (!(error instanceof SyncRemoteError) || error.status !== 405) throw error;
    }
    signal.throwIfAborted();
    if (!(await rootContents(client.remote, signal)))
      throw new WebdavWorkspaceCreationError('foreign-metadata');
  }
  await emptyMetadata(client.remote, signal);
}

async function nativeCommand(
  signal: AbortSignal,
  operation: () => Promise<SyncWorkspaceAllocation>
) {
  signal.throwIfAborted();
  try {
    const plan = await operation();
    signal.throwIfAborted();
    return plan;
  } catch {
    if (signal.aborted) throw new SyncWorkspaceError('cancelled');
    throw new WebdavWorkspaceCreationError('allocation-refused');
  }
}

async function complete(
  plan: SyncWorkspaceAllocation,
  checked: Awaited<ReturnType<typeof prepareSyncWorkspaceJoin>>,
  signal: AbortSignal
) {
  const allocation = await nativeCommand(signal, () =>
    completeSyncWorkspaceMarker(plan.identity, checked.identity)
  );
  return { allocation, ...checked };
}

async function publish(
  plan: SyncWorkspaceAllocation,
  client: WebdavWorkspaceWriter,
  signal: AbortSignal
) {
  const expected = frozenIdentity(plan);
  if (!plan.marker) throw new WebdavWorkspaceCreationError('allocation-refused');
  signal.throwIfAborted();
  try {
    await client.publishMarker(plan.marker.text, signal);
  } catch (error) {
    signal.throwIfAborted();
    if (
      !(error instanceof SyncRemoteError) ||
      (error.code !== 'collision' && error.code !== 'transport' && error.code !== 'temporary')
    )
      throw error;
    // One checked readback can establish a lost acknowledgement. Failure preserves uncertainty.
    try {
      const checked = await prepareSyncWorkspaceJoin(client.remote, signal, expected);
      return await complete(plan, checked, signal);
    } catch (readbackError) {
      if (signal.aborted) throw new SyncWorkspaceError('cancelled');
      if (readbackError instanceof WebdavWorkspaceCreationError) throw readbackError;
      throw error;
    }
  }
  signal.throwIfAborted();
  const checked = await prepareSyncWorkspaceJoin(client.remote, signal, expected);
  return complete(plan, checked, signal);
}

/**
 * Finish one positively allocated WebDAV root using immutable native evidence.
 * Each explicit invocation performs at most one conditional PUT. Ready roots are read only.
 * The factory must reject stale revisions immediately before every HTTP dispatch.
 */
export async function finishWebdavWorkspaceCreation(
  createClientForPlan: WebdavWorkspaceClientFactory,
  expectedIdentityInput: unknown,
  signal: AbortSignal
) {
  const expected = parseSyncConnectionIdentity(expectedIdentityInput);
  if (!expected) throw new WebdavWorkspaceCreationError('allocation-refused');
  try {
    signal.throwIfAborted();
    let plan = await loadSyncWorkspaceAllocation();
    signal.throwIfAborted();
    if (
      !plan ||
      !sameSyncConnectionIdentity(plan.identity, expected) ||
      plan.phase === 'planned' ||
      plan.phase === 'allocating' ||
      plan.phase === 'abandoned'
    )
      throw new WebdavWorkspaceCreationError('allocation-refused');
    let client = await createClientForPlan(structuredClone(plan), signal);
    signal.throwIfAborted();
    if (plan.phase === 'ready') {
      const checked = await prepareSyncWorkspaceJoin(client.remote, signal, frozenIdentity(plan));
      signal.throwIfAborted();
      // Recheck the native revision after the read-only asynchronous observation.
      const current = await loadSyncWorkspaceAllocation();
      signal.throwIfAborted();
      if (!current || !sameSyncConnectionIdentity(current.identity, plan.identity))
        throw new WebdavWorkspaceCreationError('allocation-refused');
      return { allocation: current, ...checked };
    }
    if (plan.phase === 'allocated') {
      if (await rootContents(client.remote, signal))
        throw new WebdavWorkspaceCreationError('foreign-metadata');
      const allocatedIdentity = plan.identity;
      plan = await nativeCommand(signal, () => prepareSyncWorkspaceMarker(allocatedIdentity));
      client = await createClientForPlan(structuredClone(plan), signal);
      signal.throwIfAborted();
    }
    if (plan.phase === 'publishing-marker') {
      try {
        const checked = await prepareSyncWorkspaceJoin(client.remote, signal, frozenIdentity(plan));
        return await complete(plan, checked, signal);
      } catch (error) {
        if (!(error instanceof SyncWorkspaceError) || error.code !== 'marker-missing') throw error;
      }
      // Only an absent initial marker permits publication. Existing metadata remains untouched.
      if (!(await rootContents(client.remote, signal)))
        throw new WebdavWorkspaceCreationError('foreign-metadata');
      await emptyMetadata(client.remote, signal);
    } else {
      frozenIdentity(plan);
      await prepareMetadata(client, signal);
    }
    const publicationIdentity = plan.identity;
    plan = await nativeCommand(signal, () =>
      commandSyncWorkspaceAllocation(publicationIdentity, 'publish-marker')
    );
    client = await createClientForPlan(structuredClone(plan), signal);
    signal.throwIfAborted();
    return await publish(plan, client, signal);
  } catch (error) {
    if (signal.aborted) throw new SyncWorkspaceError('cancelled');
    if (
      error instanceof WebdavWorkspaceCreationError ||
      error instanceof SyncWorkspaceError ||
      error instanceof SyncRemoteError ||
      error instanceof SyncCatalogError
    )
      throw error;
    throw new WebdavWorkspaceCreationError('unavailable');
  }
}

/**
 * Own one creation attempt and its in-memory credentials until all issued IO is contained.
 * The caller must close this execution before it reports lifecycle or privacy completion.
 * This installs no profile or connection and never adopts an uncertain allocating root.
 */
export function createWebdavWorkspaceCreation(options: {
  identity: unknown;
  authentication: unknown;
  hasOriginPermission: (origin: string) => Promise<boolean>;
}) {
  let identity;
  let detachedAuthentication: unknown;
  try {
    identity = parseSyncConnectionIdentity(structuredClone(options.identity));
    detachedAuthentication = structuredClone(options.authentication);
  } catch {
    throw new SyncRemoteError('invalid-configuration');
  }
  if (!identity) throw new SyncRemoteError('invalid-configuration');
  const selectedIdentity = identity;
  const hasOriginPermission = options.hasOriginPermission;
  const controller = new AbortController();
  let authentication: SyncConnectionAuthentication | null = null;
  let requests: ReturnType<typeof createSyncWorkspaceRequests> | null = null;
  let running: Promise<Awaited<ReturnType<typeof finishWebdavWorkspaceCreation>>> | null = null;
  let closing: Promise<void> | null = null;
  let contained = false;

  function clientOptions(plan: SyncWorkspaceAllocation) {
    return {
      rootUrl: plan.rootUrl,
      authentication: async () => {
        controller.signal.throwIfAborted();
        if (!authentication) throw new SyncRemoteError('authentication');
        return authentication;
      },
      request: (signal: AbortSignal, issue: (signal: AbortSignal) => Promise<Response>) => {
        if (!requests) throw new SyncRemoteError('cancelled');
        return requests.request(plan.identity, plan.phase, signal, issue);
      },
    };
  }
  async function execute() {
    const signal = controller.signal;
    let outcome:
      | { kind: 'success'; value: Awaited<ReturnType<typeof finishWebdavWorkspaceCreation>> }
      | { kind: 'failure'; error: Error };
    try {
      signal.throwIfAborted();
      let plan = await loadSyncWorkspaceAllocation();
      signal.throwIfAborted();
      if (
        !plan ||
        !sameSyncConnectionIdentity(plan.identity, selectedIdentity) ||
        plan.phase === 'allocating' ||
        plan.phase === 'abandoned'
      )
        throw new WebdavWorkspaceCreationError('allocation-refused');
      authentication = parseConnectionAuthentication(detachedAuthentication, plan.accountId);
      detachedAuthentication = null;
      if (!authentication) throw new SyncRemoteError('invalid-configuration');
      requests = createSyncWorkspaceRequests({ allocation: plan, hasOriginPermission });
      if (plan.phase === 'planned') {
        const plannedIdentity = plan.identity;
        plan = await nativeCommand(signal, () =>
          commandSyncWorkspaceAllocation(plannedIdentity, 'allocate')
        );
        await allocateWebdavWorkspaceRoot(clientOptions(plan), signal);
        const allocatingIdentity = plan.identity;
        plan = await nativeCommand(signal, () =>
          commandSyncWorkspaceAllocation(allocatingIdentity, 'confirm')
        );
      }
      const result = await finishWebdavWorkspaceCreation(
        (current, requestSignal) =>
          createWebdavWorkspaceWriter(clientOptions(current), requestSignal),
        plan.identity,
        signal
      );
      outcome = { kind: 'success', value: result };
    } catch (error) {
      if (signal.aborted) outcome = { kind: 'failure', error: new SyncWorkspaceError('cancelled') };
      else if (
        error instanceof WebdavWorkspaceCreationError ||
        error instanceof SyncWorkspaceError ||
        error instanceof SyncRemoteError ||
        error instanceof SyncCatalogError
      )
        outcome = { kind: 'failure', error };
      else outcome = { kind: 'failure', error: new WebdavWorkspaceCreationError('unavailable') };
    }
    try {
      await requests?.close();
      contained = true;
    } catch {
      contained = false;
    }
    authentication = null;
    detachedAuthentication = null;
    if (!contained) throw new WebdavWorkspaceCreationError('containment-failed');
    if (outcome.kind === 'failure') throw outcome.error;
    return outcome.value;
  }
  function run() {
    running ??= execute();
    return running;
  }
  function close(): Promise<void> {
    if (closing) return closing;
    controller.abort();
    closing = (async () => {
      let failed = false;
      try {
        await requests?.close();
      } catch {
        failed = true;
      }
      if (running) await running.catch(() => undefined);
      else {
        authentication = null;
        detachedAuthentication = null;
        contained = true;
      }
      if (failed || !contained) throw new WebdavWorkspaceCreationError('containment-failed');
    })();
    return closing;
  }
  return { run, close };
}
