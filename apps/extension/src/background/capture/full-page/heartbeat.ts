import type { FullPageCaptureSessionIdentity } from '../../../contracts/full-page-capture';
import type { FullPagePageAgentTransport } from './page-agent-transport';

const HEARTBEAT_INTERVAL_MS = 4_000;
const HEARTBEAT_TIMEOUT_MS = 5_000;

type FullPageCaptureHeartbeat = {
  signal: AbortSignal;
  stop(): Promise<void>;
};

export function startFullPageCaptureHeartbeat(args: {
  agent: Pick<FullPagePageAgentTransport, 'heartbeat'>;
  externalSignal?: AbortSignal | undefined;
  identity: FullPageCaptureSessionIdentity;
  renewLease(): Promise<void>;
}): FullPageCaptureHeartbeat {
  const controller = new AbortController();
  let stopped = false;
  let activePulse: Promise<void> | null = null;

  const relayExternalAbort = () => {
    controller.abort(args.externalSignal?.reason ?? new Error('Full-page capture was cancelled'));
  };
  if (args.externalSignal?.aborted) relayExternalAbort();
  else args.externalSignal?.addEventListener('abort', relayExternalAbort, { once: true });

  const pulse = () => {
    if (stopped || activePulse) return;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const heartbeatWork = Promise.all([args.renewLease(), args.agent.heartbeat(args.identity)]);
    const heartbeatTimeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Full-page capture heartbeat timed out')),
        HEARTBEAT_TIMEOUT_MS
      );
    });
    activePulse = Promise.race([heartbeatWork, heartbeatTimeout])
      .then(() => undefined)
      .catch((error: unknown) => {
        controller.abort(error);
      })
      .finally(() => {
        if (timeoutId) clearTimeout(timeoutId);
        activePulse = null;
      });
  };

  const interval = setInterval(pulse, HEARTBEAT_INTERVAL_MS);

  return {
    signal: controller.signal,
    async stop() {
      if (!stopped) {
        stopped = true;
        clearInterval(interval);
        args.externalSignal?.removeEventListener('abort', relayExternalAbort);
      }
      await activePulse;
    },
  };
}
