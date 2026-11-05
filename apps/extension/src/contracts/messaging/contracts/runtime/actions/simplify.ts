import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { parseSimplifySettings } from '../../../../../features/simplify/settings';
import {
  readSimplifyPngDimensions,
  type SimplifyCommand,
  type SimplifyCompletion,
  type RuntimeSimplifyRequestByType,
  type SimplifyResponse,
} from '../../runtime-message/simplify.types';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry';

const session = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9-]{1,128}$/.test(value);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 32768;
/** Validates the bounded computation payload without granting capture authority. */
export function isSimplifyCommand(value: unknown): value is SimplifyCommand {
  if (!isRecord(value)) return false;
  if (value['operation'] === 'prepare') return readSimplifyPngDimensions(value['dataUrl']) !== null;
  if (!session(value['sessionId'])) return false;
  if (value['operation'] === 'cancel' || value['operation'] === 'dispose') return true;
  const region = value['region'];
  return (
    value['operation'] === 'render' &&
    parseSimplifySettings(value['settings']) !== null &&
    isRecord(region) &&
    (region['rotation'] === undefined ||
      (typeof region['rotation'] === 'number' && Number.isFinite(region['rotation']))) &&
    integer(region['x']) &&
    integer(region['y']) &&
    integer(region['width']) &&
    integer(region['height']) &&
    region['width'] > 0 &&
    region['height'] > 0 &&
    region['width'] * region['height'] <= 16_777_216
  );
}
/** Validates Worker and offscreen completion values at each receiving boundary. */
export function isSimplifyCompletion(value: unknown): value is SimplifyCompletion {
  if (!isRecord(value)) return false;
  if (value['result'] === 'disposed') return Object.keys(value).length === 1;
  if (
    !session(value['sessionId']) ||
    !integer(value['width']) ||
    value['width'] < 1 ||
    !integer(value['height']) ||
    value['height'] < 1 ||
    value['width'] * value['height'] > 16_777_216 ||
    typeof value['version'] !== 'string' ||
    value['version'].length < 1 ||
    value['version'].length > 128
  )
    return false;
  if (value['dataUrl'] === undefined) return true;
  const dimensions = readSimplifyPngDimensions(value['dataUrl']);
  return dimensions?.width === value['width'] && dimensions.height === value['height'];
}
export function isSimplifyResponse(value: unknown): value is SimplifyResponse {
  if (!isRecord(value)) return false;
  if (value['success'] === false) return typeof value['error'] === 'string';
  if (value['success'] !== true) return false;
  const { success: _success, ...completion } = value;
  return isSimplifyCompletion(completion);
}
export const runtimeSimplifyContracts = {
  [MessageType.SIMPLIFY_COMMAND]: {
    parseRequest: createGuardParser(
      'runtime SIMPLIFY_COMMAND message',
      (
        value: unknown
      ): value is RuntimeSimplifyRequestByType[typeof MessageType.SIMPLIFY_COMMAND] =>
        isRecord(value) &&
        value['type'] === MessageType.SIMPLIFY_COMMAND &&
        isSimplifyCommand(value)
    ),
    parseResponse: createGuardParser('runtime SIMPLIFY_COMMAND response', isSimplifyResponse),
  },
  [MessageType.OFFSCREEN_SIMPLIFY_COMMAND]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_SIMPLIFY_COMMAND message',
      (
        value: unknown
      ): value is RuntimeSimplifyRequestByType[typeof MessageType.OFFSCREEN_SIMPLIFY_COMMAND] =>
        isRecord(value) &&
        value['type'] === MessageType.OFFSCREEN_SIMPLIFY_COMMAND &&
        typeof value['capabilityToken'] === 'string' &&
        session(value['sessionId']) &&
        isSimplifyCommand(value)
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_SIMPLIFY_COMMAND response',
      isSimplifyResponse
    ),
  },
} satisfies PartialRuntimeRegistry;
