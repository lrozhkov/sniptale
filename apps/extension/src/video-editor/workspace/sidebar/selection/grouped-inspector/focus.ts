import { createContext, useContext } from 'react';
import type { InspectorGroupDefinition } from './types';

export interface InspectorGroupFocusIntent {
  groupId: string;
  token: string;
}

export const InspectorGroupFocusContext = createContext<InspectorGroupFocusIntent | null>(null);

export function useInspectorGroupFocusIntent(): InspectorGroupFocusIntent | null {
  return useContext(InspectorGroupFocusContext);
}

export function resolveFocusedInspectorGroupId<TId extends string>(
  groups: readonly InspectorGroupDefinition<TId>[],
  focusIntent: InspectorGroupFocusIntent | null
): TId | null {
  if (!focusIntent) {
    return null;
  }

  return groups.find((group) => group.id === focusIntent.groupId)?.id ?? null;
}
