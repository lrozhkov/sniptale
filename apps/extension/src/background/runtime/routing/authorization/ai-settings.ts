import type { AiSettingsQueryMessage } from '../../../../contracts/messaging/ai-settings-runtime';
import { markPreauthorizedAiSettingsMutationMessage } from '../../../ai/routes';
import {
  AUTHORIZED,
  authorize,
  reject,
  type IpcAuthorizationResult,
} from '../../../routing-contracts/authorization-result';
import {
  createBackgroundOwnedRoutePreauthorization,
  type BackgroundOwnedRouteInventoryEntry,
} from '../../../routing-contracts/owned-route-context';
import type { BackgroundOwnedAuthorizationRequest } from './background-owned.types';
import {
  classifyBackgroundOwnedSender,
  classifySettingsPageSenderUrl,
  isScenarioEditorSenderUrl,
} from './sender-classification';

export function authorizeAiSettingsMutationRoute(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult {
  const senderClass = classifySettingsPageSenderUrl(request.sender.url);
  if (senderClass === 'ai-unlock-settings-page') {
    return reject('Unauthorized AI settings mutation sender: unlock mode');
  }
  if (senderClass !== 'ordinary-settings-page') {
    return reject('Unauthorized AI settings mutation sender');
  }
  markPreauthorizedAiSettingsMutationMessage(request.message);
  return AUTHORIZED;
}

export function authorizeAiSettingsQueryRoute(
  request: BackgroundOwnedAuthorizationRequest,
  routeEntry: BackgroundOwnedRouteInventoryEntry
): IpcAuthorizationResult {
  const message = request.message as AiSettingsQueryMessage;
  const settingsSender = classifySettingsPageSenderUrl(request.sender.url);
  const isOrdinarySettingsPage = settingsSender === 'ordinary-settings-page';
  const isScenarioEditorPage = isScenarioEditorSenderUrl(request.sender.url);
  const isContentTabRuntime = request.sender.tab?.id !== undefined;

  if (
    !isAuthorizedAiSettingsQuerySender({
      isContentTabRuntime,
      isOrdinarySettingsPage,
      isScenarioEditorPage,
      operation: message.operation,
    })
  ) {
    return reject('Unauthorized AI settings query sender');
  }

  return authorize(
    createBackgroundOwnedRoutePreauthorization({
      entry: routeEntry,
      handle: { kind: 'background-owned-route-policy' },
      message: request.message,
      senderClassification: classifyBackgroundOwnedSender(request.sender),
    })
  );
}

function isAuthorizedAiSettingsQuerySender(args: {
  isContentTabRuntime: boolean;
  isOrdinarySettingsPage: boolean;
  isScenarioEditorPage: boolean;
  operation: AiSettingsQueryMessage['operation'];
}): boolean {
  switch (args.operation) {
    case 'read-chrome-ai-content-system-prompt':
      return args.isContentTabRuntime;
    case 'read-model-selection-bootstrap':
      return args.isOrdinarySettingsPage || args.isScenarioEditorPage || args.isContentTabRuntime;
    case 'read-scenario-editor-system-prompt':
      return args.isScenarioEditorPage;
    case 'read-settings-page-runtime-data':
      return args.isOrdinarySettingsPage;
  }
}
