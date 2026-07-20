import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'Editor' });

function logEditorTrace(channel: string, stage: string, payload: Record<string, unknown> = {}) {
  logger.debug(channel, { stage, ...payload });
}

export function logEditorOpenTrace(stage: string, payload: Record<string, unknown> = {}) {
  logEditorTrace('open-image', stage, payload);
}

export function logEditorSourceTrace(stage: string, payload: Record<string, unknown> = {}) {
  logEditorTrace('source-layer', stage, payload);
}
