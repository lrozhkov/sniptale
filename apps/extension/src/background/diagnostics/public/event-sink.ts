import type { DiagnosticEventFromCS } from '@sniptale/platform/observability/diagnostics/types';
import { handleEventFromContentScript } from '../handlers';

export function appendContentDiagnosticEvent(
  event: DiagnosticEventFromCS,
  senderTabId: number
): void {
  handleEventFromContentScript(event, senderTabId);
}
