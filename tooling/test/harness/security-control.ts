import { createWebdavLifecycleHarness } from './webdav-lifecycle';
type SecurityCheckpoint = 'persistence-before-commit' | 'popup-export-after-admission';
type SecurityControlCommand =
  | { checkpoint: SecurityCheckpoint; requestId: string; type: 'pause' | 'release' }
  | { checkpoint: SecurityCheckpoint; requestId: string; type: 'wait-until-paused' }
  | { requestId: string; type: 'snapshot' };

type SecurityControlResponse = {
  ok: boolean;
  paused?: SecurityCheckpoint[];
  requestId: string;
  reached?: SecurityCheckpoint[];
  sync?: unknown;
};

function isSecurityCheckpoint(value: unknown): value is SecurityCheckpoint {
  return value === 'persistence-before-commit' || value === 'popup-export-after-admission';
}

function parseSecurityControlResponse(value: unknown): SecurityControlResponse | null {
  if (!value || typeof value !== 'object') return null;
  const ok = Reflect.get(value, 'ok');
  const paused = Reflect.get(value, 'paused');
  const reached = Reflect.get(value, 'reached');
  const requestId = Reflect.get(value, 'requestId');
  if (typeof ok !== 'boolean' || typeof requestId !== 'string') return null;
  if (paused !== undefined && (!Array.isArray(paused) || !paused.every(isSecurityCheckpoint))) {
    return null;
  }
  if (reached !== undefined && (!Array.isArray(reached) || !reached.every(isSecurityCheckpoint))) {
    return null;
  }
  return {
    ok,
    requestId,
    ...(paused === undefined ? {} : { paused }),
    ...(reached === undefined ? {} : { reached }),
    ...(Object.hasOwn(value, 'sync') ? { sync: Reflect.get(value, 'sync') } : {}),
  };
}

const port = chrome.runtime.connect({ name: 'sniptale:security-e2e-control:v1' });
const pending = new Map<string, (response: SecurityControlResponse) => void>();
let disconnected = false;

port.onMessage.addListener((message: unknown) => {
  const response = parseSecurityControlResponse(message);
  if (!response) return;
  pending.get(response.requestId)?.(response);
  pending.delete(response.requestId);
});
port.onDisconnect.addListener(() => {
  disconnected = true;
  for (const [requestId, resolve] of pending) {
    resolve({ ok: false, requestId });
  }
  pending.clear();
});

function send(
  command: Omit<SecurityControlCommand, 'requestId'>
): Promise<SecurityControlResponse> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve) => {
    pending.set(requestId, resolve);
    port.postMessage({ ...command, requestId });
  });
}

function disconnectLegacy(): void {
  if (disconnected) return;
  disconnected = true;
  for (const [requestId, resolve] of pending) resolve({ ok: false, requestId });
  pending.clear();
  port.disconnect();
}

/** Each lifecycle command releases its named Port after the short runtime acknowledgement. */
async function syncCommand(
  type:
    | 'sync-start'
    | 'sync-workspace-start'
    | 'sync-workspace-enroll'
    | 'sync-inspect'
    | 'sync-stop'
    | 'sync-erase',
  payload?: unknown
): Promise<unknown> {
  const requestId = crypto.randomUUID();
  const short = chrome.runtime.connect({ name: 'sniptale:security-e2e-control:v1' });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (response: SecurityControlResponse | null) => {
      if (settled) return;
      settled = true;
      short.onMessage.removeListener(receive);
      short.onDisconnect.removeListener(disconnect);
      short.disconnect();
      if (!response?.ok) reject(new Error('Security lifecycle command refused.'));
      else resolve(response.sync);
    };
    const receive = (value: unknown) => {
      const response = parseSecurityControlResponse(value);
      if (response?.requestId === requestId) finish(response);
    };
    const disconnect = () => {
      void chrome.runtime.lastError;
      finish(null);
    };
    short.onMessage.addListener(receive);
    short.onDisconnect.addListener(disconnect);
    try {
      short.postMessage({ type, requestId, ...(payload === undefined ? {} : { payload }) });
    } catch {
      finish(null);
    }
  });
}

const webdavLifecycle = createWebdavLifecycleHarness({ disconnectLegacy, command: syncCommand });

Object.assign(globalThis, {
  webdavLifecycle,
  securityE2EControl: {
    get disconnected() {
      return disconnected;
    },
    disconnect: disconnectLegacy,
    pause: (checkpoint: SecurityCheckpoint) => send({ checkpoint, type: 'pause' }),
    release: (checkpoint: SecurityCheckpoint) => send({ checkpoint, type: 'release' }),
    snapshot: () => send({ type: 'snapshot' }),
    waitUntilPaused: (checkpoint: SecurityCheckpoint) =>
      send({ checkpoint, type: 'wait-until-paused' }),
  },
});
