import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type {
  FullPageCaptureGeometry,
  FullPageCapturePreferences,
  FullPageCapturePrepareResult,
  FullPageCaptureRect,
  FullPageCaptureTileState,
} from '../../../full-page-capture';
import type { TabRequestByType, TabResponseByType } from '../index';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from '../../validators';

function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value) && value >= 0;
}

function isFinitePositiveNumber(value: unknown): value is number {
  return isNumber(value) && Number.isFinite(value) && value > 0;
}

function isFullPageCapturePreferences(value: unknown): value is FullPageCapturePreferences {
  return (
    isRecord(value) &&
    (value['floatingElements'] === 'hide' ||
      value['floatingElements'] === 'once' ||
      value['floatingElements'] === 'repeat') &&
    isBoolean(value['freezeMotion']) &&
    isBoolean(value['preloadLazyContent'])
  );
}

function isFullPageCaptureRect(value: unknown): value is FullPageCaptureRect {
  return (
    isRecord(value) &&
    isFiniteNonNegativeNumber(value['height']) &&
    isFiniteNonNegativeNumber(value['width']) &&
    isFiniteNonNegativeNumber(value['x']) &&
    isFiniteNonNegativeNumber(value['y'])
  );
}

function isFullPageCaptureGeometry(value: unknown): value is FullPageCaptureGeometry {
  return (
    isRecord(value) &&
    isFinitePositiveNumber(value['devicePixelRatio']) &&
    isFiniteNonNegativeNumber(value['extentHeight']) &&
    isFiniteNonNegativeNumber(value['extentWidth']) &&
    isFiniteNonNegativeNumber(value['outputHeight']) &&
    isFiniteNonNegativeNumber(value['outputWidth']) &&
    (value['rootKind'] === 'document' ||
      value['rootKind'] === 'element' ||
      value['rootKind'] === 'viewport') &&
    isFullPageCaptureRect(value['rootViewport']) &&
    isFiniteNonNegativeNumber(value['viewportHeight']) &&
    isFiniteNonNegativeNumber(value['viewportWidth'])
  );
}

function isFullPageCaptureTileState(value: unknown): value is FullPageCaptureTileState {
  return (
    isRecord(value) &&
    isFiniteNonNegativeNumber(value['actualX']) &&
    isFiniteNonNegativeNumber(value['actualY']) &&
    isBoolean(value['frozenExtentWarning']) &&
    isFullPageCaptureGeometry(value['geometry']) &&
    isString(value['layoutGeneration'])
  );
}

function isFullPageCapturePrepareResult(value: unknown): value is FullPageCapturePrepareResult {
  return (
    isFullPageCaptureTileState(value) &&
    isRecord(value) &&
    Array.isArray(value['warnings']) &&
    value['warnings'].every(isString)
  );
}

const sessionFields = {
  jobId: isString,
  ownerToken: isString,
  runtimeGeneration: isString,
};

const tileFields = {
  ...sessionFields,
  column: isNonNegativeInteger,
  firstColumn: isBoolean,
  firstRow: isBoolean,
  lastColumn: isBoolean,
  lastRow: isBoolean,
  row: isNonNegativeInteger,
  targetX: isFiniteNonNegativeNumber,
  targetY: isFiniteNonNegativeNumber,
};

export const tabFullPageCaptureMessageContracts = {
  [MessageType.PREPARE_FULL_PAGE_CAPTURE]: {
    parseRequest: createGuardParser(
      'tab PREPARE_FULL_PAGE_CAPTURE message',
      createMessageGuard({
        type: MessageType.PREPARE_FULL_PAGE_CAPTURE,
        required: { ...sessionFields, preferences: isFullPageCapturePreferences },
      })
    ),
    parseResponse: createGuardParser(
      'tab PREPARE_FULL_PAGE_CAPTURE response',
      createRuntimeResponseGuard<TabResponseByType[typeof MessageType.PREPARE_FULL_PAGE_CAPTURE]>({
        optional: { result: isFullPageCapturePrepareResult },
      })
    ),
  },
  [MessageType.PREPARE_FULL_PAGE_TILE]: {
    parseRequest: createGuardParser(
      'tab PREPARE_FULL_PAGE_TILE message',
      createMessageGuard({ type: MessageType.PREPARE_FULL_PAGE_TILE, required: tileFields })
    ),
    parseResponse: createGuardParser(
      'tab PREPARE_FULL_PAGE_TILE response',
      createRuntimeResponseGuard<TabResponseByType[typeof MessageType.PREPARE_FULL_PAGE_TILE]>({
        optional: { result: isFullPageCaptureTileState },
      })
    ),
  },
  [MessageType.HEARTBEAT_FULL_PAGE_CAPTURE]: {
    parseRequest: createGuardParser(
      'tab HEARTBEAT_FULL_PAGE_CAPTURE message',
      createMessageGuard({ type: MessageType.HEARTBEAT_FULL_PAGE_CAPTURE, required: sessionFields })
    ),
    parseResponse: createGuardParser(
      'tab HEARTBEAT_FULL_PAGE_CAPTURE response',
      createRuntimeResponseGuard()
    ),
  },
  [MessageType.VERIFY_FULL_PAGE_TILE]: {
    parseRequest: createGuardParser(
      'tab VERIFY_FULL_PAGE_TILE message',
      createMessageGuard({
        type: MessageType.VERIFY_FULL_PAGE_TILE,
        required: { ...tileFields, layoutGeneration: isString },
      })
    ),
    parseResponse: createGuardParser(
      'tab VERIFY_FULL_PAGE_TILE response',
      createRuntimeResponseGuard<TabResponseByType[typeof MessageType.VERIFY_FULL_PAGE_TILE]>({
        optional: { result: isFullPageCaptureTileState },
      })
    ),
  },
  [MessageType.RESTORE_FULL_PAGE_CAPTURE]: {
    parseRequest: createGuardParser(
      'tab RESTORE_FULL_PAGE_CAPTURE message',
      createMessageGuard({ type: MessageType.RESTORE_FULL_PAGE_CAPTURE, required: sessionFields })
    ),
    parseResponse: createGuardParser(
      'tab RESTORE_FULL_PAGE_CAPTURE response',
      createRuntimeResponseGuard()
    ),
  },
} satisfies Partial<{
  [TType in keyof TabRequestByType]: {
    parseRequest(input: unknown): TabRequestByType[TType];
    parseResponse(input: unknown): TabResponseByType[TType];
  };
}>;
