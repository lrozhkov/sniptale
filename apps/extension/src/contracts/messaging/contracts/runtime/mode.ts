import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../runtime-message/index';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isNullable,
  isNumber,
  isRecord,
  isQuickActionOverlay,
  isString,
} from '../../validators/index';
import * as ContentActionContract from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import { isAppliedViewportPreset } from '../../validators/ui';

type PartialRuntimeRegistry = Partial<
  MessageContractRegistry<RuntimeRequestByType, RuntimeResponseByType>
>;

const asyncRouteAckFields = { result: isString };
const availabilityReasons = new Set([
  'disabled',
  'missing',
  'unsupported-context',
  'window-too-large',
  'window-not-normal',
  'surface-busy',
  'permission-denied',
  'platform-rejected',
  'verification-failed',
]);
// policyStateIds: [] - toolbar working modes are an immutable boundary allowlist.
const toolbarWorkingModes = new Set([
  'cursor',
  'drawing',
  'highlighter',
  'quick-edit',
  'design-review',
  'video-recording',
]);

function isToolbarWorkingMode(value: unknown): boolean {
  return isString(value) && toolbarWorkingModes.has(value);
}

function hasOnlyFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  const allowed = new Set(fields);
  return Object.keys(value).every((field) => allowed.has(field));
}

function isSize(value: unknown): value is { width: number; height: number } {
  return (
    isRecord(value) &&
    hasOnlyFields(value, ['width', 'height']) &&
    isNumber(value['width']) &&
    isNumber(value['height'])
  );
}

function isViewportPresetAvailability(value: unknown): boolean {
  if (!isRecord(value) || !isString(value['presetId'])) return false;
  const target = value['target'];
  if (value['status'] === 'available') {
    return (
      hasOnlyFields(value, ['status', 'presetId', 'target', 'required']) &&
      target === 'window' &&
      isSize(value['required'])
    );
  }
  return (
    value['status'] === 'unavailable' &&
    hasOnlyFields(value, ['status', 'presetId', 'target', 'reason', 'required', 'available']) &&
    (target === null || target === 'window') &&
    isString(value['reason']) &&
    availabilityReasons.has(value['reason']) &&
    (value['required'] === undefined || isSize(value['required'])) &&
    (value['available'] === undefined || isSize(value['available']))
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(isString);
}

function isViewportPresetAvailabilityArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isViewportPresetAvailability);
}

export const runtimeModeMessageContracts = {
  [MessageType.ENABLE_SCREENSHOT_MODE]: {
    parseRequest: createGuardParser(
      'runtime ENABLE_SCREENSHOT_MODE message',
      createMessageGuard({
        type: MessageType.ENABLE_SCREENSHOT_MODE,
        optional: {
          pageZoom: isNumber,
          tabId: isNumber,
          viewport: isNullable(isAppliedViewportPreset),
          quickActionOverlay: isQuickActionOverlay,
          autoStartSelection: isBoolean,
          autoStartCaptureType: isString,
          toolbarVisible: isBoolean,
          workingMode: isToolbarWorkingMode,
          contentIntent: ContentActionContract.isContentPrivilegedActionCapability,
          surfaceCapabilityToken: isString,
          surfaceLeaseGeneration: isNumber,
          surfaceOperationGeneration: isNumber,
          surfaceWarning: isString,
          contentIntentGrant: ContentActionContract.isContentPrivilegedActionAutoStartGrant,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime ENABLE_SCREENSHOT_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: asyncRouteAckFields })
    ),
  },
  [MessageType.DISABLE_SCREENSHOT_MODE]: {
    parseRequest: createGuardParser(
      'runtime DISABLE_SCREENSHOT_MODE message',
      createMessageGuard({
        type: MessageType.DISABLE_SCREENSHOT_MODE,
        optional: {
          leaseGeneration: isNumber,
          operationGeneration: isNumber,
          surfaceCapabilityToken: isString,
          tabId: isNumber,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DISABLE_SCREENSHOT_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: asyncRouteAckFields })
    ),
  },
  [MessageType.SCREENSHOT_MODE_STATUS]: {
    parseRequest: createGuardParser(
      'runtime SCREENSHOT_MODE_STATUS message',
      createMessageGuard({
        type: MessageType.SCREENSHOT_MODE_STATUS,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime SCREENSHOT_MODE_STATUS response',
      createRuntimeResponseGuard({
        optional: {
          documentId: isString,
          enabled: isBoolean,
          pageZoom: isNumber,
          supported: isBoolean,
          surfaceCapabilityToken: isString,
          surfaceLeaseGeneration: isNumber,
          surfaceOperationGeneration: isNumber,
          tabId: isNumber,
          unsupportedReason: isNullable(isString),
          viewport: isNullable(isAppliedViewportPreset),
        },
      })
    ),
  },
  [MessageType.ENABLE_HIGHLIGHTER_MODE]: {
    parseRequest: createGuardParser(
      'runtime ENABLE_HIGHLIGHTER_MODE message',
      createMessageGuard({
        type: MessageType.ENABLE_HIGHLIGHTER_MODE,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime ENABLE_HIGHLIGHTER_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [MessageType.DISABLE_HIGHLIGHTER_MODE]: {
    parseRequest: createGuardParser(
      'runtime DISABLE_HIGHLIGHTER_MODE message',
      createMessageGuard({
        type: MessageType.DISABLE_HIGHLIGHTER_MODE,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DISABLE_HIGHLIGHTER_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [MessageType.HIGHLIGHTER_MODE_STATUS]: {
    parseRequest: createGuardParser(
      'runtime HIGHLIGHTER_MODE_STATUS message',
      createMessageGuard({
        type: MessageType.HIGHLIGHTER_MODE_STATUS,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime HIGHLIGHTER_MODE_STATUS response',
      createRuntimeResponseGuard({ optional: { enabled: isBoolean } })
    ),
  },
  [MessageType.ENABLE_QUICK_EDIT_MODE]: {
    parseRequest: createGuardParser(
      'runtime ENABLE_QUICK_EDIT_MODE message',
      createMessageGuard({
        type: MessageType.ENABLE_QUICK_EDIT_MODE,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime ENABLE_QUICK_EDIT_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [MessageType.DISABLE_QUICK_EDIT_MODE]: {
    parseRequest: createGuardParser(
      'runtime DISABLE_QUICK_EDIT_MODE message',
      createMessageGuard({
        type: MessageType.DISABLE_QUICK_EDIT_MODE,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DISABLE_QUICK_EDIT_MODE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [MessageType.QUICK_EDIT_MODE_STATUS]: {
    parseRequest: createGuardParser(
      'runtime QUICK_EDIT_MODE_STATUS message',
      createMessageGuard({
        type: MessageType.QUICK_EDIT_MODE_STATUS,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime QUICK_EDIT_MODE_STATUS response',
      createRuntimeResponseGuard({ optional: { enabled: isBoolean } })
    ),
  },
  [MessageType.APPLY_VIEWPORT_PRESET]: {
    parseRequest: createGuardParser(
      'runtime APPLY_VIEWPORT_PRESET message',
      createMessageGuard({
        type: MessageType.APPLY_VIEWPORT_PRESET,
        required: {
          operationGeneration: isNumber,
          presetId: isString,
          surfaceCapabilityToken: isString,
        },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime APPLY_VIEWPORT_PRESET response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [MessageType.RELEASE_VIEWPORT_PRESET]: {
    parseRequest: createGuardParser(
      'runtime RELEASE_VIEWPORT_PRESET message',
      createMessageGuard({
        type: MessageType.RELEASE_VIEWPORT_PRESET,
        required: {
          leaseGeneration: isNumber,
          operationGeneration: isNumber,
          surfaceCapabilityToken: isString,
        },
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime RELEASE_VIEWPORT_PRESET response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [MessageType.GET_VIEWPORT_PRESET_AVAILABILITY]: {
    parseRequest: createGuardParser(
      'runtime GET_VIEWPORT_PRESET_AVAILABILITY message',
      createMessageGuard({
        type: MessageType.GET_VIEWPORT_PRESET_AVAILABILITY,
        required: { presetIds: isStringArray },
        optional: {
          context: (value) => value === 'screenshot' || value === 'video',
          tabId: isNumber,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime GET_VIEWPORT_PRESET_AVAILABILITY response',
      createRuntimeResponseGuard({
        optional: { availabilities: isViewportPresetAvailabilityArray },
      })
    ),
  },
  [MessageType.GET_VIEWPORT_STATUS]: {
    parseRequest: createGuardParser(
      'runtime GET_VIEWPORT_STATUS message',
      createMessageGuard({
        type: MessageType.GET_VIEWPORT_STATUS,
        optional: { tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime GET_VIEWPORT_STATUS response',
      createRuntimeResponseGuard({ optional: { viewport: isNullable(isAppliedViewportPreset) } })
    ),
  },
} satisfies PartialRuntimeRegistry;
