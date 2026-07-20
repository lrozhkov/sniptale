import { createLogger } from '@sniptale/platform/observability/logger';

export const aiPickModeLogger = createLogger({ namespace: 'ContentAiPick' });

export function blockAiPickPointerEvent(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}
