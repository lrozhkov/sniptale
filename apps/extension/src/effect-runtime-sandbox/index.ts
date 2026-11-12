import EffectRuntimeWorker from './worker/index?worker&inline';

import {
  readEffectRuntimeCompositionBackend,
  readEffectRuntimeSandboxConnectionNonce,
} from '../contracts/effect-runtime/sandbox-connection';
import { installEffectRuntimeSandboxGuards } from './policy/guards';
import { attachEffectRuntimeSandbox } from './broker/runtime';
import { createEffectRuntimeBrokerSession } from './broker/session';

installEffectRuntimeSandboxGuards(window);
const connectionNonce = readEffectRuntimeSandboxConnectionNonce(window.location.hash);
const compositionBackend = readEffectRuntimeCompositionBackend(window.location.search);
if (connectionNonce && compositionBackend) {
  attachEffectRuntimeSandbox(
    window,
    createEffectRuntimeBrokerSession({
      workerFactory: () => new EffectRuntimeWorker(),
      ...(compositionBackend === 'gpu-scene' || compositionBackend === 'gpu-scene-plan'
        ? { compositionBackend }
        : {}),
    }),
    connectionNonce
  );
}
