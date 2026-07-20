import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { VideoRuntimeMessage } from '../../../../../contracts/video/types/messages';
import {
  consumeProjectExportCancelCapability,
  consumeProjectExportStartCapability,
  type ProjectExportCapabilityService,
} from '../export-capabilities';
import { resolveTrustedVideoEditorRuntimeSender } from '../sender-policy';
import {
  AUTHORIZED,
  authorize,
  reject,
  type IpcAuthorizationResult,
} from '../../../../routing-contracts/authorization-result';

type ProjectExportCapabilityAuthorizationDeps = Pick<
  ProjectExportCapabilityService,
  'consumeProjectExportCancelCapability' | 'consumeProjectExportStartCapability'
>;

export function createProjectExportRuntimeMessageAuthorizer(
  deps: ProjectExportCapabilityAuthorizationDeps
): (args: {
  message: VideoRuntimeMessage;
  sender?: chrome.runtime.MessageSender | undefined;
}) => Promise<IpcAuthorizationResult> {
  return async (args) => {
    if (
      args.message.type !== VideoMessageType.START_PROJECT_EXPORT &&
      args.message.type !== VideoMessageType.CANCEL_PROJECT_EXPORT
    ) {
      return AUTHORIZED;
    }

    const owner = resolveTrustedVideoEditorRuntimeSender(args.sender);
    if (!owner) {
      return reject('Unauthorized project export capability');
    }

    const capabilityCheck = {
      documentId: owner.documentId,
      jobId: args.message.jobId,
      senderUrl: owner.senderUrl,
      token: args.message.capabilityToken,
    };
    const authorized =
      args.message.type === VideoMessageType.START_PROJECT_EXPORT
        ? await deps.consumeProjectExportStartCapability({
            ...capabilityCheck,
            settings: args.message.settings,
          })
        : await deps.consumeProjectExportCancelCapability(capabilityCheck);

    if (!authorized) {
      return reject('Unauthorized project export capability');
    }

    return authorize({
      documentId: owner.documentId,
      kind: 'project-export',
      senderUrl: owner.senderUrl,
    });
  };
}

const defaultProjectExportRuntimeMessageAuthorizer = createProjectExportRuntimeMessageAuthorizer({
  consumeProjectExportCancelCapability,
  consumeProjectExportStartCapability,
});

export function authorizeProjectExportRuntimeMessage(args: {
  message: VideoRuntimeMessage;
  sender?: chrome.runtime.MessageSender | undefined;
}): Promise<IpcAuthorizationResult> {
  return defaultProjectExportRuntimeMessageAuthorizer(args);
}
