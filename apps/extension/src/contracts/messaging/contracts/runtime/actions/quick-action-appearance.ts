import type { RuntimeQuickActionAppearanceRequestByType } from '../../runtime-message/quick-action-appearance.types';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { parseWindowHeader, windowHeaderGeometry } from '@sniptale/runtime-contracts/window-header';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isRecord,
  isString,
} from '../../../validators';
import { isQuickActionHeaderRaster } from '../../runtime-message/quick-action-appearance.types';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry';

const dimension = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 32768;
const isSource = (value: unknown) =>
  isRecord(value) && dimension(value['width']) && dimension(value['height']);
export const runtimeQuickActionAppearanceContracts = {
  [MessageType.OFFSCREEN_QUICK_ACTION_HEADER]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_QUICK_ACTION_HEADER message',
      (
        value: unknown
      ): value is RuntimeQuickActionAppearanceRequestByType[typeof MessageType.OFFSCREEN_QUICK_ACTION_HEADER] => {
        const guard = createMessageGuard<
          typeof MessageType.OFFSCREEN_QUICK_ACTION_HEADER,
          RuntimeQuickActionAppearanceRequestByType[typeof MessageType.OFFSCREEN_QUICK_ACTION_HEADER]
        >({
          type: MessageType.OFFSCREEN_QUICK_ACTION_HEADER,
          required: {
            capabilityToken: isString,
            header: (header) => parseWindowHeader(header) !== null,
            source: isSource,
          },
          optional: { faviconWebsite: (address) => isString(address) && address.length <= 2048 },
        });
        if (!guard(value)) return false;
        const header = parseWindowHeader(value.header)!;
        const source = value.source;
        return source.width * Math.ceil(windowHeaderGeometry(header, source).height) <= 16_000_000;
      }
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_QUICK_ACTION_HEADER response',
      createRuntimeResponseGuard({ required: { dataUrl: isQuickActionHeaderRaster } })
    ),
  },
} satisfies PartialRuntimeRegistry;
