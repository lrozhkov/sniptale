import { withSyncConnectionAdmissionLock } from '../../composition/persistence/remote-connection/coordination';
import {
  parseSyncConnectionIdentity,
  sameSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import {
  loadSyncWorkspaceAllocation,
  type SyncWorkspaceAllocation,
} from '../../composition/persistence/remote-connection/workspace-allocation';
import { SyncRemoteError } from './remote-store';

interface ActiveRequest {
  controller: AbortController;
  done: Promise<void>;
}

/** Own issued requests and response bodies for one exact durable connection identity. */
export function createSyncConnectionRequests(options: {
  identity: SyncConnectionIdentity;
  hasOriginPermission: (origin: string) => Promise<boolean>;
}) {
  const parsedIdentity = parseSyncConnectionIdentity(structuredClone(options.identity));
  if (!parsedIdentity) throw new SyncRemoteError('invalid-configuration');
  const identity: SyncConnectionIdentity = parsedIdentity;
  const hasOriginPermission = options.hasOriginPermission;
  async function admit(check: () => void) {
    const before = await current();
    check();
    if (!(await hasOriginPermission(new URL(before.binding.rootUrl).origin)))
      throw new SyncRemoteError('access-denied');
    await current();
    check();
  }

  async function current() {
    const value = await loadSyncConnection();
    if (!value || value.phase !== 'active' || !sameSyncConnectionIdentity(value.identity, identity))
      throw new SyncRemoteError('authentication');
    return value;
  }

  const tracker = createIssuedRequests();
  return {
    request: (signal: AbortSignal, issue: (signal: AbortSignal) => Promise<Response>) =>
      tracker.request(signal, issue, admit),
    close: tracker.close,
  };
}

/** Own every phase client's issued requests for one immutable native allocation lifetime. */
export function createSyncWorkspaceRequests(options: {
  allocation: SyncWorkspaceAllocation;
  hasOriginPermission: (origin: string) => Promise<boolean>;
}) {
  let allocation: SyncWorkspaceAllocation;
  try {
    allocation = structuredClone(options.allocation);
  } catch {
    throw new SyncRemoteError('invalid-configuration');
  }
  const hasOriginPermission = options.hasOriginPermission;
  const tracker = createIssuedRequests();

  async function request(
    expectedIdentity: unknown,
    expectedPhase: SyncWorkspaceAllocation['phase'],
    signal: AbortSignal,
    issue: (signal: AbortSignal) => Promise<Response>
  ): Promise<Response> {
    // Detach the expected CAS identity before any admission wait.
    let expected: SyncConnectionIdentity | null;
    try {
      expected = parseSyncConnectionIdentity(structuredClone(expectedIdentity));
    } catch {
      throw new SyncRemoteError('authentication');
    }
    async function current() {
      const value = await loadSyncWorkspaceAllocation();
      if (
        !expected ||
        !value ||
        value.parentUrl !== allocation.parentUrl ||
        value.rootUrl !== allocation.rootUrl ||
        value.accountId !== allocation.accountId ||
        value.spaceId !== allocation.spaceId ||
        value.bootstrapId !== allocation.bootstrapId ||
        value.createdAt !== allocation.createdAt ||
        value.identity.incarnation !== allocation.identity.incarnation ||
        !sameSyncConnectionIdentity(value.identity, expected) ||
        value.phase !== expectedPhase ||
        (value.phase !== 'allocating' &&
          value.phase !== 'allocated' &&
          value.phase !== 'preparing-marker' &&
          value.phase !== 'publishing-marker' &&
          value.phase !== 'ready')
      )
        throw new SyncRemoteError('authentication');
      return value;
    }
    return tracker.request(signal, issue, async (check) => {
      const before = await current();
      check();
      if (!(await hasOriginPermission(new URL(before.rootUrl).origin)))
        throw new SyncRemoteError('access-denied');
      await current();
      check();
    });
  }
  return { request, close: tracker.close };
}

/** Keep issued transports and bodies owned until consumption or confirmed cancellation. */
function createIssuedRequests() {
  const active = new Set<ActiveRequest>();
  let closed = false;
  let containmentFailed = false;
  let closing: Promise<void> | null = null;

  async function request(
    signal: AbortSignal,
    issue: (signal: AbortSignal) => Promise<Response>,
    admit: (check: () => void) => Promise<void>
  ): Promise<Response> {
    if (closed) throw new SyncRemoteError('cancelled');
    signal.throwIfAborted();
    const controller = new AbortController();
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const state = { controller, done };
    active.add(state);
    let finished = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let cancellation: Promise<void> | null = null;
    let abortStream: (() => void) | null = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      signal.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', cancelBody);
      active.delete(state);
      resolveDone();
    };
    const cancelBody = () => {
      abortStream?.();
      if (!reader || cancellation) return;
      cancellation = reader.cancel().then(finish, () => {
        containmentFailed = true;
        finish();
      });
    };
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    controller.signal.addEventListener('abort', cancelBody, { once: true });
    const check = () => {
      if (closed || controller.signal.aborted) throw new SyncRemoteError('cancelled');
    };
    try {
      const admitted = await withSyncConnectionAdmissionLock(async () => {
        check();
        await admit(check);
        check();
        // Keep the promise nested. The admission lock ends after invocation, before headers or body.
        return { response: issue(controller.signal) };
      });
      const response = await admitted.response;
      if (!response.body) {
        check();
        finish();
        return response;
      }
      reader = response.body.getReader();
      if (controller.signal.aborted || closed) {
        cancelBody();
        await cancellation;
        throw new SyncRemoteError('cancelled');
      }
      let ended = false;
      const body = new ReadableStream<Uint8Array>({
        start(output) {
          abortStream = () => {
            if (ended) return;
            ended = true;
            output.error(new SyncRemoteError('cancelled'));
          };
        },
        async pull(output) {
          try {
            const part = await reader!.read();
            if (ended) return;
            if (part.done) {
              ended = true;
              output.close();
              finish();
            } else output.enqueue(part.value);
          } catch {
            if (!ended) {
              ended = true;
              output.error(
                new SyncRemoteError(controller.signal.aborted ? 'cancelled' : 'transport')
              );
            }
            finish();
          }
        },
        async cancel() {
          ended = true;
          cancelBody();
          await cancellation;
        },
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      if (reader && !finished) {
        cancelBody();
        await cancellation;
      }
      finish();
      if (error instanceof SyncRemoteError) throw error;
      throw new SyncRemoteError(controller.signal.aborted || closed ? 'cancelled' : 'transport');
    }
  }

  /** Close local admission synchronously and drain every issued request and body. */
  function close(): Promise<void> {
    if (closing) return closing;
    closed = true;
    const pending = [...active];
    for (const state of pending) state.controller.abort();
    closing = Promise.all(pending.map((state) => state.done)).then(() => {
      if (containmentFailed) throw new Error('Sync request containment failed.');
    });
    return closing;
  }
  return { request, close };
}
