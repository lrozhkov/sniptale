import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createRuntimeResponseGuard,
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from '../../../validators/index';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';
import { isCanonicalPopupExportJobId } from '@sniptale/runtime-contracts/export';

const BASE64_PATTERN = /^[+/=0-9A-Za-z]+$/;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_CHUNK_BASE64_LENGTH = 768 * 1024;

function isStagedBlobId(value: unknown): value is string {
  return isString(value) && value.length > 0 && value.length <= 128 && ID_PATTERN.test(value);
}

function isStagePagePackageJobChunk(value: unknown): value is {
  base64: string;
  final: boolean;
  jobId: string;
  ordinal: number;
  sequence: number;
  stagedBlobId: string;
  type: typeof MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK;
} {
  return (
    isRecord(value) &&
    Object.keys(value).length === 7 &&
    value['type'] === MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK &&
    isString(value['base64']) &&
    value['base64'].length > 0 &&
    value['base64'].length <= MAX_CHUNK_BASE64_LENGTH &&
    BASE64_PATTERN.test(value['base64']) &&
    typeof value['final'] === 'boolean' &&
    isCanonicalPopupExportJobId(value['jobId']) &&
    isNumber(value['ordinal']) &&
    Number.isSafeInteger(value['ordinal']) &&
    value['ordinal'] >= 0 &&
    value['ordinal'] < 999 &&
    isNumber(value['sequence']) &&
    Number.isSafeInteger(value['sequence']) &&
    value['sequence'] >= 0 &&
    value['sequence'] < 2048 &&
    isStagedBlobId(value['stagedBlobId'])
  );
}

export const runtimeActionPagePackageStagingContracts = {
  [MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK]: {
    parseRequest: createGuardParser(
      'runtime STAGE_PAGE_PACKAGE_JOB_CHUNK message',
      isStagePagePackageJobChunk
    ),
    parseResponse: createGuardParser(
      'runtime STAGE_PAGE_PACKAGE_JOB_CHUNK response',
      createRuntimeResponseGuard({
        optional: { complete: isBoolean, stagedBlobId: isStagedBlobId },
      })
    ),
  },
} satisfies PartialRuntimeRegistry;
