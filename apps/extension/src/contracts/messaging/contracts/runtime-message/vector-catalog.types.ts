import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { CatalogCommand, CatalogResponse } from '../../../../features/editor/vector-catalog';
export type RuntimeVectorCatalogRequestByType = {
  [MessageType.EDITOR_VECTOR_CATALOG_COMMAND]: CatalogCommand & {
    type: typeof MessageType.EDITOR_VECTOR_CATALOG_COMMAND;
  };
};
export type RuntimeVectorCatalogResponseByType = {
  [MessageType.EDITOR_VECTOR_CATALOG_COMMAND]: CatalogResponse;
};
