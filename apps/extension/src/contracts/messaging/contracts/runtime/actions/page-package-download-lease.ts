import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isNumber,
  isRecord,
  isString,
} from '../../../validators';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry';

const isAssetRef = (value: unknown): boolean => {
  if (!isRecord(value) || !isRecord(value['location'])) return false;
  const keys = Object.keys(value).sort();
  const locationKeys = Object.keys(value['location']).sort();
  return (
    keys.join(',') === 'assetId,createdAt,location,mimeType,sha256,size' &&
    locationKeys.join(',') === 'kind,objectKey' &&
    isString(value['assetId']) &&
    value['assetId'].length > 0 &&
    value['assetId'].length <= 128 &&
    isNumber(value['createdAt']) &&
    Number.isSafeInteger(value['createdAt']) &&
    value['createdAt'] >= 0 &&
    value['location']['kind'] === 'opfs' &&
    isString(value['location']['objectKey']) &&
    value['location']['objectKey'] === `objects/${value['assetId']}` &&
    isString(value['mimeType']) &&
    value['mimeType'].length > 0 &&
    value['mimeType'].length <= 128 &&
    (value['sha256'] === null ||
      (isString(value['sha256']) && /^[a-f0-9]{64}$/.test(value['sha256']))) &&
    isNumber(value['size']) &&
    Number.isSafeInteger(value['size']) &&
    value['size'] > 0
  );
};
const isLeaseId = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;
const isOperationId = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0 && value.length <= 128;
const isFilename = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0 && value.length <= 240;

export const runtimeActionPagePackageDownloadLeaseContracts = {
  [MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE message',
      createMessageGuard({
        type: MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE,
        required: {
          capabilityToken: isString,
          downloadOperationId: isOperationId,
          filename: isFilename,
          reference: isAssetRef,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE response',
      createRuntimeResponseGuard({
        required: {
          leaseId: isLeaseId,
          result: (value) => value === 'leased',
          url: (value) => typeof value === 'string' && value.startsWith('blob:'),
        },
      })
    ),
  },
  [MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE message',
      createMessageGuard({
        type: MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE,
        required: {
          capabilityToken: isString,
          downloadOperationId: isOperationId,
          leaseId: isLeaseId,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE response',
      createRuntimeResponseGuard({
        required: { result: (value) => value === 'confirmed' || value === 'stale' },
      })
    ),
  },
  [MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE message',
      createMessageGuard({
        type: MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE,
        required: {
          capabilityToken: isString,
          downloadOperationId: isOperationId,
          leaseId: isLeaseId,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE response',
      createRuntimeResponseGuard({
        required: { result: (value) => value === 'released' || value === 'stale' },
      })
    ),
  },
} satisfies PartialRuntimeRegistry;
