import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  isSimplifyCompletion,
  isSimplifyCommand,
} from '../../contracts/messaging/contracts/runtime/actions/simplify';
import {
  readSimplifyPngDimensions,
  type OffscreenSimplifyCommand,
  type SimplifyCompletion,
} from '../../contracts/messaging/contracts/runtime-message/simplify.types';

interface SimplifyWorkerPort {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
}
interface WorkerSession {
  worker: SimplifyWorkerPort;
  timer: ReturnType<typeof setTimeout>;
  pixels: number;
  pending: {
    requestId: number;
    resolve(value: SimplifyCompletion): void;
    reject(error: Error): void;
  } | null;
}
const IDLE_MS = 120_000;

/** Owns static Workers, private source caches and immediate cancellation without recording-thread computation. */
export function createSimplifyService(deps: { createWorker(): SimplifyWorkerPort }) {
  const sessions = new Map<string, WorkerSession>();
  let nextRequestId = 0;
  const retire = (id: string, reason: string) => {
    const session = sessions.get(id);
    if (!session) return;
    sessions.delete(id);
    clearTimeout(session.timer);
    session.worker.onmessage = null;
    session.worker.onerror = null;
    session.worker.onmessageerror = null;
    session.worker.terminate();
    session.pending?.reject(new Error(reason));
    session.pending = null;
  };
  const touch = (id: string, session: WorkerSession) => {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => retire(id, 'Simplify session expired'), IDLE_MS);
  };
  const execute = (command: OffscreenSimplifyCommand): Promise<SimplifyCompletion> => {
    if (!isSimplifyCommand(command)) return Promise.reject(new Error('Invalid simplify command'));
    const id = command.sessionId;
    if (command.operation === 'cancel' || command.operation === 'dispose') {
      retire(id, 'Simplify computation cancelled');
      return Promise.resolve({ result: 'disposed' });
    }
    let session = sessions.get(id);
    if (command.operation === 'prepare') {
      if (session) return Promise.reject(new Error('Simplify session already exists'));
      const dimensions = readSimplifyPngDimensions(command.dataUrl);
      if (
        !dimensions ||
        sessions.size >= 6 ||
        [...sessions.values()].reduce(
          (total, entry) => total + entry.pixels,
          dimensions.width * dimensions.height
        ) > 33_554_432
      )
        return Promise.reject(new Error('Simplify source capacity exceeded'));
      const worker = deps.createWorker();
      session = {
        worker,
        pixels: dimensions.width * dimensions.height,
        timer: setTimeout(() => undefined, 0),
        pending: null,
      };
      sessions.set(id, session);
      const ownedSession = session;
      worker.onmessage = (event) => {
        if (sessions.get(id) !== ownedSession) return;
        const response = event.data;
        if (!isRecord(response) || response['requestId'] !== ownedSession.pending?.requestId)
          return;
        const pending = ownedSession.pending;
        if (!pending) return;
        if (
          !isSimplifyCompletion(response['completion']) ||
          !('sessionId' in response['completion']) ||
          response['completion'].sessionId !== id
        ) {
          retire(id, 'Simplify worker failed');
          return;
        }
        ownedSession.pending = null;
        touch(id, ownedSession);
        pending.resolve(response['completion']);
      };
      worker.onerror = () => retire(id, 'Simplify worker failed');
      worker.onmessageerror = () => retire(id, 'Simplify worker response failed');
    }
    if (!session) return Promise.reject(new Error('Simplify session is unavailable'));
    if (session.pending) return Promise.reject(new Error('Simplify session is busy'));
    touch(id, session);
    const ownedSession = session;
    return new Promise((resolve, reject) => {
      const requestId = ++nextRequestId;
      ownedSession.pending = { requestId, resolve, reject };
      try {
        ownedSession.worker.postMessage({ command, requestId });
      } catch {
        retire(id, 'Simplify worker dispatch failed');
      }
    });
  };
  return {
    execute,
    dispose() {
      for (const id of sessions.keys()) retire(id, 'Simplify service disposed');
    },
  };
}
