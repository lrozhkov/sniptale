import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'EditorBrowserFrame' });

export function logEditorBrowserFrame(stage: string, payload: Record<string, unknown> = {}): void {
  logger.debug(stage, payload);
}
