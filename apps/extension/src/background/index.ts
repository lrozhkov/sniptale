// Background Service Worker для Sniptale

import { initTracer } from '@sniptale/platform/observability/message-tracer';
import { createBackgroundRuntimeState } from './application/runtime-state';
import { registerBackgroundRuntimeMessageListener } from './runtime/routing/boundary/listener';
import { initializeBackgroundRuntime } from './runtime/routing/runtime-wiring/initialize';

// Инициализация трассировщика (только в dev/build режимах)
initTracer('bg');
const runtimeState = createBackgroundRuntimeState();

initializeBackgroundRuntime(runtimeState);
registerBackgroundRuntimeMessageListener(runtimeState);

export {};
