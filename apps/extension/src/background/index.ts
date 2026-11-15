import { registerCatalogPorts } from './i18n/catalog-port';
import { prepareTranslations } from '../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { registerDiagnosticLogPorts } from './application/diagnostics/ports';
import { installRuntimeLogCapture } from '../composition/persistence/diagnostics/runtime-log';
// Background Service Worker для Sniptale

import { initTracer } from '@sniptale/platform/observability/message-tracer';
import { createBackgroundRuntimeState } from './application/runtime-state';
import { registerBackgroundRuntimeMessageListener } from './runtime/routing/boundary/listener';
import { initializeBackgroundRuntime } from './runtime/routing/runtime-wiring/initialize';

// Инициализация трассировщика (только в dev/build режимах)
installRuntimeLogCapture('background');
initTracer('bg');
registerCatalogPorts();
registerDiagnosticLogPorts();
void prepareTranslations('background').catch(() => {
  createLogger({ namespace: 'BackgroundEntrypoint' }).warn(
    'Background translation preparation failed'
  );
});
const runtimeState = createBackgroundRuntimeState();

initializeBackgroundRuntime(runtimeState);
registerBackgroundRuntimeMessageListener(runtimeState);

export {};
