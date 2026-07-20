import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'Editor' });

export function logEditorDocumentOpenTrace(
  stage: string,
  payload: Record<string, unknown> = {}
): void {
  logger.debug('open-image', { stage, ...payload });
}
