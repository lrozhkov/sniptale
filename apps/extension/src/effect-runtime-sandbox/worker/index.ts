import { collectEffectRuntimeResultBitmaps } from '../../contracts/effect-runtime/retry-inputs';
import { EFFECT_RUNTIME_WORKER_RESPONSE } from '../../contracts/effect-runtime/types';
import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import { createEffectRuntimeFailure } from '../../contracts/effect-runtime/identity';
import { installEffectRuntimeSandboxGuards } from '../policy/guards';
import { createEffectRuntimeWorkerExecutionState } from './execute';
import { initializeLottieRuntime } from './lottie';

// Only trusted bundled initialization runs before guards. No message is executed during preload.
const ready = initializeLottieRuntime()
  .then(
    () => true,
    () => false
  )
  .finally(() => installEffectRuntimeSandboxGuards(self));
const executionState = createEffectRuntimeWorkerExecutionState();
self.onmessage = (event: MessageEvent<unknown>) => {
  const sendFailure = () => {
    closeEffectRuntimeBitmaps(event.data);
    self.postMessage(
      {
        result: createEffectRuntimeFailure(event.data, 'malformed'),
        type: EFFECT_RUNTIME_WORKER_RESPONSE,
      },
      { transfer: [] }
    );
  };
  if (event.origin !== '' || event.ports.length > 0) {
    for (const port of event.ports) port.close();
    sendFailure();
    return;
  }
  void ready
    .then((initialized) =>
      initialized
        ? executionState.execute(event.data)
        : createEffectRuntimeFailure(event.data, 'crashed')
    )
    .then((result) => {
      const transfer = collectEffectRuntimeResultBitmaps(result);
      try {
        self.postMessage({ result, type: EFFECT_RUNTIME_WORKER_RESPONSE }, { transfer });
      } catch {
        closeEffectRuntimeBitmaps(result);
      }
    }, sendFailure);
};
