import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { ResponseSender } from '@sniptale/runtime-contracts/messaging/message-types';

import { consumeProjectExportInput } from '../../composition/persistence/project-export-inputs';
import type { parseOffscreenRuntimeMessage } from '../../contracts/messaging/parsers/boundary';
import {
  cancelProjectExport,
  getProjectExportCapabilities,
  reconcileProjectExportJobs,
  startProjectExport,
} from '../project-export';

type OffscreenRuntimeMessage = ReturnType<typeof parseOffscreenRuntimeMessage>;
type ProjectExportRuntimeMessage = Extract<
  OffscreenRuntimeMessage,
  {
    type:
      | typeof VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT
      | typeof VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT
      | typeof VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES;
  }
>;

export async function handleProjectExportRuntimeMessage(
  message: ProjectExportRuntimeMessage,
  sendResponse?: ResponseSender
): Promise<void> {
  switch (message.type) {
    case VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT: {
      if (message.jobId !== message.input.jobId) {
        throw new Error('Project export input job mismatch');
      }
      const project = await consumeProjectExportInput(message.input);
      await startProjectExport(message.jobId, project, message.settings);
      return;
    }
    case VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT:
      await cancelProjectExport(message.jobId);
      return;
    case VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES: {
      await reconcileProjectExportJobs();
      const capabilities = await getProjectExportCapabilities(message.settings);
      sendResponse?.({ success: true, capabilities });
      return;
    }
  }
}
