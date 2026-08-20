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

Object.assign(globalThis, {
  securityE2EControl: {
    get disconnected() {
      return disconnected;
    },
    pause: (checkpoint: SecurityCheckpoint) => send({ checkpoint, type: 'pause' }),
    release: (checkpoint: SecurityCheckpoint) => send({ checkpoint, type: 'release' }),
    snapshot: () => send({ type: 'snapshot' }),
    waitUntilPaused: (checkpoint: SecurityCheckpoint) =>
      send({ checkpoint, type: 'wait-until-paused' }),
  },
});
