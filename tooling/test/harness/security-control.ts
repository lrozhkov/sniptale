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

const port = chrome.runtime.connect({ name: 'sniptale:security-e2e-control:v1' });
const pending = new Map<string, (response: SecurityControlResponse) => void>();
let disconnected = false;

port.onMessage.addListener((message: unknown) => {
  if (!message || typeof message !== 'object') return;
  const response = message as Partial<SecurityControlResponse>;
  if (typeof response.requestId !== 'string') return;
  pending.get(response.requestId)?.(response as SecurityControlResponse);
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
