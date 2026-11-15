import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isCatalogCommand, isCatalogResponse } from '../../../../../features/editor/vector-catalog';
import type { RuntimeVectorCatalogRequestByType } from '../../runtime-message/vector-catalog.types';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry';
export const runtimeVectorCatalogContracts = {
  [MessageType.EDITOR_VECTOR_CATALOG_COMMAND]: {
    parseRequest: createGuardParser(
      'runtime vector catalog request',
      (
        value: unknown
      ): value is RuntimeVectorCatalogRequestByType[typeof MessageType.EDITOR_VECTOR_CATALOG_COMMAND] =>
        isRecord(value) &&
        value['type'] === MessageType.EDITOR_VECTOR_CATALOG_COMMAND &&
        isCatalogCommand(value)
    ),
    parseResponse: createGuardParser('runtime vector catalog response', isCatalogResponse),
  },
} satisfies PartialRuntimeRegistry;
