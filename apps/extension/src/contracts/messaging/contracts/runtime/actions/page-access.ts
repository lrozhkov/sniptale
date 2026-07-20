import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  PageAccessMessage,
  PageAccessResponse,
} from '@sniptale/runtime-contracts/messaging/page-access';
import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from '../../../validators/index';

const pageAccessOperations = new Set<string>(Object.values(PageAccessOperation));
const pageAccessResults = new Set<string>([
  'activated',
  'already-active',
  'granted',
  'registered',
  'permission-denied',
  'revoked',
  'unsupported-url',
]);
const pageAccessUnsupportedReasons = new Set<string>(['missing-tab', 'unsupported-url']);

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function isPageAccessOperation(value: unknown): value is PageAccessOperation {
  return isString(value) && pageAccessOperations.has(value);
}

function isPageAccessResult(value: unknown): boolean {
  return isString(value) && pageAccessResults.has(value);
}

function isPageAccessUnsupportedReason(value: unknown): boolean {
  return isString(value) && pageAccessUnsupportedReasons.has(value);
}

function isPageAccessStatus(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const allowedFields = new Set([
    'allSitesGranted',
    'currentTabActive',
    'currentTabId',
    'currentTabOrigin',
    'siteGranted',
    'supported',
    'unsupportedReason',
  ]);
  return (
    Object.keys(value).every((key) => allowedFields.has(key)) &&
    isBoolean(value['allSitesGranted']) &&
    isBoolean(value['currentTabActive']) &&
    isNullableNumber(value['currentTabId']) &&
    isNullableString(value['currentTabOrigin']) &&
    isBoolean(value['siteGranted']) &&
    isBoolean(value['supported']) &&
    (value['unsupportedReason'] === undefined ||
      isPageAccessUnsupportedReason(value['unsupportedReason']))
  );
}

function isPageAccessResponse(value: unknown): value is PageAccessResponse {
  if (!isRecord(value)) {
    return false;
  }

  const allowedFields = new Set(['success', 'error', 'result', 'status']);
  const requiresStatus = value['success'] === true;
  return (
    Object.keys(value).every((key) => allowedFields.has(key)) &&
    (value['success'] === undefined || isBoolean(value['success'])) &&
    (value['error'] === undefined || isString(value['error'])) &&
    (value['result'] === undefined || isPageAccessResult(value['result'])) &&
    (value['status'] === undefined ? !requiresStatus : isPageAccessStatus(value['status']))
  );
}

export const pageAccessRuntimeContracts = {
  parseRequest: createGuardParser<PageAccessMessage>(
    'runtime PAGE_ACCESS message',
    createMessageGuard({
      type: MessageType.PAGE_ACCESS,
      required: { operation: isPageAccessOperation },
      optional: { tabId: isNumber },
    })
  ),
  parseResponse: createGuardParser<PageAccessResponse>(
    'runtime PAGE_ACCESS response',
    isPageAccessResponse
  ),
};
