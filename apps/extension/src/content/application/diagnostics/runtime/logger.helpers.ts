import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import {
  sanitizeDiagnosticData,
  sanitizeDiagnosticMessage,
  sanitizeDiagnosticUrl,
} from '@sniptale/platform/observability/diagnostics/sanitizer';
import type { DiagnosticEventFromCS } from '@sniptale/platform/observability/diagnostics/types';
import type { RuntimeDiagnosticEventMessage } from '../../../../contracts/messaging/contracts/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { getContentRuntimeServices } from '../../runtime-services/services';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const logger = createLogger({ namespace: 'ContentDiagnostics' });

type DiagnosticElementDescription = {
  tagName: string;
  type?: string;
  href?: string;
  role?: string;
};

export function isDiagnosticLoggerTargetEnabled(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && !target.closest(`#${CONTENT_ROOT_ID}`);
}

export function buildUserActionMessage(
  actionType: string,
  targetInfo: DiagnosticElementDescription
): string {
  return `${actionType} on ${targetInfo.tagName}`;
}

export function describeDiagnosticElement(element: HTMLElement): DiagnosticElementDescription {
  const info: DiagnosticElementDescription = {
    tagName: element.tagName.toLowerCase(),
  };

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    info.type = element.type;
  }
  if (element instanceof HTMLAnchorElement) {
    const href = sanitizeDiagnosticUrl(element.href);
    if (href !== undefined) {
      info.href = href;
    }
  }

  const role = element.getAttribute('role');
  if (role) {
    info.role = role;
  }

  return info;
}

export function sendDiagnosticContentEvent(options: {
  event: Omit<DiagnosticEventFromCS, 'tsMs'>;
  sessionRecordingId: string | null;
  sessionStartTime: number;
  isEnabled: boolean;
}): void {
  if (!options.isEnabled || !options.sessionRecordingId) {
    return;
  }

  const payload =
    options.event.data === undefined ? undefined : sanitizeDiagnosticData(options.event.data);
  const message: RuntimeDiagnosticEventMessage = {
    type: VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS,
    recordingId: options.sessionRecordingId,
    ...(typeof options.event.level === 'undefined' ? {} : { level: options.event.level }),
    event: `${options.event.kind}:${sanitizeDiagnosticMessage(options.event.message)}`,
    ...(payload === undefined ? {} : { payload }),
  };

  void getContentRuntimeServices()
    .messaging.sendRuntimeMessage(message)
    .catch((error) => {
      logger.warn('Failed to send diagnostic event', error);
    });
}
