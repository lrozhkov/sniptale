import type { AiProvidersDeleteState } from './types';

export function getDeleteTargetId(confirmDelete: NonNullable<AiProvidersDeleteState>) {
  return confirmDelete.item.id;
}
