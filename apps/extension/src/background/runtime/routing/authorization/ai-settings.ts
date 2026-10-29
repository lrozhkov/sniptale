import { isAIScenario, type AIScenario } from '../../../../contracts/settings/ai-catalog';
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
import { classifyBackgroundOwnedSender } from './sender-classification';
import {
  classifySettingsPageSenderUrl,
  isScenarioEditorSenderUrl,
  isGallerySenderUrl,
  isImageEditorSenderUrl,
  isVideoEditorSenderUrl,
} from '../../../../platform/navigation/extension-pages/sender-url';

export function authorizeAiSettingsMutationRoute(
  request: BackgroundOwnedAuthorizationRequest
): IpcAuthorizationResult {
  const senderClass = classifySettingsPageSenderUrl(request.sender.url);
  if (senderClass === 'ai-unlock-settings-page') {
    return reject('Unauthorized AI settings mutation sender: unlock mode');
  }
  const isPickerMaintenance =
    request.message['operation'] === 'refresh-managed-catalogs' &&
    (request.sender.tab?.id !== undefined ||
      isScenarioEditorSenderUrl(request.sender.url) ||
      isGallerySenderUrl(request.sender.url) ||
      isVideoEditorSenderUrl(request.sender.url) ||
      isImageEditorSenderUrl(request.sender.url));
  const selection = request.message['selection'];
  const isScenarioChoice =
    request.message['operation'] === 'remember-scenario-selection' &&
    typeof selection === 'object' &&
    selection !== null &&
    'scenario' in selection &&
    isAIScenario(selection.scenario) &&
    isScenarioSelectionSender(request.sender, selection.scenario);
  if (senderClass !== 'ordinary-settings-page' && !isPickerMaintenance && !isScenarioChoice) {
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
  if (message.operation === 'read-scenario-selection') {
    if (
      classifySettingsPageSenderUrl(request.sender.url) === 'ai-unlock-settings-page' ||
      !isScenarioSelectionSender(request.sender, message.scenario)
    )
      return reject('Unauthorized AI scenario selection sender');
    return authorize(
      createBackgroundOwnedRoutePreauthorization({
        entry: routeEntry,
        handle: { kind: 'background-owned-route-policy' },
        message: request.message,
        senderClassification: classifyBackgroundOwnedSender(request.sender),
      })
    );
  }
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
  operation: Exclude<AiSettingsQueryMessage['operation'], 'read-scenario-selection'>;
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

function isScenarioSelectionSender(
  sender: chrome.runtime.MessageSender,
  scenario: AIScenario
): boolean {
  if (classifySettingsPageSenderUrl(sender.url) === 'ordinary-settings-page') return true;
  if (isScenarioEditorSenderUrl(sender.url))
    return scenario === 'scenario-edit' || scenario === 'scenario-speech';
  if (isGallerySenderUrl(sender.url))
    return (
      scenario === 'gallery-text-edit' ||
      scenario === 'gallery-speech' ||
      scenario === 'gallery-transcription'
    );
  if (isVideoEditorSenderUrl(sender.url))
    return (
      scenario === 'video-text-edit' ||
      scenario === 'video-speech' ||
      scenario === 'video-transcription'
    );
  return (
    sender.tab?.id !== undefined &&
    /^https?:/u.test(sender.url ?? '') &&
    (scenario === 'page-edit' || scenario === 'page-extract')
  );
}
