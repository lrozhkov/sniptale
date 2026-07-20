import { createLogger } from '@sniptale/platform/observability/logger';

export const diagnosticsLogger = createLogger({
  namespace: 'BackgroundDiagnostics',
});
