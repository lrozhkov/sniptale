import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isString,
  isViewportRegion,
} from '../../../../validators/index';
import type { PartialRuntimeRegistry } from '../../../runtime-message.registry.ts';

const V = VideoMessageType;
const regionSelectionBindingGuard = {
  regionSelectionCapabilityToken: isString,
  regionSelectionRequestGeneration: isString,
  regionSelectionRequestId: isString,
};

export const runtimeVideoRegionSelectionEventContracts = {
  [V.REGION_SELECTED]: {
    parseRequest: createGuardParser(
      'runtime REGION_SELECTED message',
      createMessageGuard({
        type: V.REGION_SELECTED,
        required: { ...regionSelectionBindingGuard, region: isViewportRegion },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REGION_SELECTED response',
      createRuntimeResponseGuard()
    ),
  },
  [V.REGION_SELECTION_CANCELLED]: {
    parseRequest: createGuardParser(
      'runtime REGION_SELECTION_CANCELLED message',
      createMessageGuard({
        type: V.REGION_SELECTION_CANCELLED,
        required: regionSelectionBindingGuard,
      })
    ),
    parseResponse: createGuardParser(
      'runtime REGION_SELECTION_CANCELLED response',
      createRuntimeResponseGuard()
    ),
  },
} satisfies PartialRuntimeRegistry;
