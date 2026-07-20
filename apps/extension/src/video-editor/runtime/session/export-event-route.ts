import type {
  RuntimeProjectExportCompletedMessage,
  RuntimeProjectExportProgressMessage,
} from '../../../contracts/messaging/contracts/types';
import { parseRuntimeRequestMessage } from '../../../contracts/messaging/parsers/boundary';
import { translate } from '../../../platform/i18n';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getProjectExportOwnerDocumentId } from '../../project/operations/export';
import type { VideoEditorExportActions } from '../../contracts/commands/export';
import type { VideoEditorLibrariesState } from '../app-model/types';

type ProjectExportEventMessage =
  | RuntimeProjectExportProgressMessage
  | RuntimeProjectExportCompletedMessage
  | {
      type: VideoMessageType.PROJECT_EXPORT_FAILED;
      jobId: string;
      error: string;
      targetDocumentId?: string;
      targetSenderUrl?: string;
    }
  | {
      type: VideoMessageType.PROJECT_EXPORT_CANCELLED;
      jobId: string;
      targetDocumentId?: string;
      targetSenderUrl?: string;
    };

export type ProjectExportEventHandlers = {
  cancelExport: VideoEditorExportActions['cancelExport'];
  completeExport: VideoEditorExportActions['completeExport'];
  failExport: VideoEditorExportActions['failExport'];
  refreshProjectExports: VideoEditorLibrariesState['refreshProjectExports'];
  refreshProjects: VideoEditorLibrariesState['refreshProjects'];
  refreshRecordings: VideoEditorLibrariesState['refreshRecordings'];
  updateExportStatus: VideoEditorExportActions['updateExportStatus'];
};

type ProjectExportEventResponse = { result: 'accepted'; success: true };

const PROJECT_EXPORT_EVENT_ACCEPTED_RESPONSE = {
  success: true,
  result: 'accepted',
} satisfies ProjectExportEventResponse;

function isProjectExportEventMessage(
  message: ReturnType<typeof parseRuntimeRequestMessage>
): message is ProjectExportEventMessage {
  return (
    message.type === VideoMessageType.PROJECT_EXPORT_PROGRESS ||
    message.type === VideoMessageType.PROJECT_EXPORT_COMPLETED ||
    message.type === VideoMessageType.PROJECT_EXPORT_FAILED ||
    message.type === VideoMessageType.PROJECT_EXPORT_CANCELLED
  );
}

function resolveCurrentEditorSenderUrl(): string | null {
  try {
    const currentUrl = new URL(window.location.href);
    return `${currentUrl.origin}${currentUrl.pathname}`;
  } catch {
    return null;
  }
}

function isProjectExportEventForThisEditor(
  message: ProjectExportEventMessage,
  ownerDocumentId: string | null
): boolean {
  const currentSenderUrl = resolveCurrentEditorSenderUrl();
  return (
    ownerDocumentId !== null &&
    currentSenderUrl !== null &&
    typeof message.targetDocumentId === 'string' &&
    typeof message.targetSenderUrl === 'string' &&
    message.targetDocumentId === ownerDocumentId &&
    message.targetSenderUrl === currentSenderUrl
  );
}

function handleProjectExportMessage(
  message: ProjectExportEventMessage,
  handlers: ProjectExportEventHandlers
): void {
  if (message.type === VideoMessageType.PROJECT_EXPORT_PROGRESS) {
    handlers.updateExportStatus(message.status);
    return;
  }

  if (message.type === VideoMessageType.PROJECT_EXPORT_COMPLETED) {
    handlers.completeExport({
      filename: message.filename,
      recordingId: message.recordingId,
      exportId: message.exportId,
    });
    void handlers.refreshRecordings();
    void handlers.refreshProjects();
    if (message.projectId) {
      void handlers.refreshProjectExports(message.projectId);
    }
    return;
  }

  if (message.type === VideoMessageType.PROJECT_EXPORT_FAILED) {
    handlers.failExport(
      message.error ||
        `${translate('common.states.error')}${translate('videoEditor.app.exportStartErrorSuffix')}`
    );
    return;
  }

  if (message.type === VideoMessageType.PROJECT_EXPORT_CANCELLED) {
    handlers.cancelExport();
  }
}

function parseProjectExportEventMessage(message: unknown): ProjectExportEventMessage | null {
  try {
    const parsedMessage = parseRuntimeRequestMessage(message);
    return isProjectExportEventMessage(parsedMessage) ? parsedMessage : null;
  } catch {
    return null;
  }
}

export function routeProjectExportRuntimeEvent(
  message: unknown,
  handlers: ProjectExportEventHandlers,
  getActiveExportJobId: () => string | null
): ProjectExportEventResponse | null {
  const parsedMessage = parseProjectExportEventMessage(message);
  if (!parsedMessage) {
    return null;
  }
  const activeExportJobId = getActiveExportJobId();
  if (parsedMessage.jobId !== activeExportJobId) {
    return PROJECT_EXPORT_EVENT_ACCEPTED_RESPONSE;
  }
  if (
    !isProjectExportEventForThisEditor(
      parsedMessage,
      getProjectExportOwnerDocumentId(activeExportJobId)
    )
  ) {
    return PROJECT_EXPORT_EVENT_ACCEPTED_RESPONSE;
  }

  handleProjectExportMessage(parsedMessage, handlers);
  return PROJECT_EXPORT_EVENT_ACCEPTED_RESPONSE;
}
