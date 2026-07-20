import { EFFECT_RUNTIME_WORKER_RESPONSE } from '../../contracts/effect-runtime/types';
import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import { createEffectRuntimeFailure } from '../../contracts/effect-runtime/identity';
import { installEffectRuntimeSandboxGuards } from '../policy/guards';
import { createEffectRuntimeWorkerExecutionState } from './execute';

installEffectRuntimeSandboxGuards(self);
const executionState = createEffectRuntimeWorkerExecutionState();
self.onmessage = (event: MessageEvent<unknown>) => {
  if (event.origin !== '' || event.ports.length > 0) {
    for (const port of event.ports) port.close();
    closeEffectRuntimeBitmaps(event.data);
    self.postMessage(
      {
        result: createEffectRuntimeFailure(event.data, 'malformed'),
        type: EFFECT_RUNTIME_WORKER_RESPONSE,
      },
      { transfer: [] }
    );
    return;
  }
  void executionState.execute(event.data).then((result) => {
    const transfer = result.kind === 'frame' ? [result.bitmap] : [];
    try {
      self.postMessage({ result, type: EFFECT_RUNTIME_WORKER_RESPONSE }, { transfer });
    } catch {
      if (result.kind === 'frame') result.bitmap.close();
    }
  });
};
