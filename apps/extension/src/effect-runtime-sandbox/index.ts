import EffectRuntimeWorker from './worker/index?worker&inline';

import { readEffectRuntimeSandboxConnectionNonce } from '../contracts/effect-runtime/sandbox-connection';
import { installEffectRuntimeSandboxGuards } from './policy/guards';
import { attachEffectRuntimeSandbox } from './broker/runtime';
import { createEffectRuntimeBrokerSession } from './broker/session';

installEffectRuntimeSandboxGuards(window);
const connectionNonce = readEffectRuntimeSandboxConnectionNonce(window.location.hash);
if (connectionNonce) {
  attachEffectRuntimeSandbox(
    window,
    createEffectRuntimeBrokerSession({ workerFactory: () => new EffectRuntimeWorker() }),
    connectionNonce
  );
}
