import { createSimplifyComputeClient } from '../../apps/extension/src/workflows/simplify/compute-client';
import { createSimplifyService } from '../../apps/extension/src/offscreen/simplify/service';

const service = createSimplifyService({
  createWorker: () => new globalThis.Worker('/generated/worker.mjs', { type: 'module' }),
});
export const compute = createSimplifyComputeClient({
  async send(request) {
    try {
      const command =
        request.operation === 'prepare' ? { ...request, sessionId: crypto.randomUUID() } : request;
      return { success: true, ...(await service.execute(command)) };
    } catch {
      return { success: false };
    }
  },
});
globalThis.addEventListener('pagehide', () => {
  compute.dispose();
  service.dispose();
});
